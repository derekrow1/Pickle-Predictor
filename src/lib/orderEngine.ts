import { addDays, addWeeks } from "date-fns";
import type {
  AppState,
  ComponentItem,
  InventorySnapshot,
  OpenPO,
  Settings,
  Sku,
  Warehouse,
} from "../types";
import { ISO, parseAnyDate, weekStart } from "./util";
import {
  aggregateHistoricalByWeek,
  computeBaselineByLookback,
  computeWarehouseMix,
  estimateComponentBaseline,
  forecastDemand,
} from "./forecast";
import type { HistoricalWeek, WeeklyDemandRow } from "./forecast";

export interface OrderRecRow {
  itemId: string;
  itemName: string;
  itemKind: "pickle" | "component";
  warehouseId: string;
  warehouseName: string;

  // Numbers
  weeklyDemand: number; // jars/units per week at this warehouse (forecast avg)
  onHand: number;
  onOrder: number;
  totalAvailable: number; // onHand + onOrder
  weeksOnHand: number;
  targetWeeks: number;
  reorderThresholdWeeks: number; // when weeks-on-hand drops below this, recommend a PO
  // The raw, exact demand-based recommendation (units, can be any integer)
  recommendedQty: number;
  // The actual quantity to order, rounded up to a multiple of orderMultiple
  toOrderQty: number;
  // Pallet/case unit info for display
  orderMultiple: number;
  orderUnitLabel: string;
  // Number of full pallets/cases the toOrderQty represents
  orderUnitCount: number;
  poByDate: string; // ISO
  expectedArrival: string; // ISO
  // Shelf-life cap (only applied for pickles)
  shelfLifeMaxOrderQty: number | null;
  shelfLifeBlocked: boolean;
  // True if rounding up to the order multiple pushed quantity past the shelf-life cap
  shelfLifeRoundingConflict: boolean;
  reasoning: string[];
  managedByMe: boolean;
}

export interface OrderEngineResult {
  recs: OrderRecRow[];
  warehouseMix: Record<string, number>;
  forecast: WeeklyDemandRow[];
  history: HistoricalWeek[];
  componentBaseline: Record<string, Record<string, number>>;
}

function findLatestSnapshot(snapshots: InventorySnapshot[]): InventorySnapshot | null {
  if (snapshots.length === 0) return null;
  return snapshots[snapshots.length - 1];
}

function onHandFor(snap: InventorySnapshot | null, itemId: string, warehouseId: string): number {
  if (!snap) return 0;
  return snap.rows
    .filter((r) => r.itemId === itemId && r.warehouseId === warehouseId)
    .reduce((a, b) => a + b.qty, 0);
}

function onOrderFor(pos: OpenPO[], itemId: string, warehouseId: string): number {
  let total = 0;
  for (const po of pos) {
    if (!po || po.warehouseId !== warehouseId) continue;
    if (po.status === "received") continue; // received POs no longer count as on-order
    // Defensive: handle legacy single-item POs that didn't have a lines array.
    const lines = Array.isArray(po.lines)
      ? po.lines
      : (po as any).itemId
      ? [{ itemId: (po as any).itemId, qty: (po as any).qty || 0 }]
      : [];
    for (const line of lines) {
      if (line && line.itemId === itemId) total += Number(line.qty) || 0;
    }
  }
  return total;
}

