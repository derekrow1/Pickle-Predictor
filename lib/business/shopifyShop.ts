import {
  defaultShopifyApiVersion,
  getShopifyAdminAccessToken,
  getShopifyShopDomain,
} from "./shopifyEnv";

export async function shopifyAdminFetch(path: string, init?: RequestInit): Promise<Response> {
  const shop = getShopifyShopDomain();
  const token = getShopifyAdminAccessToken();
  const ver = defaultShopifyApiVersion();
  const pathClean = path.startsWith("/") ? path : `/${path}`;
  const url = `https://${shop}/admin/api/${ver}${pathClean}`;
  return fetch(url, {
    ...init,
    headers: {
      "X-Shopify-Access-Token": token,
      "Content-Type": "application/json",
      Accept: "application/json",
      ...init?.headers,
    },
  });
}

/** `GET /admin/api/{version}/shop.json` — verifies token + domain (like QBO companyinfo). */
export async function fetchShopInfo(): Promise<unknown> {
  const r = await shopifyAdminFetch("/shop.json");
  const text = await r.text();
  let data: unknown;
  try {
    data = JSON.parse(text) as unknown;
  } catch {
    data = { parseError: true, body: text };
  }
  if (!r.ok) {
    throw new Error(`Shopify shop.json failed (${r.status}): ${text.slice(0, 2000)}`);
  }
  return data;
}
