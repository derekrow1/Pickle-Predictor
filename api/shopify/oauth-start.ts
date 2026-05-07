declare const process: { env: Record<string, string | undefined> };
declare const Buffer: { from(input: string, encoding: "utf8"): { toString(enc: "base64"): string } };

import {
  getShopifyApiKey,
  getShopifyRedirectUri,
  normalizeShopifyShop,
} from "../../lib/business/shopifyEnv";

function base64(s: string) {
  return Buffer.from(s, "utf8").toString("base64");
}

export default async function handler(req: any, res: any) {
  try {
    if (req.method !== "GET") {
      res.status(405).json({ error: "Method not allowed" });
      return;
    }

    const clientId = getShopifyApiKey();
    const redirectUri = getShopifyRedirectUri();
    const scope = (process.env.SHOPIFY_SCOPES || "read_orders").trim();

    const shop = normalizeShopifyShop((req.query?.shop as string) || process.env.SHOPIFY_SHOP_DOMAIN || "");
    if (!shop) {
      res.status(400).json({
        error: "Missing shop",
        hint: "Pass ?shop=your-store.myshopify.com or set SHOPIFY_SHOP_DOMAIN.",
      });
      return;
    }

    const debug = typeof req.query?.debug === "string" ? req.query.debug : null;
    const state =
      (req.query?.state as string) || base64(`shopify:${Date.now()}:${debug === "1" ? "debug" : "normal"}`);

    const url = new URL(`https://${shop}/admin/oauth/authorize`);
    url.searchParams.set("client_id", clientId);
    url.searchParams.set("scope", scope);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("state", state);

    res.status(302).setHeader("Location", url.toString());
    res.end();
  } catch (e: any) {
    res.status(500).json({ error: e?.message || String(e) });
  }
}
