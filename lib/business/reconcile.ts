import type { ShopifyOrder } from "./shopifyOrders";

export type QboPaymentRow = {
  Id?: string;
  DocNumber?: string;
  TotalAmt?: number | string;
  TxnDate?: string;
  PrivateNote?: string;
};

function parseAmount(v: unknown): number {
  if (v == null) return NaN;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const n = Number(String(v).replace(/[$,\s]/g, ""));
  return Number.isFinite(n) ? n : NaN;
}

function dayKey(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

function daysBetween(a: string, b: string): number {
  const da = new Date(a).getTime();
  const db = new Date(b).getTime();
  if (Number.isNaN(da) || Number.isNaN(db)) return 999;
  return Math.abs(Math.round((da - db) / 86400000));
}

export type ReconcileMatch = {
  shopify: { id: number; name: string; created_at: string; total_price: string; currency: string };
  qbo: QboPaymentRow;
  amountDiff: number;
  daysDiff: number;
};

export function reconcileOrdersToPayments(
  orders: ShopifyOrder[],
  payments: QboPaymentRow[],
  opts?: { dateToleranceDays?: number; amountTolerance?: number },
): {
  matched: ReconcileMatch[];
  unmatchedShopify: ShopifyOrder[];
  unmatchedQbo: QboPaymentRow[];
} {
  const dateTol = opts?.dateToleranceDays ?? 3;
  const amtTol = opts?.amountTolerance ?? 0.02;

  const payLeft = [...payments];
  const matched: ReconcileMatch[] = [];
  const unmatchedShopify: ShopifyOrder[] = [];

  for (const o of orders) {
    const oAmt = parseAmount(o.total_price);
    const oDay = dayKey(o.created_at);
    if (!Number.isFinite(oAmt) || !oDay) {
      unmatchedShopify.push(o);
      continue;
    }

    let bestIdx = -1;
    let bestScore = Infinity;

    for (let i = 0; i < payLeft.length; i++) {
      const p = payLeft[i]!;
      const pAmt = parseAmount(p.TotalAmt);
      const pDay = p.TxnDate || "";
      if (!Number.isFinite(pAmt) || !pDay) continue;

      const dDiff = daysBetween(oDay, pDay);
      if (dDiff > dateTol) continue;

      const aDiff = Math.abs(oAmt - pAmt);
      const relTol = Math.max(0.02, Math.abs(oAmt) * 1e-4);
      if (aDiff > Math.max(amtTol, relTol)) continue;

      const score = dDiff * 1000 + aDiff;
      if (score < bestScore) {
        bestScore = score;
        bestIdx = i;
      }
    }

    if (bestIdx >= 0) {
      const p = payLeft.splice(bestIdx, 1)[0]!;
      const pAmt = parseAmount(p.TotalAmt);
      const pDay = p.TxnDate || "";
      matched.push({
        shopify: {
          id: o.id,
          name: o.name,
          created_at: o.created_at,
          total_price: o.total_price,
          currency: o.currency,
        },
        qbo: p,
        amountDiff: Math.abs(oAmt - pAmt),
        daysDiff: daysBetween(oDay, pDay),
      });
    } else {
      unmatchedShopify.push(o);
    }
  }

  return { matched, unmatchedShopify, unmatchedQbo: payLeft };
}
