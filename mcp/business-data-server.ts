/**
 * MCP server: exposes Shopify + QuickBooks Online tools to Cursor.
 * Loads secrets from .env.local / .env in the project root (same variables as Vercel).
 */
import { config } from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import { getMonthlyRevenueSeries } from "../lib/business/qboProfitLoss";
import { getQboRealmId, qboFetch, qboHost, qboQuery } from "../lib/business/qbo";
import { reconcileOrdersToPayments, type QboPaymentRow } from "../lib/business/reconcile";
import { fetchShopInfo } from "../lib/business/shopifyShop";
import { fetchAllShopifyOrders } from "../lib/business/shopifyOrders";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../.env.local") });
config({ path: resolve(__dirname, "../.env") });

function toolErr(message: string) {
  return { isError: true as const, content: [{ type: "text" as const, text: message }] };
}

function qboPaymentsFromQuery(data: unknown): QboPaymentRow[] {
  const qr = (data as { QueryResponse?: Record<string, unknown> })?.QueryResponse;
  if (!qr || typeof qr !== "object") return [];
  const raw = qr.Payment ?? qr.payment;
  if (!Array.isArray(raw)) return [];
  return raw as QboPaymentRow[];
}

function assertSelectOnly(sql: string): void {
  const s = sql.trim().toLowerCase();
  if (!s.startsWith("select")) {
    throw new Error("Only read-only SELECT queries are allowed.");
  }
}

function isoDatePart(s: string, label: string): string {
  const d = s.trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) {
    throw new Error(`${label}: use leading YYYY-MM-DD (ISO date) for safe QBO query bounds.`);
  }
  return d;
}

const server = new McpServer(
  { name: "pickle-business", version: "1.0.0" },
  {
    instructions: [
      "Business data from Shopify and QuickBooks Online (development shop / production QBO).",
      "Required OAuth env mirrors QuickBooks: Shopify app credentials SHOPIFY_API_KEY + SHOPIFY_API_SECRET (or SHOPIFY_CLIENT_ID + SHOPIFY_CLIENT_SECRET), SHOPIFY_REDIRECT_URI; after install/OAuth set SHOPIFY_SHOP_DOMAIN + SHOPIFY_ADMIN_ACCESS_TOKEN (or SHOPIFY_ACCESS_TOKEN). QBO: QBO_CLIENT_ID, QBO_CLIENT_SECRET, QBO_REFRESH_TOKEN, QBO_REALM_ID. Optional: SHOPIFY_API_VERSION, QBO_ENV.",
      "Use qbo_sql_select for invoices, payments, deposits, customers, etc. Use reconcile_shopify_payments for amount+date matching hints (verify in books).",
    ].join("\n"),
  },
);

server.registerTool(
  "shopify_list_orders",
  {
    description:
      "Fetch Shopify orders via Admin REST API (paginated). Uses SHOPIFY_SHOP_DOMAIN and SHOPIFY_ADMIN_ACCESS_TOKEN.",
    inputSchema: {
      createdAtMin: z.string().optional().describe("ISO 8601 lower bound for created_at"),
      createdAtMax: z.string().optional().describe("ISO 8601 upper bound for created_at"),
      maxPages: z.number().int().min(1).max(100).optional().describe("Graph pagination cap (default 50)"),
    },
  },
  async (args) => {
    try {
      const { orders, meta } = await fetchAllShopifyOrders({
        createdAtMin: args.createdAtMin ?? null,
        createdAtMax: args.createdAtMax ?? null,
        maxPages: args.maxPages ?? 50,
      });
      return { content: [{ type: "text", text: JSON.stringify({ orders, meta }, null, 2) }] };
    } catch (e) {
      return toolErr(e instanceof Error ? e.message : String(e));
    }
  },
);

server.registerTool(
  "shopify_shop_info",
  {
    description:
      "GET shop.json — verify SHOPIFY_SHOP_DOMAIN + Admin token (same idea as qbo_company_info).",
    inputSchema: {},
  },
  async () => {
    try {
      const data = await fetchShopInfo();
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    } catch (e) {
      return toolErr(e instanceof Error ? e.message : String(e));
    }
  },
);

server.registerTool(
  "qbo_company_info",
  {
    description: "GET QuickBooks company metadata for the connected realm.",
    inputSchema: {},
  },
  async () => {
    try {
      const realmId = getQboRealmId();
      const url = `https://${qboHost()}/v3/company/${realmId}/companyinfo/${realmId}`;
      const r = await qboFetch(url);
      const text = await r.text();
      return { content: [{ type: "text", text }] };
    } catch (e) {
      return toolErr(e instanceof Error ? e.message : String(e));
    }
  },
);

server.registerTool(
  "qbo_monthly_revenue",
  {
    description: "Profit & Loss summarized by month (Total Income row). Accrual basis.",
    inputSchema: {
      months: z.number().int().min(1).max(36).optional().describe("Trailing months (default 12)"),
    },
  },
  async (args) => {
    try {
      const result = await getMonthlyRevenueSeries(args.months ?? 12);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    } catch (e) {
      return toolErr(e instanceof Error ? e.message : String(e));
    }
  },
);

server.registerTool(
  "qbo_sql_select",
  {
    description:
      "Run a read-only QuickBooks SQL query (select ...). Example: select Id, DocNumber, TotalAmt, TxnDate from Payment where TxnDate >= '2026-01-01' MAXRESULTS 500",
    inputSchema: {
      query: z.string().min(1).describe("QBO SQL starting with SELECT"),
    },
  },
  async (args) => {
    try {
      assertSelectOnly(args.query);
      const result = await qboQuery(args.query);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    } catch (e) {
      return toolErr(e instanceof Error ? e.message : String(e));
    }
  },
);

server.registerTool(
  "reconcile_shopify_payments",
  {
    description:
      "Match Shopify orders to QBO Payment rows by total amount and transaction date (heuristic; confirm in QBO). Fetches Payments in the date window via QBO query.",
    inputSchema: {
      createdAtMin: z.string().describe("ISO date or datetime — Shopify orders created_at lower bound"),
      createdAtMax: z.string().describe("ISO date or datetime — Shopify orders created_at upper bound"),
      dateToleranceDays: z.number().int().min(0).max(14).optional().describe("Default 3"),
      amountTolerance: z.number().min(0).optional().describe("Absolute amount slack (default 0.02)"),
    },
  },
  async (args) => {
    try {
      const minD = isoDatePart(args.createdAtMin, "createdAtMin");
      const maxD = isoDatePart(args.createdAtMax, "createdAtMax");

      const { orders } = await fetchAllShopifyOrders({
        createdAtMin: args.createdAtMin,
        createdAtMax: args.createdAtMax,
        maxPages: 50,
      });

      const sql = `select Id, DocNumber, TotalAmt, TxnDate, PrivateNote from Payment where TxnDate >= '${minD}' and TxnDate <= '${maxD}' MAXRESULTS 1000`;
      assertSelectOnly(sql);
      const qboRaw = await qboQuery(sql);
      const payments = qboPaymentsFromQuery(qboRaw);
      const recon = reconcileOrdersToPayments(orders, payments, {
        dateToleranceDays: args.dateToleranceDays ?? 3,
        amountTolerance: args.amountTolerance ?? 0.02,
      });
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                meta: { shopifyOrders: orders.length, qboPayments: payments.length },
                ...recon,
              },
              null,
              2,
            ),
          },
        ],
      };
    } catch (e) {
      return toolErr(e instanceof Error ? e.message : String(e));
    }
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);
