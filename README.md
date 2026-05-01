# 🥒 Pickle Predictor

Local-first inventory, cash-flow, and demand-forecasting app for a small e-commerce pickle brand.

Single-page app built with **Vite + React + TypeScript + Tailwind**. All state lives in your browser's `localStorage`; no backend, no auth, no server. Drop in your weekly Smartwarehousing Lot Control reports + Shopify orders export, and the app produces order recommendations, cash-burn projections, and demand forecasts.

## Features

- **Order Now** — per-SKU × warehouse PO recommendations with shelf-life guard, pallet/case rounding, and "show math" tooltips
- **Inventory & Components** — warehouse breakdown with stacked on-hand/on-order visualization
- **Forecast** — 12-week demand projection driven by lookback baseline, growth, seasonality, ad spend, and event multipliers
- **Cash & Burn** — weekly burn from Shopify activity with "if I place these POs" runway toggle
- **Profitability** — weekly P&L derived from Shopify export plus configurable cost assumptions
- **Marketing** — editable ad-spend grid by platform plus a calendar of demand events
- **Retail** — retailers, per-SKU velocities, and initial fills
- **Open POs + Receipts** — multi-line POs, receive workflow with over/under tracking, and standalone Supply Adjustment receipts
- **Settings** — every threshold, lead time, shelf-life parameter, cost assumption, and SKU/component/warehouse list editable; JSON export/import; scoped reset

## Run locally

```bash
npm install
npm run dev
```

Opens at `http://localhost:5173`.

## Deploy on Vercel

This repo is preconfigured for Vercel via `vercel.json` (Vite framework preset, SPA rewrites, immutable asset cache headers).

**Option A — connect via the GitHub integration (recommended):**

1. Sign in to [vercel.com](https://vercel.com) with your GitHub account.
2. **Add New… → Project**, then pick `derekrow1/Pickle-Predictor`.
3. Accept the auto-detected settings and click **Deploy**. Subsequent pushes to `main` auto-deploy.

**Option B — Vercel CLI from this directory:**

```bash
npm i -g vercel
vercel              # first run links the project
vercel --prod       # production deploy
```

No environment variables are required. The app is fully client-side; uploaded data never leaves the browser.

## Importers

- **Warehouse inventory** — `Lot Control Roll Forward` reports (XLS or XLSX) from Smartwarehousing. The importer auto-detects the warehouse from the filename (e.g. `Joshs_Pickles-MO_RollFwd_…` → MO), sums per-lot quantities, and excludes HOLD stock (rows starting with `H_`).
- **Shopify orders** — the standard CSV export (`Name`, `Paid at`, `Lineitem sku`, `Lineitem quantity`, `Shipping Province`, etc.). Multi-pack SKUs (e.g. `HDS192`, `SP4`) are expanded into per-SKU jar counts via a built-in lookup table.

## Persistence model

State lives in `localStorage` under key `pickle-predictor-v1`. The store is versioned and migrates automatically when the schema changes. Use **Settings → Export JSON** for backups, **Import JSON** to restore.

## Tech notes

- Vite 8, React 19, TypeScript 6
- Zustand with `persist` + JSON migrations
- recharts for charts, papaparse + SheetJS for parsing
- Tailwind 3 for styling

## License

Private project — not open source.
