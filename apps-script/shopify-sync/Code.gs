/**
 * Fills tab "RAW Shpfy Data" from Shopify Admin REST API (orders.json).
 * Row shape matches Shopify order-export style expected by Pickle Predictor cleanShopifyRows:
 * Name, Paid at, Financial Status, Shipping, Taxes, Total, Discount Amount,
 * Shipping Province, Lineitem sku, Lineitem quantity, Lineitem price
 *
 * Script Properties (Project Settings → Script properties):
 *   SHOPIFY_SHOP        e.g. your-store.myshopify.com
 *   SHOPIFY_ACCESS_TOKEN  Admin API access token (shpat_...)
 * Optional:
 *   SHOPIFY_API_VERSION  default 2026-04
 *   MONTHS_BACK          default 12  (created_at_min)
 *   MAX_PAGES            default 100 (pagination safety cap)
 */
var RAW_SHEET_NAME = "RAW Shpfy Data";

var HEADER_ROW = [
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

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("Shopify")
    .addItem("Refresh RAW Shpfy Data now", "refreshRawShopifyData")
    .addItem("Install daily trigger (~1:00 AM Denver)", "installDailyTrigger")
    .addToUi();
}

function getProp_(key, defaultValue) {
  var v = PropertiesService.getScriptProperties().getProperty(key);
  if (v == null || String(v).trim() === "") return defaultValue;
  return String(v).trim();
}

function normalizeShop_(shop) {
  var s = String(shop || "").trim();
  s = s.replace(/^https?:\/\//, "");
  s = s.replace(/\/.*$/, "");
  return s;
}

function num_(v) {
  if (v == null || v === "") return 0;
  if (typeof v === "number" && isFinite(v)) return v;
  var n = parseFloat(String(v).replace(/[$,]/g, ""));
  return isFinite(n) ? n : 0;
}

function shippingAmount_(order) {
  var fromSet =
    order.total_shipping_price_set &&
    order.total_shipping_price_set.shop_money &&
    order.total_shipping_price_set.shop_money.amount;
  if (fromSet != null) return num_(fromSet);
  var lines = order.shipping_lines || [];
  var sum = 0;
  for (var i = 0; i < lines.length; i++) sum += num_(lines[i].price);
  return sum;
}

function parseLinkHeader_(link) {
  if (!link) return {};
  var out = {};
  var parts = String(link).split(",");
  for (var i = 0; i < parts.length; i++) {
    var m = parts[i].match(/<([^>]+)>\s*;\s*rel="([^"]+)"/);
    if (m) out[m[2]] = m[1];
  }
  return out;
}

function fetchOrdersPage_(url, token) {
  var resp = UrlFetchApp.fetch(url, {
    muteHttpExceptions: true,
    headers: {
      "X-Shopify-Access-Token": token,
      Accept: "application/json",
    },
  });
  var code = resp.getResponseCode();
  var text = resp.getContentText();
  if (code < 200 || code >= 300) {
    throw new Error("Shopify HTTP " + code + ": " + text.substring(0, 500));
  }
  var json = JSON.parse(text);
  var hdrs = resp.getHeaders();
  var link = "";
  if (hdrs) {
    link = hdrs.Link || hdrs.link || "";
    if (!link) {
      for (var k in hdrs) {
        if (String(k).toLowerCase() === "link") {
          link = hdrs[k];
          break;
        }
      }
    }
  }
  return { orders: json.orders || [], link: link };
}

function fetchAllShopifyOrders_() {
  var shop = normalizeShop_(getProp_("SHOPIFY_SHOP", ""));
  var token = getProp_("SHOPIFY_ACCESS_TOKEN", "");
  if (!shop) throw new Error('Set Script property SHOPIFY_SHOP (e.g. "store.myshopify.com")');
  if (!token) throw new Error("Set Script property SHOPIFY_ACCESS_TOKEN");

  var apiVersion = getProp_("SHOPIFY_API_VERSION", "2026-04");
  var monthsBack = parseInt(getProp_("MONTHS_BACK", "12"), 10) || 12;
  var maxPages = parseInt(getProp_("MAX_PAGES", "100"), 10) || 100;

  var minDate = new Date();
  minDate.setMonth(minDate.getMonth() - monthsBack);
  var createdAtMin = minDate.toISOString();

  var base =
    "https://" +
    shop +
    "/admin/api/" +
    apiVersion +
    "/orders.json?status=any&limit=250&created_at_min=" +
    encodeURIComponent(createdAtMin);

  var all = [];
  var nextUrl = base;
  var pages = 0;
  var truncated = false;

  while (nextUrl && pages < maxPages) {
    var batch = fetchOrdersPage_(nextUrl, token);
    for (var i = 0; i < batch.orders.length; i++) all.push(batch.orders[i]);
    pages++;
    var links = parseLinkHeader_(batch.link);
    nextUrl = links.next || null;
  }
  if (nextUrl) truncated = true;

  return { orders: all, pages: pages, truncated: truncated };
}

