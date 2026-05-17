/**
 * Fetches ~12 months of paid/partially_refunded Shopify orders via Admin REST API
 * and writes a CSV compatible with Data → "Replace all" (see cleanShopifyRows).
 *
 * Usage (from repo root):
 *   node scripts/export-shopify-last-12-months.mjs
 *   node scripts/export-shopify-last-12-months.mjs ./my-export.csv
 *
 * Requires in .env or environment:
 *   SHOPIFY_SHOP_DOMAIN
 *   SHOPIFY_ADMIN_ACCESS_TOKEN
 * Optional: SHOPIFY_API_VERSION (default 2026-04), SHOPIFY_EXPORT_MAX_PAGES (default 120)
 */
import "dotenv/config";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

function required(name) {
  const v = String(process.env[name] || "").trim();
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

function normalizeShop(shop) {
  let s = String(shop || "").trim();
  s = s.replace(/^https?:\/\//, "");
  s = s.replace(/\/.*$/, "");
  return s;
}

function parseLinkHeader(link) {
  if (!link) return {};
  const out = {};
  for (const part of String(link).split(",")) {
    const m = part.match(/<([^>]+)>\s*;\s*rel="([^"]+)"/);
    if (!m) continue;
    out[m[2]] = m[1];
  }
  return out;
}

function num(v) {
  if (v == null || v === "") return 0;
  if (typeof v === "number") return v;
  const n = parseFloat(String(v).replace(/[$,]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function shippingAmount(ord) {
  const fromSet =
    ord?.total_shipping_price_set?.shop_money?.amount ??
    ord?.total_shipping_price_set?.presentment_money?.amount;
  if (fromSet != null) return num(fromSet);
  const lines = Array.isArray(ord?.shipping_lines) ? ord.shipping_lines : [];
  return lines.reduce((a, l) => a + num(l?.price), 0);
}

function csvCell(v) {
  if (v == null) return "";
  const s = String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function isoMinMonthsAgo(months) {
  const d = new Date();
  d.setMonth(d.getMonth() - months);
  return d.toISOString();
}

const HEADERS = [
  "Name",
  "Paid at",
  "Financial Status",
  "Shipping",
  "Taxes",
  "Total",
  "Discount Amount",
  "Shipping Province",
  "Lineitem sku",
  "Lineitem quantity",
  "Lineitem price",
];

function orderToRows(order) {
  const fin = String(order.financial_status || "").toLowerCase();
  if (fin && fin !== "paid" && fin !== "partially_refunded") return [];

  const items = Array.isArray(order.line_items) ? order.line_items : [];
  const withSku = items.filter((li) => String(li?.sku || "").trim() && Number(li?.quantity) > 0);
  if (withSku.length === 0) return [];

  const paidAt = order.processed_at || order.created_at || "";
  const province = String(order.shipping_address?.province_code || "").toUpperCase();
  const ship = String(shippingAmount(order));
  const tax = String(order.total_tax ?? "0");
  const total = String(order.total_price ?? "0");
  const disc = String(order.total_discounts ?? "0");

  const rows = [];
  withSku.forEach((li, i) => {
    const line = [
      order.name,
      paidAt,
      order.financial_status || "paid",
      i === 0 ? ship : "0",
      i === 0 ? tax : "0",
      i === 0 ? total : "0",
      i === 0 ? disc : "0",
      province,
      String(li.sku).trim(),
      String(li.quantity),
      String(li.price ?? "0"),
    ];
    rows.push(line.map(csvCell).join(","));
  });
  return rows;
}

async function main() {
  const shop = normalizeShop(required("SHOPIFY_SHOP_DOMAIN"));
  const token = required("SHOPIFY_ADMIN_ACCESS_TOKEN");
  const apiVersion = String(process.env.SHOPIFY_API_VERSION || "2026-04").trim();
  const maxPages = Math.min(
    200,
    Math.max(1, parseInt(String(process.env.SHOPIFY_EXPORT_MAX_PAGES || "120"), 10) || 120),
  );
  const months = Math.min(24, Math.max(1, parseInt(process.env.SHOPIFY_EXPORT_MONTHS || "12", 10) || 12));

  const createdAtMin = isoMinMonthsAgo(months);
  const base = new URL(`https://${shop}/admin/api/${apiVersion}/orders.json`);
  base.searchParams.set("status", "any");
  base.searchParams.set("limit", "250");
  base.searchParams.set("created_at_min", createdAtMin);

  const orders = [];
  let pages = 0;
  let nextUrl = base.toString();
  let truncated = false;

  while (nextUrl && pages < maxPages) {
    const r = await fetch(nextUrl, {
      headers: { "X-Shopify-Access-Token": token, Accept: "application/json" },
    });
    const text = await r.text();
    if (!r.ok) throw new Error(`Shopify ${r.status}: ${text.slice(0, 500)}`);
    const json = JSON.parse(text);
    const batch = Array.isArray(json.orders) ? json.orders : [];
    orders.push(...batch);
    pages += 1;
    const links = parseLinkHeader(r.headers.get("link"));
    nextUrl = links.next || null;
  }
  if (nextUrl) truncated = true;

  const lines = [HEADERS.join(",")];
  for (const order of orders) {
    lines.push(...orderToRows(order));
  }

  const outArg = process.argv[2];
  const outPath = outArg
    ? join(ROOT, outArg.replace(/^\.\//, ""))
    : join(ROOT, "exports", "shopify-last-12-months.csv");
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, lines.join("\n"), "utf8");

  console.log(`Wrote ${outPath}`);
  console.log(`Orders fetched: ${orders.length}, CSV data rows: ${lines.length - 1}`);
  if (truncated) {
    console.warn(
      "Warning: hit max pages before Shopify finished pagination — raise SHOPIFY_EXPORT_MAX_PAGES or narrow months.",
    );
  }
  console.log("Import: app → Data → Shopify → Replace all → choose this CSV.");
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
