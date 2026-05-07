import { requireEnv } from "./env";

/** Strip protocol and path; expect `store.myshopify.com`. */
export function normalizeShopifyShop(shop: string): string {
  let s = String(shop || "").trim();
  s = s.replace(/^https?:\/\//, "");
  s = s.replace(/\/.*$/, "");
  return s;
}

export function getShopifyShopDomain(): string {
  return requireEnv("SHOPIFY_SHOP_DOMAIN");
}

/** Admin API token from OAuth (long-lived until the app is uninstalled). */
export function getShopifyAdminAccessToken(): string {
  const t = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN?.trim() || process.env.SHOPIFY_ACCESS_TOKEN?.trim();
  if (!t) {
    throw new Error(
      "Missing env var: SHOPIFY_ADMIN_ACCESS_TOKEN or SHOPIFY_ACCESS_TOKEN. Complete Shopify OAuth and paste the token (like QBO_REFRESH_TOKEN).",
    );
  }
  return t;
}

/** App credentials: same as Partner Dashboard "Client ID". */
export function getShopifyApiKey(): string {
  const v = process.env.SHOPIFY_API_KEY?.trim() || process.env.SHOPIFY_CLIENT_ID?.trim();
  if (!v) {
    throw new Error("Missing env var: SHOPIFY_API_KEY or SHOPIFY_CLIENT_ID (OAuth client id, analogous to QBO_CLIENT_ID).");
  }
  return v;
}

/** App credentials: "Client secret". */
export function getShopifyApiSecret(): string {
  const v = process.env.SHOPIFY_API_SECRET?.trim() || process.env.SHOPIFY_CLIENT_SECRET?.trim();
  if (!v) {
    throw new Error("Missing env var: SHOPIFY_API_SECRET or SHOPIFY_CLIENT_SECRET (analogous to QBO_CLIENT_SECRET).");
  }
  return v;
}

export function getShopifyRedirectUri(): string {
  return requireEnv("SHOPIFY_REDIRECT_URI");
}

export function defaultShopifyApiVersion(): string {
  return (process.env.SHOPIFY_API_VERSION || "2026-01").trim();
}
