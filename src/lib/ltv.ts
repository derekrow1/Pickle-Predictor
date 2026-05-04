export type CanonicalChannel = "Shopify" | "Amazon" | "TikTok" | "Other";

export type LtvOrder = {
  orderId: string;
  createdAt: string; // ISO
  email: string;
  total: number;
  source?: string | null;
  /** Shopify / Amazon / TikTok / Other — derived from raw Source + Tags */
  canonicalSource: CanonicalChannel;
  shippingProvince?: string | null;
  firstSku?: string | null;
  firstProductTitle?: string | null;
  /** True if this order looks like a subscription / recurring charge */
  isSubscriptionOrder: boolean;
  /** Set after enrichment: customer has ≥1 subscription-tagged order or customer CSV tags */
  isSubscriber?: boolean;
};

export type LtvBaseline = {
  purchasers: number;
  totalOrders: number;
  totalRevenue: number;
  aov: number;
  avgOrdersPerCustomer: number;
  reorderRate: number;
  avgDaysBetweenOrdersRepeaters: number | null;
  medianDaysBetweenOrdersRepeaters: number | null;
  churnRates: Record<number, number | null>;
  endDateISO: string | null;
  firstOrderDateISO: string | null;
  /** Customers with (as-of end) tenure ≥ matureMinTenureDays — used for “mature cohort” stats */
  maturePurchasers: number;
  matureMinTenureDays: number;
  /** How many customers placed exactly k orders (observed, all tenure) */
  orderHistogram: Array<{ k: number; customers: number }>;
  /** Same histogram among customers whose first order was ≥ matureMinTenureDays before end */
  orderHistogramMature: Array<{ k: number; customers: number }>;
  /** Simple projection: assume repeaters keep median gap; immature customers converge toward mature avg order count */
  orderHistogramProjected: Array<{ k: number; customers: number }>;
  projectionSummary: string;
  byChannel: Array<{
    channel: CanonicalChannel;
    purchasers: number;
    subscribers: number;
    nonSubscribers: number;
    reorderRate: number;
    aov: number;
  }>;
  byFirstSkuSubscriber: Array<{
    sku: string;
    segment: "Subscriber" | "Non-subscriber";
    purchasers: number;
    reorderRate: number;
    aov: number;
  }>;
};

export type LtvScenario = {
  horizonMonths: number;
  aov: number;
  expectedOrdersPerCustomer: number;
  marginPct: number;
};

export type LtvScenarioResult = {
  ltvRevenue: number;
  ltvProfit: number;
  breakEvenCAC: number;
};

export type LtvDashboard = {
  matureMinTenureDays: number;
  all: LtvBaseline;
  subscribers: LtvBaseline;
  nonSubscribers: LtvBaseline;
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const DEFAULT_MATURE_MIN_TENURE_DAYS = 90;

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

export function safeEmail(v: unknown) {
  return String(v ?? "").trim().toLowerCase();
}

/** Parse Shopify currency fields: "50.88", "$50.88", "1,234.56" */
export function parseMoneyField(v: unknown): number {
  if (v == null || v === "") return NaN;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const s = String(v).replace(/[$£€,\s]/g, "").trim();
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

function getField(row: Record<string, unknown>, ...keys: string[]): unknown {
  for (const k of keys) {
    if (k in row && row[k] != null && String(row[k]).trim() !== "") return row[k];
  }
  return undefined;
}

/** First non-empty value across line-item rows for the same order. */
function coalesceFieldFromGroup(group: Record<string, unknown>[], ...keys: string[]): unknown {
  for (const r of group) {
    const v = getField(r, ...keys);
    if (v != null && String(v).trim() !== "") return v;
  }
  return undefined;
}

/**
 * Shopify order CSV often uses `2026-04-30 14:38:19 -0600` (space, not `T`; offset without `:`).
 * `Date.parse` is unreliable for that shape across engines.
 */
export function parseShopifyExportDateCoerced(v: unknown): number | null {
  if (v == null) return null;
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v.getTime();
  if (typeof v === "number" && Number.isFinite(v)) {
    // Excel “serial date” when CSV is opened & saved in Excel (rough range)
    if (v > 20000 && v < 120000) {
      const epoch = Date.UTC(1899, 11, 30);
      const ms = epoch + v * MS_PER_DAY;
      if (Number.isFinite(ms)) return ms;
    }
  }
  return parseShopifyExportDateMs(String(v));
}

export function parseShopifyExportDateMs(raw: string): number | null {
  const s = raw.trim();
  if (!s) return null;

  let ms = Date.parse(s);
  if (Number.isFinite(ms)) return ms;

  // "YYYY-MM-DD HH:mm:ss -0600" or trailing " (America/Denver)" from some exports
  const stripped = s.replace(/\s*\([^)]*\)\s*$/, "").trim();
  const m = stripped.match(
    /^(\d{4}-\d{2}-\d{2})[ T](\d{1,2}:\d{2}:\d{2}(?:\.\d+)?)\s*([+-])(\d{2})(\d{2})$/,
  );
  if (m) {
    const iso = `${m[1]}T${m[2]}${m[3]}${m[4]}:${m[5]}`;
    ms = Date.parse(iso);
    if (Number.isFinite(ms)) return ms;
  }

  // "MM/DD/YYYY HH:mm:ss" (rare)
  const us = stripped.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}:\d{2}:\d{2}(?:\.\d+)?)/);
  if (us) {
    const iso = `${us[3]}-${us[1].padStart(2, "0")}-${us[2].padStart(2, "0")}T${us[4]}`;
    ms = Date.parse(iso);
    if (Number.isFinite(ms)) return ms;
  }

  return null;
}

