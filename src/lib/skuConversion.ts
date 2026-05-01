import data from "./sku-conversion-data.json";

export type SkuConversionRow = {
  sku: string;
  HDW25?: number;
  SDW25?: number;
  HDS19?: number;
  SDS19?: number;
  GJS19?: number;
  Merch?: number;
};

export const SKU_CONVERSION: SkuConversionRow[] = data as SkuConversionRow[];

// Build a quick lookup map. Match exact, then by lowercase, then by stripped/normalized.
function norm(s: string) {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

const exact = new Map<string, SkuConversionRow>();
const byNorm = new Map<string, SkuConversionRow>();

for (const row of SKU_CONVERSION) {
  exact.set(row.sku, row);
  byNorm.set(norm(row.sku), row);
}

export function lookupSku(rawSku: string | null | undefined): SkuConversionRow | null {
  if (!rawSku) return null;
  const s = String(rawSku).trim();
  if (!s) return null;
  if (exact.has(s)) return exact.get(s)!;
  const n = norm(s);
  if (byNorm.has(n)) return byNorm.get(n)!;
  return null;
}

// Given a raw shopify line item SKU and quantity, return jars per pickle SKU
export function expandLineItem(
  rawSku: string,
  qty: number,
): { units: Record<string, number>; merch: number; matched: boolean } {
  const row = lookupSku(rawSku);
  const units: Record<string, number> = {};
  let merch = 0;
  if (!row) {
    return { units, merch, matched: false };
  }
  for (const k of ["HDW25", "SDW25", "HDS19", "SDS19", "GJS19"] as const) {
    if (row[k]) units[k] = (units[k] || 0) + (row[k] || 0) * qty;
  }
  if (row.Merch) merch += row.Merch * qty;
  return { units, merch, matched: true };
}
