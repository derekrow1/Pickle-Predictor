import crypto from "crypto";

function requiredEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

function normalizeShop(shop) {
  if (!shop) return "";
  let s = String(shop).trim();
  s = s.replace(/^https?:\/\//, "");
  s = s.replace(/\/.*$/, "");
  return s;
}

function decodeStateMode(state) {
  if (!state) return "unknown";
  try {
    const s = Buffer.from(String(state), "base64").toString("utf8");
    const parts = s.split(":");
    return parts[2] === "debug" ? "debug" : parts[2] === "normal" ? "normal" : "unknown";
  } catch {
    return "unknown";
  }
}

function pickStringQuery(req) {
  const out = {};
  const q = (req && req.query) || {};
  for (const [k, v] of Object.entries(q)) {
    if (typeof v === "string") out[k] = v;
  }
  return out;
}

function computeHmacHex(secret, msg) {
  return crypto.createHmac("sha256", secret).update(msg, "utf8").digest("hex");
}

export default async function handler(req, res) {
  try {
    if (req.method !== "GET") {
      res.status(405).json({ error: "Method not allowed" });
      return;
    }

    const q = pickStringQuery(req);
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

    const clientId = process.env.SHOPIFY_API_KEY || process.env.SHOPIFY_CLIENT_ID || requiredEnv("SHOPIFY_API_KEY");
    const clientSecret =
      process.env.SHOPIFY_API_SECRET || process.env.SHOPIFY_CLIENT_SECRET || requiredEnv("SHOPIFY_API_SECRET");

    // Validate Shopify OAuth HMAC
    const params = new URLSearchParams();
    const keys = Object.keys(q)
      .filter((k) => k !== "hmac" && k !== "signature")
      .sort();
    for (const k of keys) params.append(k, q[k]);
    const msg = params.toString();
    const computed = computeHmacHex(clientSecret, msg);
    if (computed !== hmac) {
      res.status(400).json({ error: "HMAC validation failed" });
      return;
    }

    // Exchange code -> access token
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

    let token = null;
    try {
      token = JSON.parse(text);
    } catch {
      token = null;
    }

    const debugEchoEnabled = String(process.env.SHOPIFY_DEBUG_ECHO_TOKENS || "").toLowerCase() === "true";
    const debugQuery = q.debug === "1";
    const mode = decodeStateMode(state);
    const shouldEcho = debugEchoEnabled && (debugQuery || mode === "debug");

    const access = (token && token.access_token) || "";
    const envLocalPaste =
      shouldEcho && access
        ? [
            "# Shopify Admin API (OAuth — persists until app uninstall; rotate if leaked)",
            `SHOPIFY_SHOP_DOMAIN=${shop}`,
            `SHOPIFY_ADMIN_ACCESS_TOKEN=${access}`,
          ].join("\n")
        : undefined;

    res.status(200).setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(
      JSON.stringify(
        {
          ok: true,
          shop,
          received: {
            access_token: access ? "present" : "missing",
            scope: (token && token.scope) || null,
          },
          ...(shouldEcho
            ? {
                debug: {
                  access_token: access || null,
                  scope: (token && token.scope) || null,
                },
                envLocalPaste,
              }
            : {}),
          nextSteps: [
            "Add SHOPIFY_SHOP_DOMAIN and SHOPIFY_ADMIN_ACCESS_TOKEN to Vercel env vars, then redeploy.",
            "Verify with: GET /api/shopify/pull",
            "Turn off SHOPIFY_DEBUG_ECHO_TOKENS after you copy the token.",
          ],
        },
        null,
        2,
      ),
    );
  } catch (e) {
    res.status(500).json({ error: e?.message || String(e) });
  }
}

