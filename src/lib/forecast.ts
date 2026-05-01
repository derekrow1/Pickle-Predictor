import { addWeeks, format } from "date-fns";
import type { AppState, CleanOrderLine, MarketingEvent, AdSpendEntry, Settings, Sku } from "../types";
import { ISO, eachWeekStart, parseAnyDate, weekStart } from "./util";
import { componentsForOrder } from "./packoutRules";

export interface WeeklyDemandRow {
  weekStart: string; // ISO
  // Total jars per SKU
  unitsBySku: Record<string, number>;
  // Per-warehouse split per SKU
  unitsByWarehouseSku: Record<string, Record<string, number>>; // wh -> sku -> qty
  // Components consumed (assume 1:1 with jars / box, derived from average pack size)
  componentsByWarehouse: Record<string, Record<string, number>>; // wh -> compId -> qty
  totalJars: number;
  // Diagnostic stack
  baseline: number;
  seasonalityMul: number;
  adMul: number;
  eventMul: number;
}

export interface HistoricalWeek {
  weekStart: string;
  totalJars: number;
  unitsBySku: Record<string, number>;
  unitsByWarehouseSku: Record<string, Record<string, number>>;
}

export function aggregateHistoricalByWeek(orders: CleanOrderLine[]): HistoricalWeek[] {
  const map = new Map<string, HistoricalWeek>();
  for (const o of orders) {
    const d = parseAnyDate(o.date);
    if (!d) continue;
    const ws = ISO(weekStart(d));
    if (!map.has(ws)) {
      map.set(ws, {
        weekStart: ws,
        totalJars: 0,
        unitsBySku: {},
        unitsByWarehouseSku: {},
      });
    }
    const w = map.get(ws)!;
    for (const [sku, qty] of Object.entries(o.units)) {
      w.unitsBySku[sku] = (w.unitsBySku[sku] || 0) + qty;
      w.totalJars += qty;
      if (o.warehouseId) {
        if (!w.unitsByWarehouseSku[o.warehouseId]) w.unitsByWarehouseSku[o.warehouseId] = {};
        w.unitsByWarehouseSku[o.warehouseId][sku] =
          (w.unitsByWarehouseSku[o.warehouseId][sku] || 0) + qty;
      }
    }
  }
  return [...map.values()].sort((a, b) => a.weekStart.localeCompare(b.weekStart));
}

export function computeWarehouseMix(history: HistoricalWeek[], lookback: number): Record<string, number> {
  const recent = history.slice(-lookback);
  const totals: Record<string, number> = {};
  let sum = 0;
  for (const w of recent) {
    for (const [wh, perSku] of Object.entries(w.unitsByWarehouseSku)) {
      const t = Object.values(perSku).reduce((a, b) => a + b, 0);
      totals[wh] = (totals[wh] || 0) + t;
      sum += t;
    }
  }
  if (sum === 0) return {};
  const out: Record<string, number> = {};
  for (const [wh, t] of Object.entries(totals)) out[wh] = t / sum;
  return out;
}

export function computeBaselineByLookback(
  history: HistoricalWeek[],
  lookback: number,
): { totalJars: number; bySku: Record<string, number> } {
  const recent = history.slice(-lookback);
  if (recent.length === 0) return { totalJars: 0, bySku: {} };
  const bySku: Record<string, number> = {};
  let total = 0;
  for (const w of recent) {
    total += w.totalJars;
    for (const [s, q] of Object.entries(w.unitsBySku)) {
      bySku[s] = (bySku[s] || 0) + q;
    }
  }
  const n = recent.length;
  for (const k of Object.keys(bySku)) bySku[k] /= n;
  return { totalJars: total / n, bySku };
}

function seasonalityForWeek(d: Date, settings: Settings): number {
  const m = d.getMonth() + 1;
  const inSummer = m >= settings.summerStartMonth && m <= settings.summerEndMonth;
  return inSummer ? 1 + settings.summerSeasonalityPct : 1;
}

function eventMulForWeek(weekStartIso: string, events: MarketingEvent[], skuId?: string): number {
  let mul = 1;
  const wsDate = parseAnyDate(weekStartIso)!;
  const wsEnd = addWeeks(wsDate, 1);
  for (const e of events) {
    const d = parseAnyDate(e.date);
    if (!d) continue;
    if (d >= wsDate && d < wsEnd) {
      if (!e.affectedSkuIds || e.affectedSkuIds.length === 0 || (skuId && e.affectedSkuIds.includes(skuId))) {
        mul *= e.multiplier || 1;
      }
    }
  }
  return mul;
}

