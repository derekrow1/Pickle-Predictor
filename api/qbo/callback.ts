declare const process: { env: Record<string, string | undefined> };
declare const Buffer: { from(input: string, encoding: string): { toString(enc: string): string } };

function getEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

function basicAuth(clientId: string, clientSecret: string) {
  const token = Buffer.from(`${clientId}:${clientSecret}`, "utf8").toString("base64");
  return `Basic ${token}`;
}

function decodeState(state: unknown): { mode: "debug" | "normal" | "unknown" } {
  if (typeof state !== "string" || !state) return { mode: "unknown" };
  try {
    const s = Buffer.from(state, "base64").toString("utf8");
    // expected: qbo:<timestamp>:<mode>
    const parts = s.split(":");
    const mode = parts[2] === "debug" ? "debug" : parts[2] === "normal" ? "normal" : "unknown";
    return { mode };
  } catch {
    return { mode: "unknown" };
  }
}

export default async function handler(req: any, res: any) {
  try {
    if (req.method !== "GET") {
      res.status(405).json({ error: "Method not allowed" });
      return;
    }

    const code = typeof req.query?.code === "string" ? req.query.code : null;
    const realmId = typeof req.query?.realmId === "string" ? req.query.realmId : null;
    const state = typeof req.query?.state === "string" ? req.query.state : null;
    const error = typeof req.query?.error === "string" ? req.query.error : null;
    const errorDescription =
      typeof req.query?.error_description === "string" ? req.query.error_description : null;

    if (error) {
      res.status(400).json({ error, errorDescription, realmId });
      return;
    }
    if (!code) {
      res.status(400).json({ error: "Missing code", realmId });
      return;
    }

    const clientId = getEnv("QBO_CLIENT_ID");
    const clientSecret = getEnv("QBO_CLIENT_SECRET");
    const redirectUri = getEnv("QBO_REDIRECT_URI");

    const tokenUrl = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer";
    const body = new URLSearchParams();
    body.set("grant_type", "authorization_code");
    body.set("code", code);
    body.set("redirect_uri", redirectUri);

    const r = await fetch(tokenUrl, {
      method: "POST",
      headers: {
        Authorization: basicAuth(clientId, clientSecret),
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: body.toString(),
    });

    const text = await r.text();
    if (!r.ok) {
      res.status(r.status).json({ error: "Token exchange failed", status: r.status, body: text, realmId });
      return;
    }

    // Default: do NOT echo tokens back in the browser.
    // If you need to capture the refresh_token once, set QBO_DEBUG_ECHO_TOKENS=true
    // and add ?debug=1 to the callback URL. Turn it back off after capturing.
    let token: any = null;
    try {
      token = JSON.parse(text);
    } catch {
      token = null;
    }

    const debugEchoEnabled = String(process.env.QBO_DEBUG_ECHO_TOKENS || "").toLowerCase() === "true";
    const debugQuery = typeof req.query?.debug === "string" ? req.query.debug : null;
    const decoded = decodeState(state);
    // Prefer state-driven debug so the *first* callback hit can echo tokens (no code reuse).
    const shouldEcho = debugEchoEnabled && (decoded.mode === "debug" || debugQuery === "1");

    res.status(200).setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(
      JSON.stringify(
        {
          ok: true,
          realmId,
          received: {
            access_token: token?.access_token ? "present" : "missing",
            refresh_token: token?.refresh_token ? "present" : "missing",
          },
          ...(shouldEcho
            ? {
                debug: {
                  access_token: token?.access_token ?? null,
                  refresh_token: token?.refresh_token ?? null,
                  expires_in: token?.expires_in ?? null,
                  x_refresh_token_expires_in: token?.x_refresh_token_expires_in ?? null,
                  token_type: token?.token_type ?? null,
                },
              }
            : {}),
          nextSteps: [
            "In Vercel → Project → Settings → Environment Variables (Production), add:",
            "QBO_REALM_ID = <realmId from this response>",
            "QBO_REFRESH_TOKEN = <refresh_token from Intuit token exchange>",
            "Then redeploy and test /api/qbo/company",
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

