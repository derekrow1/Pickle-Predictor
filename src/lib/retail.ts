import type { AppState, InitialFill, RetailVelocity } from "../types";
import { ISO, eachWeekStart, parseAnyDate, weekStart } from "./util";

/**
 * Retail demand forecast: per SKU per upcoming week.
 *
 * Combines:
 *   - sustained weekly velocity (sum of active retailers' velocities for the SKU)
 *   - one-time initial fills (each fill counts in the week of its fillDate)
 *
 * Returns rows shaped { weekStart, bySku: { [skuId]: jars } } for the next N weeks.
 */
export interface RetailWeekRow {
  weekStart: string; // ISO Monday
  bySku: Record<string, number>;
  // Initial-fill events landing in this week, surfaced for UI labeling
  fills: { retailerId: string; skuId: string; qty: number; fillDate: string }[];
  // Sustained velocity (without initial fills) for the week
  velocityBySku: Record<string, number>;
}

export function sustainedVelocityBySku(
  velocities: RetailVelocity[],
  retailerActiveById: Record<string, boolean>,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const v of velocities) {
    if (retailerActiveById[v.retailerId] === false) continue;
    out[v.skuId] = (out[v.skuId] || 0) + (Number(v.weeklyVelocity) || 0);
  }
  return out;
}

export function retailWeeklyDemand(
  state: AppState,
  weeksOut: number,
  fromDate?: Date,
): RetailWeekRow[] {
  const start = fromDate ? weekStart(fromDate) : weekStart(new Date());
  const weeks = eachWeekStart(start, weeksOut).map(ISO);
  const activeMap: Record<string, boolean> = {};
  for (const r of state.retailers) activeMap[r.id] = r.active;

  const velocityBySku = sustainedVelocityBySku(state.retailVelocities, activeMap);

  const out: RetailWeekRow[] = weeks.map((ws) => ({
    weekStart: ws,
    bySku: { ...velocityBySku },
    fills: [],
    velocityBySku: { ...velocityBySku },
  }));

  // Bucket initial fills into the week containing fillDate
  for (const f of state.initialFills) {
    if (f.fulfilled) continue;
    if (activeMap[f.retailerId] === false) continue;
    const d = parseAnyDate(f.fillDate);
    if (!d) continue;
    const ws = ISO(weekStart(d));
    const row = out.find((r) => r.weekStart === ws);
    if (!row) continue; // outside the window
    for (const line of f.lines) {
      if (!line.skuId || !line.qty) continue;
      row.bySku[line.skuId] = (row.bySku[line.skuId] || 0) + line.qty;
      row.fills.push({
        retailerId: f.retailerId,
        skuId: line.skuId,
        qty: line.qty,
        fillDate: f.fillDate,
      });
    }
  }

  return out;
}

/** Sum of weekly velocity per SKU across all active retailers. */
export function totalWeeklyVelocityBySku(state: AppState): Record<string, number> {
  const activeMap: Record<string, boolean> = {};
  for (const r of state.retailers) activeMap[r.id] = r.active;
  return sustainedVelocityBySku(state.retailVelocities, activeMap);
}

/** Returns initial fills that haven't been marked fulfilled yet, sorted by date. */
export function pendingInitialFills(state: AppState): InitialFill[] {
  return state.initialFills
    .filter((f) => !f.fulfilled)
    .sort((a, b) => a.fillDate.localeCompare(b.fillDate));
}
