import type { AppState, InventorySnapshot, InventorySnapshotRow } from "../types";
import { parseAnyDate, ISO } from "./util";
import { componentsForOrder } from "./packoutRules";

type Key = string;
const keyOf = (warehouseId: string, itemId: string): Key => `${warehouseId}|${itemId}`;

export function adjustedSnapshotForCurrent(
  state: AppState,
  snap: InventorySnapshot,
): { snapshot: InventorySnapshot; consumption: Map<Key, number> } {
  const baseDate = parseAnyDate(snap.date);
  const baseIso = baseDate ? ISO(baseDate) : snap.date.slice(0, 10);

  // Start with base snapshot quantities.
  const qty = new Map<Key, number>();
  for (const r of snap.rows) {
    qty.set(keyOf(r.warehouseId, r.itemId), (qty.get(keyOf(r.warehouseId, r.itemId)) || 0) + (Number(r.qty) || 0));
  }

  // Compute consumption since snapshot date (inclusive-exclusive: strictly after snapshot date).
  const consumption = new Map<Key, number>();
  for (const o of state.cleanOrders) {
    const d = (o.date || "").slice(0, 10);
    if (!d || d <= baseIso) continue;
    const wh = o.warehouseId || "";
    if (!wh) continue;

    // Pickles: per SKU jars.
    for (const [skuId, jars] of Object.entries(o.units || {})) {
      const used = Number(jars) || 0;
      if (used <= 0) continue;
      const k = keyOf(wh, skuId);
      consumption.set(k, (consumption.get(k) || 0) + used);
    }

    // Components: packout rules (boxes/liners/gel).
    const comps = componentsForOrder(o, state.skus);
    for (const c of comps) {
      const used = Number(c.qty) || 0;
      if (used <= 0) continue;
      const k = keyOf(wh, c.id);
      consumption.set(k, (consumption.get(k) || 0) + used);
    }
  }

  // Apply consumption.
  for (const [k, used] of consumption) {
    qty.set(k, (qty.get(k) || 0) - used);
  }

  // Emit a snapshot-shaped structure.
  const rows: InventorySnapshotRow[] = [];
  for (const [k, v] of qty) {
    const [warehouseId, itemId] = k.split("|");
    rows.push({ warehouseId, itemId, qty: v });
  }
  return { snapshot: { date: snap.date, rows }, consumption };
}

export function diffSnapshots(
  expected: InventorySnapshot,
  uploaded: InventorySnapshot,
): Array<{ warehouseId: string; itemId: string; expected: number; uploaded: number; delta: number }> {
  const map = new Map<Key, number>();
  for (const r of expected.rows) map.set(keyOf(r.warehouseId, r.itemId), (map.get(keyOf(r.warehouseId, r.itemId)) || 0) + (Number(r.qty) || 0));
  const out: Array<{ warehouseId: string; itemId: string; expected: number; uploaded: number; delta: number }> = [];
  for (const r of uploaded.rows) {
    const k = keyOf(r.warehouseId, r.itemId);
    const e = map.get(k) || 0;
    const u = Number(r.qty) || 0;
    const delta = u - e;
    if (delta !== 0) out.push({ warehouseId: r.warehouseId, itemId: r.itemId, expected: e, uploaded: u, delta });
    map.delete(k);
  }
  // Items expected but missing from upload
  for (const [k, e] of map) {
    const [warehouseId, itemId] = k.split("|");
    out.push({ warehouseId, itemId, expected: e, uploaded: 0, delta: -e });
  }
  out.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  return out;
}