export function computeOrderRecs(state: AppState): OrderEngineResult {
  const settings = state.settings;
  const history = aggregateHistoricalByWeek(state.cleanOrders);
  const warehouseMix = computeWarehouseMix(history, settings.forecastLookbackWeeks);
  const baseline = computeBaselineByLookback(history, settings.forecastLookbackWeeks);
  const forecast = forecastDemand({
    history,
    settings,
    events: state.events,
    adSpend: state.adSpend,
    warehouseMix,
    weeksOut: 12,
  });
  // Average forecasted weekly demand across the next (lead+target) weeks for stability
  const weeksToConsider =
    settings.manufacturerLeadWeeks + Math.ceil(settings.shippingTransitDays / 7) + settings.pickleTargetWeeksOnHand;
  const fwd = forecast.slice(0, Math.max(weeksToConsider, 4));

  const fwdAvgBySku: Record<string, number> = {};
  for (const sku of Object.keys(baseline.bySku)) {
    let s = 0;
    for (const w of fwd) s += w.unitsBySku[sku] || 0;
    fwdAvgBySku[sku] = fwd.length ? s / fwd.length : 0;
  }

  const componentBaseline = estimateComponentBaseline(
    state.cleanOrders,
    settings.forecastLookbackWeeks,
    state.warehouses.map((w) => w.id),
    state.skus,
  );

  const snap = findLatestSnapshot(state.inventorySnapshots);
  const today = new Date();
  const recs: OrderRecRow[] = [];

  // Pickles
  for (const sku of state.skus.filter((s) => s.active)) {
    for (const wh of state.warehouses.filter((w) => w.active)) {
      const fwdAvgWh = fwd.reduce((acc, w) => acc + (w.unitsByWarehouseSku[wh.id]?.[sku.id] || 0), 0) / Math.max(fwd.length, 1);

      const rec = buildRec({
        itemKind: "pickle",
        itemId: sku.id,
        itemName: sku.name,
        warehouse: wh,
        managedByMe: true,
        weeklyDemand: fwdAvgWh,
        onHand: onHandFor(snap, sku.id, wh.id),
        onOrder: onOrderFor(state.openPOs, sku.id, wh.id),
        targetWeeks: settings.pickleTargetWeeksOnHand,
        minWeeks: settings.defaultMinWeeksOnHand,
        maxWeeks: settings.defaultMaxWeeksOnHand,
        leadWeeks: settings.manufacturerLeadWeeks,
        transitDays: settings.shippingTransitDays,
        today,
        applyShelfLife: true,
        settings,
        orderMultiple: sku.orderMultiple || 1,
        orderUnitLabel: sku.orderUnitLabel || "case",
      });
      recs.push(rec);
    }
  }

  // Components — only show recs for items I manage; show stocked-by-warehouse items too in inventory views (but no "order now" rec)
  // Service items (e.g. Freight) are excluded from inventory tracking and recommendations.
  for (const comp of state.components.filter((c) => c.category !== "service")) {
    for (const wh of state.warehouses.filter((w) => w.active)) {
      const baselineWeekly = componentBaseline[wh.id]?.[comp.id] ?? 0;
      // Apply growth/seasonality similar to pickle forecast (rough): use total baseline scaled by avg pickle-multiplier
      const scaler =
        forecast.length > 0
          ? forecast.slice(0, 6).reduce((a, b) => a + (b.totalJars / Math.max(baseline.totalJars, 1)), 0) / 6
          : 1;
      const weeklyDemand = baselineWeekly * (scaler || 1);

      const rec = buildRec({
        itemKind: "component",
        itemId: comp.id,
        itemName: comp.name,
        warehouse: wh,
        managedByMe: comp.managedByMe,
        weeklyDemand,
        onHand: onHandFor(snap, comp.id, wh.id),
        onOrder: onOrderFor(state.openPOs, comp.id, wh.id),
        targetWeeks: comp.targetWeeksOnHand,
        minWeeks: settings.defaultMinWeeksOnHand,
        maxWeeks: settings.defaultMaxWeeksOnHand,
        leadWeeks: 2, // components ship faster
        transitDays: 5,
        today,
        applyShelfLife: false,
        settings,
        orderMultiple: comp.orderMultiple || 1,
        orderUnitLabel: comp.orderUnitLabel || "pallet",
      });
      recs.push(rec);
    }
  }

  return { recs, warehouseMix, forecast, history, componentBaseline };
}

interface BuildRecArgs {
  itemKind: "pickle" | "component";
  itemId: string;
  itemName: string;
  warehouse: Warehouse;
  managedByMe: boolean;
  weeklyDemand: number;
  onHand: number;
  onOrder: number;
  targetWeeks: number;
  minWeeks: number;
  maxWeeks: number;
  leadWeeks: number;
  transitDays: number;
  today: Date;
  applyShelfLife: boolean;
  settings: Settings;
  orderMultiple: number;
  orderUnitLabel: string;
}

