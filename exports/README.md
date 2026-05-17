# Generated exports

CSV files written here are **ignored by git** (see repo root `.gitignore` for `*.csv`).

## Last 12 months of Shopify orders (for the Data tab)

From the repository root, with `SHOPIFY_SHOP_DOMAIN` and `SHOPIFY_ADMIN_ACCESS_TOKEN` in `.env` (same as Vercel / local dev):

```bash
cd /Users/reedquinn/Projects/Pickle-Predictor
node scripts/export-shopify-last-12-months.mjs
```

Optional:

- Custom output path: `node scripts/export-shopify-last-12-months.mjs ./exports/my-shop.csv`
- `SHOPIFY_EXPORT_MONTHS=18` — how far back `created_at_min` goes (default `12`)
- `SHOPIFY_EXPORT_MAX_PAGES=150` — pagination cap (default `120`, max `200` in script)

Then in the app: **Data → Shopify orders export → Replace all** and select the generated CSV.

npm shortcut:

```bash
npm run export:shopify-12m
```