function adMulForWeek(weekStartIso: string, adSpend: AdSpendEntry[], settings: Settings): number {
  const total = adSpend
    .filter((a) => a.weekStart === weekStartIso)
    .reduce((a, b) => a + b.amount, 0);
  if (total <= 0) return 1;
  const overBaseline = Math.max(0, total - settings.adBaselineWeekly);
  const uplift = (overBaseline / 1000) * settings.adElasticity;
  return 1 + uplift;
}

export interface ForecastInput {
  history: HistoricalWeek[];
  settings: Settings;
  events: MarketingEvent[];
  adSpend: AdSpendEntry[];
  warehouseMix: Record<string, number>; // wh -> share
  weeksOut: number;
  fromDate?: Date; // default = next monday after last history week
}

export function forecastDemand(input: ForecastInput): WeeklyDemandRow[] {
  const { history, settings, events, adSpend, warehouseMix, weeksOut } = input;
  const baseline = computeBaselineByLookback(history, settings.forecastLookbackWeeks);

  const lastHist = history[history.length - 1]?.weekStart;
  const start =
    input.fromDate ||
    (lastHist ? addWeeks(parseAnyDate(lastHist)!, 1) : weekStart(new Date()));

  const weeks = eachWeekStart(start, weeksOut).map(ISO);
  const out: WeeklyDemandRow[] = [];

  let cumulativeGrowth = 1;
  for (let i = 0; i < weeks.length; i++) {
    const ws = weeks[i];
    cumulativeGrowth *= 1 + settings.weeklyGrowthRate;
    const seasonalityMul = seasonalityForWeek(parseAnyDate(ws)!, settings);
    const adMul = adMulForWeek(ws, adSpend, settings);

    const unitsBySku: Record<string, number> = {};
    const unitsByWarehouseSku: Record<string, Record<string, number>> = {};
    let total = 0;
    let evgAvg = 0;
    let countSku = 0;
    for (const [sku, base] of Object.entries(baseline.bySku)) {
      const evMul = eventMulForWeek(ws, events, sku);
      evgAvg += evMul;
      countSku++;
      const q = base * cumulativeGrowth * seasonalityMul * adMul * evMul;
      unitsBySku[sku] = q;
      total += q;
      for (const [wh, share] of Object.entries(warehouseMix)) {
        if (!unitsByWarehouseSku[wh]) unitsByWarehouseSku[wh] = {};
        unitsByWarehouseSku[wh][sku] = q * share;
      }
    }
    const eventMul = countSku ? evgAvg / countSku : 1;

    // Components: assume 1 box/liner/gel per order; rough mapping by jar count of order.
    // We simplify to: per warehouse, jars/2.5 ≈ orders, and apportion by typical pack sizes.
    // For v1 we surface jars; component math runs in orderEngine.ts for per-component recs.
    const componentsByWarehouse: Record<string, Record<string, number>> = {};

    out.push({
      weekStart: ws,
      unitsBySku,
      unitsByWarehouseSku,
      componentsByWarehouse,
      totalJars: total,
      baseline: baseline.totalJars * cumulativeGrowth,
      seasonalityMul,
      adMul,
      eventMul,
    });
  }
  return out;
}

/**
 * Estimate component consumption per warehouse per week using the pack-out rules
 * defined in packoutRules.ts. For each historical order we look up which box/liners/gels
 * were used and how many of each, then average across the lookback window.
 */
export function estimateComponentBaseline(
  cleanOrders: CleanOrderLine[],
  lookbackWeeks: number,
  warehouseIds: string[],
  skus: Sku[],
): Record<string, Record<string, number>> {
  const out: Record<string, Record<string, number>> = {};
  for (const w of warehouseIds) out[w] = {};

  // Identify the most recent N weeks of orders
  const allWeeks = new Set<string>();
  for (const o of cleanOrders) {
    const d = parseAnyDate(o.date);
    if (!d) continue;
    allWeeks.add(ISO(weekStart(d)));
  }
  const weeks = [...allWeeks].sort().slice(-lookbackWeeks);
  const weekSet = new Set(weeks);
  const weekCount = weeks.length || 1;

  // Sum component quantities per (warehouse, component) across the lookback
  const totals: Record<string, Record<string, number>> = {};
  for (const w of warehouseIds) totals[w] = {};

  for (const o of cleanOrders) {
    const d = parseAnyDate(o.date);
    if (!d) continue;
    const ws = ISO(weekStart(d));
    if (!weekSet.has(ws)) continue;
    const wh = o.warehouseId || warehouseIds[0];
    if (!totals[wh]) totals[wh] = {};
    const comps = componentsForOrder(o, skus);
    for (const c of comps) {
      totals[wh][c.id] = (totals[wh][c.id] || 0) + c.qty;
    }
  }

  for (const wh of warehouseIds) {
    for (const c of Object.keys(totals[wh] || {})) {
      out[wh][c] = totals[wh][c] / weekCount;
    }
  }
  return out;
}
