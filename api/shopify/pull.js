function shopifyApiVersion() {
  return String(process.env.SHOPIFY_API_VERSION || "2026-04").trim();
}

function normalizeShop(shop) {
  if (!shop) return "";
  let s = String(shop).trim();
  s = s.replace(/^https?:\/\//, "");
  s = s.replace(/\/.*$/, "");
  return s;
}

function getShopAndToken(req) {
  const shop = normalizeShop((req.query && req.query.shop) || process.env.SHOPIFY_SHOP_DOMAIN || "");
  const token = String(process.env.SHOPIFY_ADMIN_ACCESS_TOKEN || "").trim();
  if (!shop) throw new Error("Missing SHOPIFY_SHOP_DOMAIN (or pass ?shop=...)");
  if (!token) throw new Error("Missing SHOPIFY_ADMIN_ACCESS_TOKEN");
  return { shop, token };
}

function parseLinkHeader(link) {
  // Link: <https://...page_info=...>; rel="next", <...>; rel="previous"
  if (!link) return {};
  const out = {};
  for (const part of String(link).split(",")) {
    const m = part.match(/<([^>]+)>\s*;\s*rel="([^"]+)"/);
    if (!m) continue;
    out[m[2]] = m[1];
  }
  return out;
}

async function shopifyGetJson(url, token) {
  const r = await fetch(url, {
    method: "GET",
    headers: {
      "X-Shopify-Access-Token": token,
      Accept: "application/json",
    },
  });
  const text = await r.text();
  if (!r.ok) {
    throw Object.assign(new Error("Shopify request failed"), { status: r.status, body: text });
  }
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw Object.assign(new Error("Shopify returned non-JSON"), { status: r.status, body: text });
  }
  return { json, headers: r.headers };
}

export default async function handler(req, res) {
  try {
    if (req.method !== "GET") {
      res.status(405).json({ error: "Method not allowed" });
      return;
    }

    const { shop, token } = getShopAndToken(req);
    const apiVersion = shopifyApiVersion();

    const createdAtMin = typeof req.query?.createdAtMin === "string" ? req.query.createdAtMin : null;
    const createdAtMax = typeof req.query?.createdAtMax === "string" ? req.query.createdAtMax : null;

    const base = new URL(`https://${shop}/admin/api/${apiVersion}/orders.json`);
    base.searchParams.set("status", "any");
    base.searchParams.set("limit", "250");
    if (createdAtMin) base.searchParams.set("created_at_min", createdAtMin);
    if (createdAtMax) base.searchParams.set("created_at_max", createdAtMax);

    const orders = [];
    let pages = 0;
    let nextUrl = base.toString();
    let maxPages = 80;
    if (typeof req.query?.maxPages === "string") {
      const n = parseInt(req.query.maxPages, 10);
      if (Number.isFinite(n)) maxPages = Math.max(1, Math.min(120, n));
    }

    while (nextUrl && pages < maxPages) {
      const { json, headers } = await shopifyGetJson(nextUrl, token);
      const batch = Array.isArray(json?.orders) ? json.orders : [];
      orders.push(...batch);
      pages += 1;

      const links = parseLinkHeader(headers.get("link"));
      nextUrl = links.next || null;
    }

    res.status(200).json({
      orders,
      meta: {
        count: orders.length,
        pages,
        maxPages,
        truncated: Boolean(nextUrl),
        apiVersion,
        createdAtMin,
        createdAtMax,
      },
    });
  } catch (e) {
    const status = typeof e?.status === "number" ? e.status : 500;
    res.status(status).json({ error: e?.message || String(e), ...(e?.body ? { body: e.body } : {}) });
  }
}

