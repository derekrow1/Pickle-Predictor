/**
 * Fills tab "RAW Shpfy Data" from Shopify Admin REST API (orders.json).
 * Row shape matches your workbook: first 80 columns = Shopify order export through "Paid Date".
 * Columns 81+ (Week Start ... GJS19) are left untouched - use ARRAYFORMULA or refill formulas if needed.
 *
 * Script Properties: SHOPIFY_SHOP, SHOPIFY_ACCESS_TOKEN
 * Optional: SHOPIFY_API_VERSION, MONTHS_BACK, MAX_PAGES
 */
var RAW_SHEET_NAME = "RAW Shpfy Data";

/** Import width: through "Paid Date" only (do not overwrite formula columns to the right). */
var NUM_SHOPIFY_IMPORT_COLS = 80;

/** Expected headers for cols A through CB (80 cols); row 1 should match. Used for validation toast. */
var EXPECTED_HEADERS_80 = [
  "Name",
  "Email",
  "Financial Status",
  "Paid at",
  "Fulfillment Status",
  "Fulfilled at",
  "Accepts Marketing",
  "Currency",
  "Subtotal",
  "Shipping",
  "Taxes",
  "Total",
  "Discount Code",
  "Discount Amount",
  "Shipping Method",
  "Created at",
  "Lineitem quantity",
  "Lineitem name",
  "Lineitem price",
  "Lineitem compare at price",
  "Lineitem sku",
  "Lineitem requires shipping",
  "Lineitem taxable",
  "Lineitem fulfillment status",
  "Billing Name",
  "Billing Street",
  "Billing Address1",
  "Billing Address2",
  "Billing Company",
  "Billing City",
  "Billing Zip",
  "Billing Province",
  "Billing Country",
  "Billing Phone",
  "Shipping Name",
  "Shipping Street",
  "Shipping Address1",
  "Shipping Address2",
  "Shipping Company",
  "Shipping City",
  "Shipping Zip",
  "Shipping Province",
  "Shipping Country",
  "Shipping Phone",
  "Notes",
  "Note Attributes",
  "Cancelled at",
  "Payment Method",
  "Payment Reference",
  "Refunded Amount",
  "Vendor",
  "Outstanding Balance",
  "Employee",
  "Location",
  "Device ID",
  "Id",
  "Tags",
  "Risk Level",
  "Source",
  "Lineitem discount",
  "Tax 1 Name",
  "Tax 1 Value",
  "Tax 2 Name",
  "Tax 2 Value",
  "Tax 3 Name",
  "Tax 3 Value",
  "Tax 4 Name",
  "Tax 4 Value",
  "Tax 5 Name",
  "Tax 5 Value",
  "Phone",
  "Receipt Number",
  "Duties",
  "Billing Province Name",
  "Shipping Province Name",
  "Payment ID",
  "Payment Terms Name",
  "Next Payment Due At",
  "Payment References",
  "Paid Date",
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

function str_(v) {
  if (v == null || v === "") return "";
  return String(v);
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

function shippingMethodTitles_(order) {
  var lines = order.shipping_lines || [];
  var t = [];
  for (var i = 0; i < lines.length; i++) {
    if (lines[i].title) t.push(String(lines[i].title));
  }
  return t.join("; ");
}

function discountCodes_(order) {
  var codes = order.discount_codes || [];
  var t = [];
  for (var i = 0; i < codes.length; i++) {
    if (codes[i].code) t.push(String(codes[i].code));
  }
  return t.join("; ");
}

function noteAttrs_(order) {
  var na = order.note_attributes || [];
  if (!na.length) return "";
  try {
    return JSON.stringify(na);
  } catch (e) {
    return "";
  }
}

function paymentGateways_(order) {
  var g = order.payment_gateway_names || [];
  return g.length ? g.join("; ") : "";
}

function refundedAmount_(order) {
  var refunds = order.refunds || [];
  var sum = 0;
  for (var i = 0; i < refunds.length; i++) {
    var tr = refunds[i].transactions || [];
    for (var j = 0; j < tr.length; j++) sum += num_(tr[j].amount);
  }
  if (sum > 0) return String(sum);
  if (order.total_refunded != null) return str_(order.total_refunded);
  return "";
}

function fulfilledAt_(order) {
  var fs = order.fulfillments || [];
  if (!fs.length) return "";
  var latest = fs[0].updated_at || fs[0].created_at || "";
  for (var i = 1; i < fs.length; i++) {
    var u = fs[i].updated_at || fs[i].created_at || "";
    if (u > latest) latest = u;
  }
  return latest;
}

function taxLinesNamesValues_(order, firstOnly) {
  var lines = order.tax_lines || [];
  var out = [];
  for (var i = 0; i < 5; i++) {
    if (i < lines.length && firstOnly) {
      out.push(str_(lines[i].title));
      out.push(str_(lines[i].price));
    } else {
      out.push("");
      out.push("");
    }
  }
  return out;
}

function billingCols_(addr) {
  if (!addr)
    return ["", "", "", "", "", "", "", "", "", ""];
  return [
    str_(addr.name),
    str_(addr.address1),
    str_(addr.address1),
    str_(addr.address2),
    str_(addr.company),
    str_(addr.city),
    str_(addr.zip),
    str_(addr.province_code || addr.province),
    str_(addr.country_code || addr.country),
    str_(addr.phone),
  ];
}

function shippingCols_(addr) {
  if (!addr)
    return ["", "", "", "", "", "", "", "", "", ""];
  return [
    str_(addr.name),
    str_(addr.address1),
    str_(addr.address1),
    str_(addr.address2),
    str_(addr.company),
    str_(addr.city),
    str_(addr.zip),
    str_(addr.province_code || addr.province),
    str_(addr.country_code || addr.country),
    str_(addr.phone),
  ];
}

function parseLinkHeader_(link) {
  var out = {};
  if (!link) return out;
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

/**
 * One flat row (80 cells) for a single line item. firstLine: order-level money/taxes on first line only.
 */
function buildExportRow_(order, line, firstLine) {
  var r = new Array(NUM_SHOPIFY_IMPORT_COLS);
  for (var z = 0; z < r.length; z++) r[z] = "";

  var paidAt = order.processed_at || order.created_at || "";
  var bill = order.billing_address;
  var shipAddr = order.shipping_address;
  var billCols = billingCols_(bill);
  var shipCols = shippingCols_(shipAddr);

  r[0] = str_(order.name);
  r[1] = str_(order.email);
  r[2] = str_(order.financial_status);
  r[3] = paidAt;
  r[4] = str_(order.fulfillment_status);
  r[5] = fulfilledAt_(order);
  r[6] = order.buyer_accepts_marketing ? "yes" : "no";
  r[7] = str_(order.currency);
  r[15] = str_(order.created_at);
  r[44] = str_(order.note);
  r[45] = noteAttrs_(order);
  r[46] = str_(order.cancelled_at);
  r[47] = paymentGateways_(order);
  r[48] = "";
  r[55] = str_(order.id);
  r[56] = str_(order.tags);
  r[57] = "";
  if (order.risk != null) r[57] = typeof order.risk === "object" ? JSON.stringify(order.risk) : str_(order.risk);
  r[58] = str_(order.source_name);
  r[70] = str_(order.phone || (shipAddr && shipAddr.phone) || (bill && bill.phone));
  r[71] = "";
  r[72] = order.total_duties != null ? str_(order.total_duties) : "";
  r[73] = bill ? str_(bill.province) : "";
  r[74] = shipAddr ? str_(shipAddr.province) : "";
  r[75] = "";
  r[76] = "";
  r[77] = "";
  r[78] = "";
  r[79] = paidAt;

  if (firstLine) {
    r[8] = str_(order.subtotal_price);
    r[9] = String(shippingAmount_(order));
    r[10] = str_(order.total_tax);
    r[11] = str_(order.total_price);
    r[12] = discountCodes_(order);
    r[13] = str_(order.total_discounts);
    r[14] = shippingMethodTitles_(order);
    r[49] = refundedAmount_(order);
    r[51] = "";
    r[52] = "";
    r[53] = order.location_id != null ? str_(order.location_id) : "";
    r[54] = "";

    var tv = taxLinesNamesValues_(order, true);
    for (var t = 0; t < 10; t++) r[60 + t] = tv[t];
  }

  for (var b = 0; b < 10; b++) r[24 + b] = billCols[b];
  for (var s = 0; s < 10; s++) r[34 + s] = shipCols[s];

  r[16] = str_(line.quantity);
  r[17] = str_(line.name);
  r[18] = str_(line.price);
  r[19] = line.compare_at_price != null ? str_(line.compare_at_price) : "";
  r[20] = str_(line.sku);
  r[21] = line.requires_shipping ? "true" : "false";
  r[22] = line.taxable ? "true" : "false";
  r[23] = str_(line.fulfillment_status);
  r[50] = str_(line.vendor || "");
  r[59] = line.total_discount != null ? str_(line.total_discount) : "";

  return r;
}

function orderToDataRows_(order) {
  var fin = String(order.financial_status || "").toLowerCase();
  if (fin && fin !== "paid" && fin !== "partially_refunded") return [];

  var items = order.line_items || [];
  var rows = [];
  var usable = [];
  for (var i = 0; i < items.length; i++) {
    var li = items[i];
    var qty = Number(li.quantity) || 0;
    if (qty > 0) usable.push(li);
  }
  if (usable.length === 0) return rows;

  for (var j = 0; j < usable.length; j++) {
    rows.push(buildExportRow_(order, usable[j], j === 0));
  }
  return rows;
}

function lastHeaderColumn_(sheet) {
  var row = sheet.getRange(1, 1, 1, sheet.getMaxColumns()).getValues()[0];
  var last = NUM_SHOPIFY_IMPORT_COLS;
  for (var c = 0; c < row.length; c++) {
    if (row[c] !== "" && row[c] != null) last = c + 1;
  }
  return Math.max(last, NUM_SHOPIFY_IMPORT_COLS);
}

function headersMatchSheet_(sheet) {
  var row = sheet.getRange(1, 1, 1, NUM_SHOPIFY_IMPORT_COLS).getValues()[0];
  for (var i = 0; i < NUM_SHOPIFY_IMPORT_COLS; i++) {
    var a = String(row[i] || "").trim();
    var b = String(EXPECTED_HEADERS_80[i] || "").trim();
    if (a !== b) return false;
  }
  return true;
}

/**
 * Clears cols A through CB (1-80) from row 2 down; writes Shopify rows. Does not touch col 81+ (formulas).
 */
function refreshRawShopifyData() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(RAW_SHEET_NAME);
  if (!sheet) {
    throw new Error('Sheet not found: "' + RAW_SHEET_NAME + '"');
  }

  if (!headersMatchSheet_(sheet)) {
    ss.toast(
      "Warning: row 1 first 80 cols should match EXPECTED_HEADERS_80 in script. Check spelling/spaces.",
      "Shopify",
      10
    );
  }

  var maxRows = sheet.getMaxRows();
  if (maxRows > 1) {
    sheet.getRange(2, 1, maxRows, NUM_SHOPIFY_IMPORT_COLS).clearContent();
  }

  var result = fetchAllShopifyOrders_();
  var matrix = [];
  for (var i = 0; i < result.orders.length; i++) {
    var chunk = orderToDataRows_(result.orders[i]);
    for (var c = 0; c < chunk.length; c++) matrix.push(chunk[c]);
  }

  if (matrix.length > 0) {
    sheet.getRange(2, 1, matrix.length + 1, NUM_SHOPIFY_IMPORT_COLS).setValues(matrix);
  }

  var tailStart = 2 + matrix.length;
  if (tailStart <= maxRows && lastHeaderColumn_(sheet) > NUM_SHOPIFY_IMPORT_COLS) {
    var lastC = lastHeaderColumn_(sheet);
    sheet.getRange(tailStart, NUM_SHOPIFY_IMPORT_COLS + 1, maxRows, lastC).clearContent();
  }

  var msg =
    "Shopify import done. Orders: " +
    result.orders.length +
    ", rows: " +
    matrix.length +
    ", pages: " +
    result.pages +
    (result.truncated ? " (TRUNCATED)" : "");
  Logger.log(msg);
  ss.toast(msg, "Shopify", 12);
}

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
    "Daily trigger installed: refreshRawShopifyData at 1:00 AM America/Denver. Check Extensions > Apps Script > Triggers."
  );
}