/** Keep only paid (or partially paid) orders for LTV; empty = treat as ok (legacy exports). */
function financialStatusAllowsLtv(raw: unknown): boolean {
  const s = String(raw ?? "").trim().toLowerCase().replace(/\s+/g, " ");
  if (!s) return true;
  return s === "paid" || s === "partially paid";
}

/** Shopify line-item exports may interleave rows; pick the row that has order-level fields. */
function pickOrderHeaderRow(group: Record<string, unknown>[]): Record<string, unknown> {
  if (group.length === 1) return group[0];
  let best = group[0];
  let bestScore = -1;
  for (const r of group) {
    const email = getField(r, "Email", "email", "Contact Email");
    const fin = getField(r, "Financial Status", "Financial status", "financial_status");
    const total = getField(r, "Total", "total", "Total (USD)");
    const created = getField(r, "Created at", "Created At", "created_at", "Paid at", "Paid At");
    let score = 0;
    if (email != null && String(email).trim() !== "") score += 4;
    if (fin != null && String(fin).trim() !== "") score += 2;
    if (total != null && String(total).trim() !== "") score += 1;
    if (created != null && String(created).trim() !== "") score += 1;
    if (score > bestScore) {
      bestScore = score;
      best = r;
    }
  }
  return best;
}

export type ShopifyCsvParseStats = {
  inputRows: number;
  orderGroups: number;
  outputOrders: number;
  skippedUnpaid: number;
  skippedNoEmail: number;
  skippedBadTotal: number;
  skippedBadDate: number;
};

