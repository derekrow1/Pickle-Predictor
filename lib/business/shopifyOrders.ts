import { defaultShopifyApiVersion, getShopifyAdminAccessToken, getShopifyShopDomain } from "./shopifyEnv";

export type ShopifyOrder = {
  id: number;
  name: string;
  created_at: string;
  total_price: string;
  currency: string;
  email: string | null;
  tags: string | null;
  source_name: string | null;
  financial_status: string | null;
  shipping_address?: { province_code?: string | null } | null;
  line_items?: Array<{
    title: string;
    sku: string | null;
    quantity: number;
    price: string;
  }>;
};

function json(res: Response): Promise<unknown> {
  return res.json();
}

function buildOrdersUrl({
  shop,
  apiVersion,
  createdAtMin,
  createdAtMax,
  pageInfo,
}: {
  shop: string;
  apiVersion: string;
  createdAtMin?: string | null;
  createdAtMax?: string | null;
  pageInfo?: string | null;
}): URL {
  const base = new URL(`https://${shop}/admin/api/${apiVersion}/orders.json`);
  base.searchParams.set("status", "any");
  base.searchParams.set("limit", "250");
  base.searchParams.set(
    "fields",
    [
      "id",
      "name",
      "created_at",
      "total_price",
      "currency",
      "email",
      "tags",
      "source_name",
      "financial_status",
      "shipping_address",
      "line_items",
    ].join(","),
  );
  if (createdAtMin) base.searchParams.set("created_at_min", createdAtMin);
  if (createdAtMax) base.searchParams.set("created_at_max", createdAtMax);
  if (pageInfo) base.searchParams.set("page_info", pageInfo);
  return base;
}

function parseNextPageInfo(linkHeader: string | null): string | null {
  if (!linkHeader) return null;
  const parts = linkHeader.split(",");
  for (const p of parts) {
    const part = p.trim();
    if (!part.includes('rel="next"')) continue;
    const match = part.match(/<([^>]+)>/);
    if (!match) continue;
    const url = new URL(match[1]);
    return url.searchParams.get("page_info");
  }
  return null;
}

export async function fetchAllShopifyOrders(opts: {
  createdAtMin?: string | null;
  createdAtMax?: string | null;
  maxPages?: number;
}): Promise<{ orders: ShopifyOrder[]; meta: { pages: number; apiVersion: string } }> {
  const shop = getShopifyShopDomain();
  const token = getShopifyAdminAccessToken();
  const apiVersion = defaultShopifyApiVersion();
  const maxPages = Math.max(1, Math.min(100, opts.maxPages ?? 50));

  const orders: ShopifyOrder[] = [];
  let pageInfo: string | null = null;
  let pages = 0;

  while (pages < maxPages) {
    const url = buildOrdersUrl({ shop, apiVersion, createdAtMin: opts.createdAtMin, createdAtMax: opts.createdAtMax, pageInfo });
    const r = await fetch(url.toString(), {
      headers: {
        "X-Shopify-Access-Token": token,
        "Content-Type": "application/json",
      },
    });

    if (!r.ok) {
      const body = await r.text();
      throw new Error(`Shopify request failed (${r.status}): ${body}`);
    }

    const data = (await json(r)) as { orders?: ShopifyOrder[] };
    const batch = Array.isArray(data?.orders) ? data.orders : [];
    orders.push(...batch);

    pageInfo = parseNextPageInfo(r.headers.get("link"));
    pages++;
    if (!pageInfo) break;
  }

  return { orders, meta: { pages, apiVersion } };
}
