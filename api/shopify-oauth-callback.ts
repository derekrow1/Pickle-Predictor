declare const process: { env: Record<string, string | undefined> };
declare const Buffer: { from(input: string, encoding: "utf8"): { toString(enc: "base64" | "utf8"): string } };

import { createHmac } from "node:crypto";

import { getShopifyApiKey, getShopifyApiSecret } from "../lib/business/shopifyEnv";

function cryptoHmacSha256Hex(secret: string, data: string): string {
  return createHmac("sha256", secret).update(data, "utf8").digest("hex");
}

function normalizeShop(shop: string): string {
  let s = String(shop || "").trim();
  s = s.replace(/^https?:\/\//, "");
  s = s.replace(/\/.*$/, "");
  return s;
}

function decodeStateMode(state: unknown): "debug" | "normal" | "unknown" {
  if (typeof state !== "string" || !state) return "unknown";
  try {
    const s = Buffer.from(state, "base64").toString("utf8");
    const parts = s.split(":");
    const mode = parts[2] === "debug" ? "debug" : parts[2] === "normal" ? "normal" : "unknown";
    return mode;
  } catch {
    return "unknown";
  }
}

function pickQuery(req: any): Record<string, string> {
  const out: Record<string, string> = {};
  const q = req?.query || {};
  for (const [k, v] of Object.entries(q)) {
    if (typeof v === "string") out[k] = v;
  }
  return out;
}

export default async function handler(req: any, res: any) {
  try {
    if (req.method !== "GET") {
      res.status(405).json({ error: "Method not allowed" });
      return;
    }

    const q = pickQuery(req);
    const shop = normalizeShop(q.shop || "");
    const code = q.code || null;
    const state = q.state || null;
    const hmac = q.hmac || null;

    if (!shop || !code || !hmac) {
      res.status(400).json({
        error: "Missing required query params",
        received: { shop: !!shop, code: !!code, hmac: !!hmac },
      });
      return;
    }

    const clientId = getShopifyApiKey();
    const clientSecret = getShopifyApiSecret();

    const params = new URLSearchParams();
    const keys = Object.keys(q)
      .filter((k) => k !== "hmac" && k !== "signature")
      .sort();
    for (const k of keys) params.append(k, q[k]!);
    const msg = params.toString();
    const computed = cryptoHmacSha256Hex(clientSecret, msg);
    if (computed !== hmac) {
      res.status(400).json({ error: "HMAC validation failed" });
      return;
    }

    const tokenUrl = `https://${shop}/admin/oauth/access_token`;
    const r = await fetch(tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code }),
    });
    const text = await r.text();
    if (!r.ok) {
      res.status(r.status).json({ error: "Token exchange failed", status: r.status, body: text });
      return;
    }

    let token: { access_token?: string; scope?: string } | null = null;
    try {
      token = JSON.parse(text) as { access_token?: string; scope?: string };
    } catch {
      token = null;
    }

    const debugEchoEnabled = String(process.env.SHOPIFY_DEBUG_ECHO_TOKENS || "").toLowerCase() === "true";
    const debugQuery = q.debug === "1";
    const mode = decodeStateMode(state);
    const shouldEcho = debugEchoEnabled && (debugQuery || mode === "debug");

    const access = token?.access_token ?? "";
    const envLocalPaste =
      shouldEcho && access
        ? [
            "# Shopify Admin API (OAuth — persists until app uninstall; rotate if leaked)",
            `SHOPIFY_SHOP_DOMAIN=${shop}`,
            `SHOPIFY_ADMIN_ACCESS_TOKEN=${access}`,
            "",
            "# Then verify: GET /api/shopify/store and GET /api/shopify/pull",
          ].join("\n")
        : undefined;

    res.status(200).setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(
      JSON.stringify(
        {
          ok: true,
          shop,
          received: {
            access_token: token?.access_token ? "present" : "missing",
            scope: token?.scope ?? null,
          },
          ...(shouldEcho
            ? {
                debug: {
                  access_token: token?.access_token ?? null,
                  scope: token?.scope ?? null,
                },
                envLocalPaste,
              }
            : {}),
          nextSteps: [
            "Set SHOPIFY_REDIRECT_URI in Vercel to: https://YOUR_HOST/api/shopify-oauth-callback",
            "Add to Vercel → Environment Variables and/or local .env.local (for Cursor MCP):",
            `SHOPIFY_SHOP_DOMAIN=${shop}`,
            "SHOPIFY_ADMIN_ACCESS_TOKEN=<access_token from OAuth — use debug echo once to capture>",
            "Aliases (optional): SHOPIFY_CLIENT_ID / SHOPIFY_CLIENT_SECRET match SHOPIFY_API_KEY / SHOPIFY_API_SECRET.",
            "Verify: GET /api/shopify/store then GET /api/shopify/pull",
            "To echo the token once: set SHOPIFY_DEBUG_ECHO_TOKENS=true, open /api/shopify-oauth-start?shop=...&debug=1, complete OAuth; then turn the flag off.",
          ],
        },
        null,
        2,
      ),
    );
  } catch (e: any) {
    res.status(500).json({ error: e?.message || String(e) });
  }
}