function buildRec(a: BuildRecArgs): OrderRecRow {
  const totalAvailable = a.onHand + a.onOrder;
  const weeksOnHand = a.weeklyDemand > 0 ? totalAvailable / a.weeklyDemand : 99;
  const reorderThresholdWeeks = a.leadWeeks + a.transitDays / 7 + 1; // restock before lead-time hits
  const targetStock = a.weeklyDemand * a.targetWeeks;
  const gap = Math.max(0, targetStock - totalAvailable);
  const reasoning: string[] = [];
  reasoning.push(`Forecast demand at ${a.warehouse.id}: ${a.weeklyDemand.toFixed(1)} units/week.`);
  reasoning.push(
    `Target stock = ${a.targetWeeks}w × ${a.weeklyDemand.toFixed(1)}/wk = ${(a.weeklyDemand * a.targetWeeks).toFixed(0)} units.`,
  );
  reasoning.push(
    `On hand ${a.onHand} + on order ${a.onOrder} = ${totalAvailable} (${weeksOnHand.toFixed(1)}w cover).`,
  );

  let recommendedQty = 0;
  if (a.weeklyDemand <= 0) {
    reasoning.push(`No demand observed — no order recommended.`);
  } else if (weeksOnHand >= reorderThresholdWeeks) {
    reasoning.push(
      `Cover (${weeksOnHand.toFixed(1)}w) ≥ reorder threshold (${reorderThresholdWeeks.toFixed(1)}w). Hold.`,
    );
  } else {
    recommendedQty = Math.ceil(gap);
    reasoning.push(`Gap to target = ${recommendedQty}.`);
  }

  // Shelf-life cap
  let shelfLifeMaxOrderQty: number | null = null;
  let shelfLifeBlocked = false;
  if (a.applyShelfLife && recommendedQty > 0) {
    // Shelf life check: when this order arrives, what life remains?
    // Life remaining at warehouse on arrival = totalShelfLife - leadWeeks - transitWeeks
    const transitWeeks = a.transitDays / 7;
    const arrivalLifeWeeks = a.settings.totalShelfLifeWeeks - a.leadWeeks - transitWeeks;
    // E-commerce: must reach customer with >= ecommerceMinWeeksAtCustomer.
    // Typical customer ship-time after arrival = current weeksOnHand-at-arrival - 0..target.
    // Conservative: ensure arrivalLifeWeeks - targetWeeks >= ecommerceMinWeeksAtCustomer
    const minLifeAtCustomer = a.settings.retailEnabled
      ? a.settings.totalShelfLifeWeeks * a.settings.retailFreshnessPct
      : a.settings.ecommerceMinWeeksAtCustomer;
    const usableLifeAtWarehouse = arrivalLifeWeeks - minLifeAtCustomer;
    if (usableLifeAtWarehouse <= 0) {
      shelfLifeBlocked = true;
      shelfLifeMaxOrderQty = 0;
      recommendedQty = 0;
      reasoning.push(
        `BLOCKED by shelf life: arrival life ${arrivalLifeWeeks.toFixed(1)}w − customer min ${minLifeAtCustomer.toFixed(1)}w ≤ 0.`,
      );
    } else {
      // Cap order so that you sell through it before usableLifeAtWarehouse
      const maxQty = Math.floor(a.weeklyDemand * usableLifeAtWarehouse);
      shelfLifeMaxOrderQty = maxQty;
      if (recommendedQty > maxQty) {
        reasoning.push(
          `Capped by shelf life: max ${maxQty} units (sell-through window ${usableLifeAtWarehouse.toFixed(1)}w).`,
        );
        recommendedQty = maxQty;
      } else {
        reasoning.push(
          `Shelf-life ok: ${arrivalLifeWeeks.toFixed(1)}w life at arrival, customer floor ${minLifeAtCustomer.toFixed(1)}w.`,
        );
      }
    }
  }

  // Compute the "to order" quantity by rounding up to a multiple of orderMultiple.
  // If recommendedQty > 0 but is less than one full pallet, round up to one pallet.
  const mult = a.orderMultiple > 1 ? a.orderMultiple : 1;
  let toOrderQty = 0;
  let shelfLifeRoundingConflict = false;
  if (recommendedQty > 0) {
    if (mult <= 1) {
      toOrderQty = recommendedQty;
    } else {
      toOrderQty = Math.max(mult, Math.ceil(recommendedQty / mult) * mult);
      reasoning.push(
        `Rounded up to ${mult}-unit ${a.orderUnitLabel || "pallet"}: ${toOrderQty} (${(toOrderQty / mult).toFixed(0)} ${a.orderUnitLabel || "pallet"}${toOrderQty / mult !== 1 ? "s" : ""}).`,
      );
      // If rounding pushes us above the shelf-life cap, flag it (don't silently drop the order)
      if (a.applyShelfLife && shelfLifeMaxOrderQty != null && toOrderQty > shelfLifeMaxOrderQty) {
        shelfLifeRoundingConflict = true;
        reasoning.push(
          `⚠ One pallet (${mult}) exceeds shelf-life cap (${shelfLifeMaxOrderQty}). Consider skipping this PO or accepting some risk of slow-moving stock.`,
        );
      }
    }
  }
  const orderUnitCount = mult > 1 && toOrderQty > 0 ? Math.round(toOrderQty / mult) : 0;

  // PO date logic: if cover < threshold, place today; else place when cover would drop to threshold.
  const today = a.today;
  let poByDate = today;
  if (weeksOnHand > reorderThresholdWeeks) {
    const weeksUntilReorder = weeksOnHand - reorderThresholdWeeks;
    poByDate = addDays(today, Math.floor(weeksUntilReorder * 7));
  }
  const expectedArrival = addDays(poByDate, a.leadWeeks * 7 + a.transitDays);

  return {
    itemId: a.itemId,
    itemName: a.itemName,
    itemKind: a.itemKind,
    warehouseId: a.warehouse.id,
    warehouseName: a.warehouse.name,
    weeklyDemand: a.weeklyDemand,
    onHand: a.onHand,
    onOrder: a.onOrder,
    totalAvailable,
    weeksOnHand,
    targetWeeks: a.targetWeeks,
    reorderThresholdWeeks,
    recommendedQty,
    toOrderQty,
    orderMultiple: mult,
    orderUnitLabel: a.orderUnitLabel || "",
    orderUnitCount,
    poByDate: ISO(poByDate),
    expectedArrival: ISO(expectedArrival),
    shelfLifeMaxOrderQty,
    shelfLifeBlocked,
    shelfLifeRoundingConflict,
    reasoning,
    managedByMe: a.managedByMe,
  };
}
