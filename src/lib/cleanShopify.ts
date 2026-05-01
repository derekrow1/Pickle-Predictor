import type { CleanOrderLine } from "../types";
import { expandLineItem } from "./skuConversion";
import { ISO, parseAnyDate } from "./util";

const norm = (s: any) => (s == null ? "" : String(s).trim());

function pickField(row: any, candidates: string[]): any {
  for (const k of candidates) {
    if (k in row) return row[k];
    // case-insensitive fallback
    const lower = k.toLowerCase();
    for (const key of Object.keys(row)) {
      if (key.toLowerCase() === lower) return row[key];
    }
  }
  return undefined;
}

export interface CleanShopifyResult {
  clean: CleanOrderLine[];
  unmatchedSkus: { sku: string; count: number }[];
  warnings: string[];
}

/**
 * Convert raw Shopify export rows into clean per-order rows.
 * The raw export has multiple rows per order (one per line item); we group by Name,
 * use the first row's order-level totals, and aggregate line items into per-SKU jars.
 */
export function cleanShopifyRows(
  raw: any[],
  stateToWarehouse: Record<string, string>,
): CleanShopifyResult {
  const grouped = new Map<string, any[]>();
  const warnings: string[] = [];

  for (const r of raw) {
    const name = norm(pickField(r, ["Name", "Order Name", "name"]));
    if (!name) continue;
    if (!grouped.has(name)) grouped.set(name, []);
    grouped.get(name)!.push(r);
  }

  const unmatchedCounts = new Map<string, number>();
  const clean: CleanOrderLine[] = [];

  for (const [name, rows] of grouped) {
    // Pick a "header" row that has totals — usually the first row of the order
    const head = rows[0];
    const paidAt = parseAnyDate(
      pickField(head, ["Paid at", "Paid Date", "Created at", "Date"]),
    );
    if (!paidAt) {
      // skip rows we can't date
      warnings.push(`Order ${name} skipped — no parseable date.`);
      continue;
    }
    const status = norm(pickField(head, ["Financial Status"]));
    if (status && !["paid", "partially_refunded"].includes(status.toLowerCase())) {
      // skip pending/voided/refunded for forecast/sales math
      continue;
    }
    const shipping = num(pickField(head, ["Shipping"]));
    const taxes = num(pickField(head, ["Taxes"]));
    const total = num(pickField(head, ["Total"]));
    const discount = num(pickField(head, ["Discount Amount"]));
    const province = norm(pickField(head, [
      "Shipping Province",
      "Shipping Province Name",
      "Billing Province",
    ])).toUpperCase();
    const warehouseId = stateToWarehouse[province] || undefined;

    // Aggregate line items for this order
    const units: Record<string, number> = {};
    let merchQty = 0;
    let merchValue = 0;
    let pickleValue = 0;

    for (const r of rows) {
      const lineSku = norm(pickField(r, ["Lineitem sku", "Lineitem SKU"]));
      const qty = num(pickField(r, ["Lineitem quantity"]));
      const price = num(pickField(r, ["Lineitem price"]));
      if (!lineSku || !qty) continue;
      const exp = expandLineItem(lineSku, qty);
      if (!exp.matched) {
        unmatchedCounts.set(lineSku, (unmatchedCounts.get(lineSku) || 0) + qty);
        continue;
      }
      for (const [k, v] of Object.entries(exp.units)) {
        units[k] = (units[k] || 0) + v;
      }
      merchQty += exp.merch;
      // Rough split: merch lines have non-zero merch count, otherwise treat as pickle line
      const lineRevenue = qty * price;
      if (exp.merch > 0) merchValue += lineRevenue;
      else pickleValue += lineRevenue;
    }

    const totalJars = Object.values(units).reduce((a, b) => a + b, 0);

    clean.push({
      orderName: name,
      date: ISO(paidAt),
      shippingState: province || undefined,
      warehouseId,
      units,
      totalJars,
      merchQty,
      merchValue,
      pickleValue,
      shippingValue: shipping,
      taxValue: taxes,
      discountValue: discount,
      orderValue: total,
    });
  }

  // Sort by date
  clean.sort((a, b) => a.date.localeCompare(b.date));

  const unmatchedSkus = [...unmatchedCounts.entries()]
    .map(([sku, count]) => ({ sku, count }))
    .sort((a, b) => b.count - a.count);

  return { clean, unmatchedSkus, warnings };
}

function num(v: unknown): number {
  if (v == null || v === "") return 0;
  if (typeof v === "number") return v;
  const s = String(v).replace(/[$,]/g, "").trim();
  const n = parseFloat(s);
  return isFinite(n) ? n : 0;
}

export const _testHelpers = { num, pickField };