function orderToDataRows_(order) {
  var fin = String(order.financial_status || "").toLowerCase();
  if (fin && fin !== "paid" && fin !== "partially_refunded") return [];

  var items = order.line_items || [];
  var rows = [];
  var withSku = [];
  for (var i = 0; i < items.length; i++) {
    var li = items[i];
    var sku = String(li.sku || "").trim();
    var qty = Number(li.quantity) || 0;
    if (sku && qty > 0) withSku.push(li);
  }
  if (withSku.length === 0) return rows;

  var paidAt = order.processed_at || order.created_at || "";
  var province = String(
    (order.shipping_address && order.shipping_address.province_code) || ""
  ).toUpperCase();
  var ship = String(shippingAmount_(order));
  var tax = String(order.total_tax != null ? order.total_tax : "0");
  var total = String(order.total_price != null ? order.total_price : "0");
  var disc = String(order.total_discounts != null ? order.total_discounts : "0");
  var finDisplay = order.financial_status || "paid";

  for (var j = 0; j < withSku.length; j++) {
    var line = withSku[j];
    rows.push([
      order.name || "",
      paidAt,
      finDisplay,
      j === 0 ? ship : "0",
      j === 0 ? tax : "0",
      j === 0 ? total : "0",
      j === 0 ? disc : "0",
      province,
      String(line.sku).trim(),
      String(line.quantity),
      String(line.price != null ? line.price : "0"),
    ]);
  }
  return rows;
}

/** Last non-empty column in row 1 (your full header row — we never overwrite row 1). */
function lastHeaderColumn_(sheet) {
  var row = sheet.getRange(1, 1, 1, sheet.getMaxColumns()).getValues()[0];
  var last = HEADER_ROW.length;
  for (var c = 0; c < row.length; c++) {
    if (row[c] !== "" && row[c] != null) last = c + 1;
  }
  return Math.max(last, HEADER_ROW.length);
}

/**
 * Clears and refills RAW Shpfy Data from Shopify.
 * Preserves row 1 exactly (all your headers). Writes Shopify line-export columns A:K only;
 * columns right of K stay blank on data rows unless you extend the script later.
 */
function refreshRawShopifyData() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(RAW_SHEET_NAME);
  if (!sheet) {
    throw new Error('Sheet not found: "' + RAW_SHEET_NAME + '"');
  }

  var ncols = HEADER_ROW.length;
  var lastCol = lastHeaderColumn_(sheet);
  var maxRows = sheet.getMaxRows();
  if (maxRows > 1) {
    sheet.getRange(2, 1, maxRows, lastCol).clearContent();
  }

  var result = fetchAllShopifyOrders_();
  var matrix = [];
  for (var i = 0; i < result.orders.length; i++) {
    var chunk = orderToDataRows_(result.orders[i]);
    for (var c = 0; c < chunk.length; c++) matrix.push(chunk[c]);
  }

  if (matrix.length > 0) {
    sheet.getRange(2, 1, matrix.length + 1, ncols).setValues(matrix);
  }

  var msg =
    "Shopify import done. Orders fetched: " +
    result.orders.length +
    ", raw rows: " +
    matrix.length +
    ", pages: " +
    result.pages +
    (result.truncated ? " (TRUNCATED — raise MAX_PAGES or lower MONTHS_BACK)" : "");
  Logger.log(msg);
  SpreadsheetApp.getActiveSpreadsheet().toast(msg, "Shopify", 12);
}

/**
 * Run once after authorizing the script. Creates a daily time trigger at ~1:00 AM America/Denver
 * (script timezone is set in appsscript.json when using clasp; otherwise set in Apps Script project settings).
 */
function installDailyTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === "refreshRawShopifyData") {
      ScriptApp.deleteTrigger(t);
    }
  });
  ScriptApp.newTrigger("refreshRawShopifyData")
    .timeBased()
    .inTimezone("America/Denver")
    .everyDays(1)
    .atHour(1)
    .nearMinute(0)
    .create();
  SpreadsheetApp.getUi().alert(
    "Daily trigger installed: refreshRawShopifyData at 1:00 AM America/Denver. Check Extensions → Apps Script → Triggers."
  );
}
