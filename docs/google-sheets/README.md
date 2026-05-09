# Google Sheets — automated Shopify → **RAW Shpfy Data**

This folder documents how to use the Apps Script in [`../../apps-script/shopify-sync/`](../../apps-script/shopify-sync/) so your workbook **copy** pulls orders into tab **`RAW Shpfy Data`** with the **full Shopify export shape (80 columns through `Paid Date`)**, plus your extra formula columns to the right untouched, instead of manual copy-paste.

## 1. Duplicate the spreadsheet (you do this in Drive)

1. Open your current workbook:  
   `https://docs.google.com/spreadsheets/d/1MvKZMUT0Eub25Ot8f1jwlAhd6rlfhfEfUyVT7HceVkw/edit`
2. **File → Make a copy** (name it e.g. `Shopify Inventory — auto-import`).
3. Confirm the copy still has a tab named exactly **`RAW Shpfy Data`** and **`CLEAN Shpfy`** (and the rest of your tabs) unchanged.

The script **does not change row 1**. It **clears columns A–CB** (1–80) from row 2 down, then writes Shopify API data to match those headers. Columns **CC onward** (e.g. `Week Start` … `GJS19`) are not filled from the API; **rows below the new import** have those columns **cleared** so stale values do not linger. Prefer **`ARRAYFORMULA`** in row 2 for those columns if you want them to auto-fill.

**Important:** Row 1 **A–CB** must match `EXPECTED_HEADERS_80` in `Code.gs` **exactly**. If you see a header-mismatch toast, compare character-for-character (spaces, spelling).

## 2. Bind the script to the copy

1. In the **copy**, open **Extensions → Apps Script**.
2. Delete any boilerplate `Code.gs` content.
3. Paste the contents of repo file [`apps-script/shopify-sync/Code.gs`](../../apps-script/shopify-sync/Code.gs) into `Code.gs`.
4. **Project Settings** (gear) → note **Time zone** should be **`(GMT-07:00) Denver`** (or align with `appsscript.json` if you use clasp).

## 3. Script properties (secrets — never commit)

In Apps Script: **Project Settings → Script properties** → add at least **`SHOPIFY_ACCESS_TOKEN`** (Admin API token, `shpat_…`). The Google UI sometimes only allows **one** property row; that is OK.

**Shop domain:** The script uses `SHOPIFY_SHOP_DEFAULT` at the top of `Code.gs` (edit there if your `.myshopify.com` host changes). Optional Script property **`SHOPIFY_SHOP`** overrides that default if you add it later.

| Property               | Example / notes                                      |
|------------------------|------------------------------------------------------|
| `SHOPIFY_ACCESS_TOKEN` | **Required** — Admin API token (`shpat_…`)         |
| `SHOPIFY_SHOP`         | Optional; overrides `SHOPIFY_SHOP_DEFAULT` in code   |
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

## Column layout (first 80 columns)

The canonical list is `EXPECTED_HEADERS_80` in [`apps-script/shopify-sync/Code.gs`](../../apps-script/shopify-sync/Code.gs) (Shopify-style export through **`Paid Date`**). Your sheet row 1 **A–CB** should match it exactly.

## Repo branch (optional)

You can commit these files on a branch such as `google-sheets-sync` without touching the Vite app. The live automation always runs **inside Google**, not on Vercel.
