import type { CleanOrderLine, Sku } from "../types";

/**
 * The pack-out rules that determine which box, how many liners, and how many gel packs
 * are used for a given Shopify order. Edit this function to change those rules.
 *
 * Returned quantities are per-component-id and are summed across all components used.
 *
 *   1–2 jars   → 8x8x8  box + 2× 8x8x8  liner + 1× 16oz gel
 *   3–4 jars   → 10x10  box + 2× 10x10  liner + 1× 16oz gel
 *   5–8 jars, ≤4 jars are 25oz → 12x12 box + 2× 12x12 liner + 2× 32oz gel
 *   5–8 jars, ≥5 jars are 25oz → 14x14 box + 2× 14x14 liner + 2× 32oz gel
 *   9–12 jars  → 14x14  box + 2× 14x14  liner + 2× 32oz gel
 *   13–15 jars → 14x14  box + 2× 14x14  liner + 2× 32oz gel
 *   16+ jars   → 14x14  box + 2× 14x14  liner + 2× 32oz gel  (extrapolated; rule not specified)
 */
export interface PackoutComponent {
  id: string;
  qty: number;
}

export function componentsForOrder(order: CleanOrderLine, skus: Sku[]): PackoutComponent[] {
  const totalJars = order.totalJars;
  if (totalJars <= 0) return [];

  // Count 25oz jars by walking the order's per-SKU units and looking up jar size.
  let jars25 = 0;
  for (const [skuId, qty] of Object.entries(order.units)) {
    const sku = skus.find((s) => s.id === skuId);
    if (sku?.jarOz === 25) jars25 += qty;
  }

  if (totalJars <= 2) {
    return [
      { id: "C8CB", qty: 1 },
      { id: "L8CB", qty: 2 },
      { id: "IP16", qty: 1 },
    ];
  }
  if (totalJars <= 4) {
    return [
      { id: "C10CB", qty: 1 },
      { id: "L10CB", qty: 2 },
      { id: "IP16", qty: 1 },
    ];
  }
  if (totalJars <= 8) {
    if (jars25 >= 5) {
      return [
        { id: "C14CB", qty: 1 },
        { id: "L14CB", qty: 2 },
        { id: "IP32", qty: 2 },
      ];
    }
    return [
      { id: "C12CB", qty: 1 },
      { id: "L12CB", qty: 2 },
      { id: "IP32", qty: 2 },
    ];
  }
  // 9+ jars: 14x14
  return [
    { id: "C14CB", qty: 1 },
    { id: "L14CB", qty: 2 },
    { id: "IP32", qty: 2 },
  ];
}