function median(nums: number[]) {
  if (nums.length === 0) return null;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Map raw Shopify `Source` (+ tags) into Shopify | Amazon | TikTok | Other */
export function mapCanonicalChannel(rawSource: string, tags: string): CanonicalChannel {
  const s = (rawSource || "").toLowerCase().trim();
  const t = (tags || "").toLowerCase();

  if (s.includes("amazon") || t.includes("amazon")) return "Amazon";
  if (s.includes("tiktok") || t.includes("tiktok")) return "TikTok";
  // DTC Shopify storefront, subscriptions, POS, drafts, etc.
  if (
    s === "web" ||
    s === "shopify_draft_order" ||
    s.includes("subscription") ||
    s.includes("shopify") ||
    s === "pos" ||
    s === "shopify_pos" ||
    s === "buy_button" ||
    s === "online_store" ||
    s === ""
  ) {
    return "Shopify";
  }
  return "Other";
}

/** Detect subscription / recurring order from order-level export row(s) */
export function detectSubscriptionOrder(first: Record<string, unknown>, group: Record<string, unknown>[]): boolean {
  const tagStr = String(first.Tags ?? "").toLowerCase();
  const src = String(first.Source ?? "").toLowerCase();
  const ship = String(first["Shipping Method"] ?? "").toLowerCase();
  const notes = String(first.Notes ?? "").toLowerCase();

  if (tagStr.includes("subscription")) return true;
  if (src.includes("subscription")) return true;
  if (ship.includes("subscription")) return true;
  if (notes.includes("subscription")) return true;

  for (const g of group) {
    const name = String(g["Lineitem name"] ?? "").toLowerCase();
    const lt = String(g.Tags ?? "").toLowerCase();
    if (name.includes("subscription") || lt.includes("subscription")) return true;
  }
  return false;
}

function buildHistogram(counts: Map<number, number>): Array<{ k: number; customers: number }> {
  if (counts.size === 0) return [];
  const maxK = Math.max(...counts.keys());
  const cap = Math.max(maxK, 1);
  const out: Array<{ k: number; customers: number }> = [];
  for (let k = 1; k <= cap; k++) {
    const c = counts.get(k) ?? 0;
    if (c > 0) out.push({ k, customers: c });
  }
  return out;
}

function addToHistogram(counts: Map<number, number>, orderCount: number) {
  const k = Math.max(1, orderCount);
  counts.set(k, (counts.get(k) ?? 0) + 1);
}

/**
 * Rough projection: repeaters add floor(horizonDays / medianGap) orders capped;
 * single-order immature customers partially “fill in” toward mature-segment avg order count.
 */
function projectHistogram(args: {
  byEmail: Map<string, LtvOrder[]>;
  endMs: number;
  horizonDays: number;
  medianGapDays: number | null;
  matureAvgOrders: number;
  matureMinTenureDays: number;
}): { projected: Array<{ k: number; customers: number }>; summary: string } {
  const { byEmail, endMs, horizonDays, medianGapDays, matureAvgOrders, matureMinTenureDays } = args;
  const counts = new Map<number, number>();
  const gap = medianGapDays && medianGapDays > 5 ? medianGapDays : 30;
  const extraOrders = Math.max(0, Math.floor(horizonDays / gap));

  for (const [, list] of byEmail.entries()) {
    const sorted = [...list].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const n = sorted.length;
    const firstMs = new Date(sorted[0].createdAt).getTime();
    const tenureDays = (endMs - firstMs) / MS_PER_DAY;
    const isMature = tenureDays >= matureMinTenureDays;

    let predicted = n;
    if (n >= 2) {
      predicted = n + extraOrders;
    } else if (n === 1 && !isMature) {
      // Immature one-timers: blend current count with mature cohort average (capped)
      const target = Math.max(n, Math.round(matureAvgOrders));
      predicted = Math.min(target, n + extraOrders + 1);
    }

    predicted = Math.max(1, Math.min(predicted, 60));
    addToHistogram(counts, predicted);
  }

  const projected = buildHistogram(counts);
  const summary = `Assumes repeaters add ~${extraOrders} order(s) over ${Math.round(horizonDays)}d at ~${gap.toFixed(0)}d between orders; immature 1× buyers are nudged toward the mature cohort avg (~${matureAvgOrders.toFixed(1)} orders).`;
  return { projected, summary };
}

function computeBaselineForOrders(orders: LtvOrder[], matureMinTenureDays: number): LtvBaseline {
  const sorted = [...orders].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const endDateISO = sorted.length ? sorted[sorted.length - 1].createdAt : null;
  const firstOrderDateISO = sorted.length ? sorted[0].createdAt : null;
  const endDate = endDateISO ? new Date(endDateISO).getTime() : null;

  const byEmail = new Map<string, LtvOrder[]>();
  for (const o of sorted) {
    if (!byEmail.has(o.email)) byEmail.set(o.email, []);
    byEmail.get(o.email)!.push(o);
  }

  const purchasers = byEmail.size;
  const totalOrders = sorted.length;
  const totalRevenue = sorted.reduce((a, b) => a + b.total, 0);
  const aov = totalOrders ? totalRevenue / totalOrders : 0;

  let repeaters = 0;
  let sumOrdersPerCustomer = 0;
  const gaps: number[] = [];
  const orderHist = new Map<number, number>();
  const orderHistMature = new Map<number, number>();
  let maturePurchasers = 0;

  for (const list of byEmail.values()) {
    sumOrdersPerCustomer += list.length;
    if (list.length >= 2) repeaters++;
    addToHistogram(orderHist, list.length);

    const firstMs = new Date(list[0].createdAt).getTime();
    const tenureDays = endDate ? (endDate - firstMs) / MS_PER_DAY : 0;
    if (tenureDays >= matureMinTenureDays) {
      maturePurchasers++;
      addToHistogram(orderHistMature, list.length);
    }

    for (let i = 1; i < list.length; i++) {
      const t0 = new Date(list[i - 1].createdAt).getTime();
      const t1 = new Date(list[i].createdAt).getTime();
      if (Number.isFinite(t0) && Number.isFinite(t1)) gaps.push((t1 - t0) / MS_PER_DAY);
    }
  }

  const immaturePurchasers = purchasers - maturePurchasers;
  const reorderRate = purchasers ? repeaters / purchasers : 0;
  const avgOrdersPerCustomer = purchasers ? sumOrdersPerCustomer / purchasers : 0;
  const avgDaysBetweenOrdersRepeaters = gaps.length ? gaps.reduce((a, b) => a + b, 0) / gaps.length : null;
  const medianDaysBetweenOrdersRepeaters = median(gaps);

  const matureList = [...byEmail.values()].filter((list) => {
    const firstMs = new Date(list[0].createdAt).getTime();
    return endDate ? (endDate - firstMs) / MS_PER_DAY >= matureMinTenureDays : false;
  });
  const matureAvgOrders =
    matureList.length > 0 ? matureList.reduce((a, l) => a + l.length, 0) / matureList.length : avgOrdersPerCustomer;

  const churnRates: Record<number, number | null> = {};
  const thresholds = [60, 90, 120] as const;
  for (const t of thresholds) {
    if (!endDate) {
      churnRates[t] = null;
      continue;
    }
    const eligible: { first: number; last: number }[] = [];
    for (const list of byEmail.values()) {
      const first = new Date(list[0].createdAt).getTime();
      const last = new Date(list[list.length - 1].createdAt).getTime();
      if (Number.isFinite(first) && Number.isFinite(last) && (endDate - first) / MS_PER_DAY >= t) {
        eligible.push({ first, last });
      }
    }
    if (eligible.length === 0) churnRates[t] = null;
    else {
      const churned = eligible.filter((x) => (endDate - x.last) / MS_PER_DAY >= t).length;
      churnRates[t] = churned / eligible.length;
    }
  }

  const repeaterEmails = new Set<string>();
  for (const [email, list] of byEmail.entries()) if (list.length >= 2) repeaterEmails.add(email);

  const subscriberEmails = new Set<string>();
  for (const [email, list] of byEmail.entries()) {
    if (list.some((o) => o.isSubscriptionOrder)) subscriberEmails.add(email);
  }

  const channelAgg = new Map<
    CanonicalChannel,
    { emails: Set<string>; orders: number; revenue: number; repeaters: Set<string>; sub: Set<string>; non: Set<string> }
  >();

  const skuAgg = new Map<
    string,
    {
      sub: { emails: Set<string>; orders: number; revenue: number; repeaters: Set<string> };
      non: { emails: Set<string>; orders: number; revenue: number; repeaters: Set<string> };
    }
  >();

  for (const o of sorted) {
    const ch = o.canonicalSource;
    if (!channelAgg.has(ch))
      channelAgg.set(ch, {
        emails: new Set(),
        orders: 0,
        revenue: 0,
        repeaters: new Set(),
        sub: new Set(),
        non: new Set(),
      });
    const c = channelAgg.get(ch)!;
    c.emails.add(o.email);
    c.orders += 1;
    c.revenue += o.total;
    if (repeaterEmails.has(o.email)) c.repeaters.add(o.email);
    if (subscriberEmails.has(o.email)) c.sub.add(o.email);
    else c.non.add(o.email);

    const sku = (o.firstSku || "unknown").trim() || "unknown";
    if (!skuAgg.has(sku)) {
      skuAgg.set(sku, {
        sub: { emails: new Set(), orders: 0, revenue: 0, repeaters: new Set() },
        non: { emails: new Set(), orders: 0, revenue: 0, repeaters: new Set() },
      });
    }
    const bucket = subscriberEmails.has(o.email) ? skuAgg.get(sku)!.sub : skuAgg.get(sku)!.non;
    bucket.emails.add(o.email);
    bucket.orders += 1;
    bucket.revenue += o.total;
    if (repeaterEmails.has(o.email)) bucket.repeaters.add(o.email);
  }

  const byChannel = (["Shopify", "Amazon", "TikTok", "Other"] as const)
    .map((channel) => {
      const v = channelAgg.get(channel);
      if (!v) {
        return { channel, purchasers: 0, subscribers: 0, nonSubscribers: 0, reorderRate: 0, aov: 0 };
      }
      return {
        channel,
        purchasers: v.emails.size,
        subscribers: v.sub.size,
        nonSubscribers: v.non.size,
        reorderRate: v.emails.size ? v.repeaters.size / v.emails.size : 0,
        aov: v.orders ? v.revenue / v.orders : 0,
      };
    })
    .filter((r) => r.purchasers > 0);

  const byFirstSkuSubscriber: LtvBaseline["byFirstSkuSubscriber"] = [];
  for (const [sku, { sub, non }] of skuAgg.entries()) {
    if (sub.emails.size > 0) {
      byFirstSkuSubscriber.push({
        sku,
        segment: "Subscriber",
        purchasers: sub.emails.size,
        reorderRate: sub.emails.size ? sub.repeaters.size / sub.emails.size : 0,
        aov: sub.orders ? sub.revenue / sub.orders : 0,
      });
    }
    if (non.emails.size > 0) {
      byFirstSkuSubscriber.push({
        sku,
        segment: "Non-subscriber",
        purchasers: non.emails.size,
        reorderRate: non.emails.size ? non.repeaters.size / non.emails.size : 0,
        aov: non.orders ? non.revenue / non.orders : 0,
      });
    }
  }
  byFirstSkuSubscriber.sort((a, b) => b.purchasers - a.purchasers);
  const topSkuRows = byFirstSkuSubscriber.slice(0, 24);

  const horizonDays = 365;
  const { projected, summary } =
    endDate != null
      ? projectHistogram({
          byEmail,
          endMs: endDate,
          horizonDays,
          medianGapDays: medianDaysBetweenOrdersRepeaters,
          matureAvgOrders,
          matureMinTenureDays,
        })
      : { projected: [], summary: "Load data to see projection." };

  return {
    purchasers,
    totalOrders,
    totalRevenue,
    aov,
    avgOrdersPerCustomer,
    reorderRate,
    avgDaysBetweenOrdersRepeaters,
    medianDaysBetweenOrdersRepeaters,
    churnRates,
    endDateISO,
    firstOrderDateISO,
    maturePurchasers,
    matureMinTenureDays,
    orderHistogram: buildHistogram(orderHist),
    orderHistogramMature: buildHistogram(orderHistMature),
    orderHistogramProjected: projected,
    projectionSummary: `${summary} Mature cohort = first order ≥ ${matureMinTenureDays}d before last export date (${maturePurchasers} customers; ${immaturePurchasers} still “ramping”).`,
    byChannel,
    byFirstSkuSubscriber: topSkuRows,
  };
}

export function computeDashboard(orders: LtvOrder[], matureMinTenureDays = DEFAULT_MATURE_MIN_TENURE_DAYS): LtvDashboard {
  const enriched = enrichSubscribers(orders);
  const subOrders = enriched.filter((o) => o.isSubscriber);
  const nonOrders = enriched.filter((o) => !o.isSubscriber);

  return {
    matureMinTenureDays,
    all: computeBaselineForOrders(enriched, matureMinTenureDays),
    subscribers: computeBaselineForOrders(subOrders, matureMinTenureDays),
    nonSubscribers: computeBaselineForOrders(nonOrders, matureMinTenureDays),
  };
}

/** Mark isSubscriber on every order row for that email if any order is subscription or customer CSV said so */
export function enrichSubscribers(orders: LtvOrder[]): LtvOrder[] {
  const by = new Map<string, LtvOrder[]>();
  for (const o of orders) {
    if (!by.has(o.email)) by.set(o.email, []);
    by.get(o.email)!.push(o);
  }
  const subEmails = new Set<string>();
  for (const [email, list] of by.entries()) {
    if (list.some((o) => o.isSubscriptionOrder)) subEmails.add(email);
  }
  return orders.map((o) => ({ ...o, isSubscriber: subEmails.has(o.email) }));
}

/** Mark subscription from customer export Tags (e.g. "Subscription Active") on all orders for that email. */
export function applyCustomerSubscriptionEmails(orders: LtvOrder[], subscriberEmails: Set<string>): LtvOrder[] {
  return orders.map((o) => ({
    ...o,
    isSubscriptionOrder: o.isSubscriptionOrder || subscriberEmails.has(o.email),
  }));
}

export function subscriberEmailsFromCustomerExport(rows: Record<string, unknown>[]): Set<string> {
  const s = new Set<string>();
  for (const r of rows) {
    const e = safeEmail(r.Email ?? r.email);
    if (!e) continue;
    const tags = String(r.Tags ?? "").toLowerCase();
    if (tags.includes("subscription")) s.add(e);
  }
  return s;
}

export function scenarioFromBaseline(b: LtvBaseline): LtvScenario {
  return {
    horizonMonths: 12,
    aov: Number.isFinite(b.aov) && b.aov > 0 ? b.aov : 45,
    expectedOrdersPerCustomer:
      Number.isFinite(b.avgOrdersPerCustomer) && b.avgOrdersPerCustomer > 0
        ? b.avgOrdersPerCustomer
        : 2.5,
    marginPct: 10,
  };
}

export function computeScenario(s: LtvScenario): LtvScenarioResult {
  clamp(s.horizonMonths, 1, 60);
  const aov = Math.max(0, s.aov);
  const expectedOrdersPerCustomer = Math.max(0, s.expectedOrdersPerCustomer);
  const margin = clamp(s.marginPct, 0, 100) / 100;
  const ltvRevenue = aov * expectedOrdersPerCustomer;
  const ltvProfit = ltvRevenue * margin;
  const breakEvenCAC = ltvProfit;
  return { ltvRevenue, ltvProfit, breakEvenCAC };
}

export function parseShopifyOrdersExportRows(rows: Record<string, unknown>[]): {
  orders: LtvOrder[];
  stats: ShopifyCsvParseStats;
} {
  const stats: ShopifyCsvParseStats = {
    inputRows: rows.length,
    orderGroups: 0,
    outputOrders: 0,
    skippedUnpaid: 0,
    skippedNoEmail: 0,
    skippedBadTotal: 0,
    skippedBadDate: 0,
  };

  const hasId = rows.some((r) => String(getField(r as Record<string, unknown>, "Id", "id", "ID") ?? "").trim() !== "");
  const orderIdKey = hasId ? "Id" : "Name";

  const byId = new Map<string, Record<string, unknown>[]>();
  for (const r of rows) {
    const row = r as Record<string, unknown>;
    const id = String(getField(row, orderIdKey, orderIdKey === "Id" ? "Name" : "Id") ?? "").trim();
    if (!id) continue;
    if (!byId.has(id)) byId.set(id, []);
    byId.get(id)!.push(row);
  }

  stats.orderGroups = byId.size;
  const out: LtvOrder[] = [];

  for (const [orderId, group] of byId.entries()) {
    const first = pickOrderHeaderRow(group as Record<string, unknown>[]);
    const financialRaw = coalesceFieldFromGroup(group as Record<string, unknown>[], "Financial Status", "Financial status", "financial_status");
    if (!financialStatusAllowsLtv(financialRaw)) {
      stats.skippedUnpaid++;
      continue;
    }

    const email = safeEmail(coalesceFieldFromGroup(group as Record<string, unknown>[], "Email", "email", "Contact Email"));
    if (!email) {
      stats.skippedNoEmail++;
      continue;
    }

    const createdRaw = coalesceFieldFromGroup(
      group as Record<string, unknown>[],
      "Created at",
      "Created At",
      "created_at",
      "Paid at",
      "Paid At",
    );
    const tMs = parseShopifyExportDateCoerced(createdRaw);
    const createdAt = tMs != null && Number.isFinite(tMs) ? new Date(tMs).toISOString() : "";
    if (!createdAt) {
      stats.skippedBadDate++;
      continue;
    }

    const total = parseMoneyField(coalesceFieldFromGroup(group as Record<string, unknown>[], "Total", "total", "Total (USD)"));
    if (!Number.isFinite(total)) {
      stats.skippedBadTotal++;
      continue;
    }

    const rawSource = String(
      coalesceFieldFromGroup(group as Record<string, unknown>[], "Source", "Source Name", "source_name") ?? "",
    ).trim();
    const tags = String(coalesceFieldFromGroup(group as Record<string, unknown>[], "Tags", "tags") ?? "");
    const canonicalSource = mapCanonicalChannel(rawSource, tags);
    const shippingProvince = String(
      coalesceFieldFromGroup(group as Record<string, unknown>[], "Shipping Province", "Shipping Province Name") ?? "",
    ).trim();
    const isSubscriptionOrder = detectSubscriptionOrder(first, group as Record<string, unknown>[]);

    const skuRow = group.find((g) => String((g as Record<string, unknown>)?.["Lineitem sku"] ?? "").trim());
    const firstSku = skuRow ? String((skuRow as Record<string, unknown>)["Lineitem sku"]).trim() : null;
    const firstProductTitle = skuRow
      ? String((skuRow as Record<string, unknown>)["Lineitem name"] ?? "").trim()
      : null;

    out.push({
      orderId,
      createdAt,
      email,
      total,
      source: rawSource || null,
      canonicalSource,
      shippingProvince: shippingProvince || null,
      firstSku,
      firstProductTitle,
      isSubscriptionOrder,
    });
    stats.outputOrders++;
  }

  out.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return { orders: out, stats };
}

export function normalizeShopifyApiOrders(orders: unknown[]): LtvOrder[] {
  const out: LtvOrder[] = [];
  for (const o of orders || []) {
    const rec = o as Record<string, unknown>;
    const financial = String(rec?.financial_status ?? "").trim().toLowerCase();
    if (financial && financial !== "paid") continue;

    const orderId = String(rec?.id ?? "").trim();
    const createdAt = String(rec?.created_at ?? "").trim();
    const email = safeEmail(rec?.email);
    const total = Number(rec?.total_price ?? NaN);
    const rawSource = String(rec?.source_name ?? "").trim();
    const tags = String(rec?.tags ?? "");
    const canonicalSource = mapCanonicalChannel(rawSource, tags);
    const shippingProvince = (rec?.shipping_address as { province_code?: string } | null)?.province_code ?? null;
    const tagLower = tags.toLowerCase();
    const srcLower = rawSource.toLowerCase();
    const isSubscriptionOrder =
      tagLower.includes("subscription") ||
      srcLower.includes("subscription") ||
      (Array.isArray(rec?.line_items) &&
        (rec.line_items as { title?: string }[]).some((li) => String(li?.title ?? "").toLowerCase().includes("subscription")));

    const lineItems: unknown[] = Array.isArray(rec?.line_items) ? (rec.line_items as unknown[]) : [];
    const li = (lineItems.find((x) => String((x as { sku?: string })?.sku ?? "").trim()) ??
      lineItems[0]) as { sku?: string; title?: string } | null;
    const firstSku = li ? (String(li?.sku ?? "").trim() || null) : null;
    const firstProductTitle = li ? (String(li?.title ?? "").trim() || null) : null;

    const t = createdAt ? Date.parse(createdAt) : NaN;
    if (!orderId || !createdAt || !Number.isFinite(t) || !email || !Number.isFinite(total)) continue;
    out.push({
      orderId,
      createdAt: new Date(t).toISOString(),
      email,
      total,
      source: rawSource || null,
      canonicalSource,
      shippingProvince: shippingProvince ? String(shippingProvince) : null,
      firstSku,
      firstProductTitle,
      isSubscriptionOrder,
    });
  }
  out.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return out;
}
