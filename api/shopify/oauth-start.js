function normalizeShopifyShop(shop) {
  if (!shop) return "";
  let s = String(shop).trim();
  s = s.replace(/^https?:\/\//, "");
  s = s.replace(/\/.*$/, "");
  return s;
}

function requiredEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

export default async function handler(req, res) {
  try {
    if (req.method !== "GET") {
      res.status(405).json({ error: "Method not allowed" });
      return;
    }

    const clientId =
      process.env.SHOPIFY_API_KEY ||
      process.env.SHOPIFY_CLIENT_ID ||
      requiredEnv("SHOPIFY_API_KEY");

    const redirectUri = requiredEnv("SHOPIFY_REDIRECT_URI");
    const scope = String(process.env.SHOPIFY_SCOPES || "read_orders").trim();

    const shop = normalizeShopifyShop(
      (req.query && req.query.shop) || process.env.SHOPIFY_SHOP_DOMAIN || "",
    );
    if (!shop) {
      res.status(400).json({
        error: "Missing shop",
        hint: "Pass ?shop=your-store.myshopify.com or set SHOPIFY_SHOP_DOMAIN.",
      });
      return;
    }

    const debug = req.query && req.query.debug === "1";
    const state =
      (req.query && req.query.state) ||
      Buffer.from(`shopify:${Date.now()}:${debug ? "debug" : "normal"}`, "utf8").toString("base64");

    const url = new URL(`https://${shop}/admin/oauth/authorize`);
    url.searchParams.set("client_id", clientId);
    url.searchParams.set("scope", scope);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("state", state);

    res.status(302).setHeader("Location", url.toString());
    res.end();
  } catch (e) {
    res.status(500).json({ error: e?.message || String(e) });
  }
}

