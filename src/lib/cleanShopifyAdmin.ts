import type { CleanOrderLine } from "../types";
import { expandLineItem } from "./skuConversion";
import { ISO, parseAnyDate } from "./util";

function num(v: unknown): number {
  if (v == null || v === "") return 0;
  if (typeof v === "number") return v;
  const s = String(v).replace(/[$,]/g, "").trim();
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

function pickProvinceCode(order: unknown): string | undefined {
  const o = order as any;
  const code =
    o?.shipping_address?.province_code ||
    o?.shipping_address?.province ||
    o?.billing_address?.province_code ||
    o?.billing_address?.province;
  const s = String(code || "").trim().toUpperCase();
  return s ? s : undefined;
}

function pickDate(order: unknown): Date | null {
  const o = order as any;
  const d =
    parseAnyDate(o?.processed_at) ||
    parseAnyDate(o?.created_at) ||
    parseAnyDate(o?.updated_at);
  return d || null;
}

function isIncludedFinancialStatus(order: unknown): boolean {
  const o = order as any;
  const s = String(o?.financial_status || "").toLowerCase();
  return !s || s === "paid" || s === "partially_refunded";
}

function shippingAmount(order: unknown): number {
  const o = order as any;
  // Prefer explicit totals when present; fallback to summed shipping_lines.
  const fromSet =
    o?.total_shipping_price_set?.shop_money?.amount ??
    o?.total_shipping_price_set?.presentment_money?.amount;
  if (fromSet != null) return num(fromSet);
  const lines = Array.isArray(o?.shipping_lines) ? o.shipping_lines : [];
  return lines.reduce((a: number, l: any) => a + num(l?.price), 0);
}

export function cleanShopifyAdminOrders(
  orders: unknown[],
  stateToWarehouse: Record<string, string>,
): { clean: CleanOrderLine[]; unmatchedSkus: { sku: string; count: number }[]; warnings: string[] } {
  const warnings: string[] = [];
  const unmatchedCounts = new Map<string, number>();
  const clean: CleanOrderLine[] = [];

  for (const o of orders || []) {
    const ord = o as any;
    if (!isIncludedFinancialStatus(o)) continue;

    const date = pickDate(o);
    if (!date) {
      warnings.push(`Order ${String(ord?.name || ord?.id || "?")} skipped — no parseable date.`);
      continue;
    }

    const name = String(ord?.name || ord?.order_number || ord?.id || "").trim();
    if (!name) continue;

    const province = pickProvinceCode(o);
    const warehouseId = province ? stateToWarehouse[province] || undefined : undefined;

    const units: Record<string, number> = {};
    let merchQty = 0;
    let merchValue = 0;
    let pickleValue = 0;

    const items = Array.isArray(ord?.line_items) ? ord.line_items : [];
    for (const li of items) {
      const sku = String(li?.sku || "").trim();
      const qty = Number(li?.quantity || 0) || 0;
      const price = num(li?.price);
      if (!sku || !qty) continue;

      const exp = expandLineItem(sku, qty);
      if (!exp.matched) {
        unmatchedCounts.set(sku, (unmatchedCounts.get(sku) || 0) + qty);
        continue;
      }
      for (const [k, v] of Object.entries(exp.units)) {
        units[k] = (units[k] || 0) + v;
      }
      merchQty += exp.merch;

      const lineRevenue = qty * price;
      if (exp.merch > 0) merchValue += lineRevenue;
      else pickleValue += lineRevenue;
    }

    const totalJars = Object.values(units).reduce((a, b) => a + b, 0);

    clean.push({
      orderId: typeof ord?.id === "number" ? ord.id : undefined,
      orderName: name,
      date: ISO(date),
      shippingState: province,
      warehouseId,
      units,
      totalJars,
      merchQty,
      merchValue,
      pickleValue,
      shippingValue: shippingAmount(o),
      taxValue: num(ord?.total_tax),
      discountValue: num(ord?.total_discounts),
      orderValue: num(ord?.total_price),
    });
  }

  clean.sort((a, b) => a.date.localeCompare(b.date));
  const unmatchedSkus = [...unmatchedCounts.entries()]
    .map(([sku, count]) => ({ sku, count }))
    .sort((a, b) => b.count - a.count);

  return { clean, unmatchedSkus, warnings };
}

