function isoDateDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

async function fetchJson(url: string) {
  const r = await fetch(url, { method: "GET", headers: { Accept: "application/json" } });
  const text = await r.text();
  if (!r.ok) throw new Error(`Request failed (${r.status}): ${text.slice(0, 400)}`);
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error(`Non-JSON response: ${text.slice(0, 200)}`);
  }
}

export async function fetchShopifyOrdersBackfill(weeksBackMax = 52): Promise<unknown[]> {
  const days = Math.max(1, Math.floor(weeksBackMax * 7));
  const createdAtMin = isoDateDaysAgo(days);
  const url = `/api/shopify/pull?createdAtMin=${encodeURIComponent(createdAtMin)}`;
  const json = await fetchJson(url) as { orders?: unknown };
  return Array.isArray(json?.orders) ? (json.orders as unknown[]) : [];
}

export async function fetchShopifyOrdersRefresh(refreshDays = 30): Promise<unknown[]> {
  const days = Math.max(1, Math.floor(refreshDays));
  const createdAtMin = isoDateDaysAgo(days);
  const url = `/api/shopify/pull?createdAtMin=${encodeURIComponent(createdAtMin)}`;
  const json = await fetchJson(url) as { orders?: unknown };
  return Array.isArray(json?.orders) ? (json.orders as unknown[]) : [];
}

