# Google Sheets — automated Shopify → **RAW Shpfy Data**

This folder documents how to use the Apps Script in [`../../apps-script/shopify-sync/`](../../apps-script/shopify-sync/) so your workbook **copy** pulls orders into tab **`RAW Shpfy Data`** (same column layout as a Shopify order export / Pickle Predictor `cleanShopifyRows`), instead of manual copy-paste.

## 1. Duplicate the spreadsheet (you do this in Drive)

1. Open your current workbook:  
   `https://docs.google.com/spreadsheets/d/1MvKZMUT0Eub25Ot8f1jwlAhd6rlfhfEfUyVT7HceVkw/edit`
2. **File → Make a copy** (name it e.g. `Shopify Inventory — auto-import`).
3. Confirm the copy still has a tab named exactly **`RAW Shpfy Data`** and **`CLEAN Shpfy`** (and the rest of your tabs) unchanged.

The script **does not change row 1** — your full header row stays as you designed it. It **clears row 2 downward** across **all columns through your last header column**, then writes Shopify data in **columns A–K** only (same 11 fields as a standard order export). Extra header columns **L onward** remain on row 1; data rows leave those cells **empty** unless you extend the script.

**Important:** **CLEAN Shpfy** (and formulas) must still match the **order and names** of the first **11** columns your sheet expects for a Shopify export. If your headers A–K differ from the standard list below, either reorder row 1 to match or ask to add a column-mapping layer in the script.

## 2. Bind the script to the copy

1. In the **copy**, open **Extensions → Apps Script**.
2. Delete any boilerplate `Code.gs` content.
3. Paste the contents of repo file [`apps-script/shopify-sync/Code.gs`](../../apps-script/shopify-sync/Code.gs) into `Code.gs`.
4. **Project Settings** (gear) → note **Time zone** should be **`(GMT-07:00) Denver`** (or align with `appsscript.json` if you use clasp).

## 3. Script properties (secrets — never commit)

In Apps Script: **Project Settings → Script properties** → Add rows:

| Property               | Example / notes                                      |
|------------------------|------------------------------------------------------|
| `SHOPIFY_SHOP`         | `your-store.myshopify.com` (no `https://`)         |
| `SHOPIFY_ACCESS_TOKEN` | Admin API token (`shpat_…`)                          |
| `SHOPIFY_API_VERSION`  | Optional; default `2026-04`                         |
| `MONTHS_BACK`          | Optional; default `12` (`created_at_min`)          |
| `MAX_PAGES`            | Optional; default `100` (250 orders per page cap)  |

Save. **Authorize** the script the first time you run it (Shopify + spreadsheet access).

## 4. First manual run

1. Select function **`refreshRawShopifyData`** → **Run**.
2. Approve permissions if prompted.
3. Check tab **`RAW Shpfy Data`**, then **`CLEAN Shpfy`** and downstream tabs.

If row counts look low, open **Executions** log; you may need to raise **`MAX_PAGES`** or lower **`MONTHS_BACK`** for Apps Script’s 6-minute limit.

## 5. Daily automatic import (~1:00 AM Denver)

After a successful manual run:

1. In Apps Script editor, select **`installDailyTrigger`** → **Run** once.  
   Or manually: **Triggers** (clock) → **Add trigger** → function `refreshRawShopifyData` → **Day timer** → time in **America/Denver**.

The bundled `installDailyTrigger()` creates a **daily 1:00 AM `America/Denver`** trigger for `refreshRawShopifyData`.

## 6. Optional: clasp (push from git)

If you use [`clasp`](https://github.com/google/clasp):

```bash
cd /Users/reedquinn/Projects/Pickle-Predictor/apps-script/shopify-sync
clasp login
clasp create --title "Pickle Shopify sync" --rootDir .
# or clasp clone <scriptId>
clasp push
```

Link the pushed project to your spreadsheet: **Extensions → Apps Script** → use the same script ID, or manage via clasp’s `.clasp.json`.

## Column layout (must match **RAW Shpfy Data** expectations)

Header row written by the script:

`Name`, `Paid at`, `Financial Status`, `Shipping`, `Taxes`, `Total`, `Discount Amount`, `Shipping Province`, `Lineitem sku`, `Lineitem quantity`, `Lineitem price`

This matches the Pickle Predictor importer in [`src/lib/cleanShopify.ts`](../../src/lib/cleanShopify.ts). If your live sheet’s first row differs **even by spelling**, update either the sheet header or the `HEADER_ROW` array in `Code.gs` so they match **exactly**.

## Repo branch (optional)

You can commit these files on a branch such as `google-sheets-sync` without touching the Vite app. The live automation always runs **inside Google**, not on Vercel.
