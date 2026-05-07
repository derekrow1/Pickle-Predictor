declare const process: { env: Record<string, string | undefined> };
declare const Buffer: { from(input: string, encoding: "utf8"): { toString(enc: "base64"): string } };

function getEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

function base64(s: string) {
  return Buffer.from(s, "utf8").toString("base64");
}

export default async function handler(req: any, res: any) {
  try {
    if (req.method !== "GET") {
      res.status(405).json({ error: "Method not allowed" });
      return;
    }

    const clientId = getEnv("QBO_CLIENT_ID");
    const redirectUri = getEnv("QBO_REDIRECT_URI");

    // Minimal scope for accounting data.
    const scope = "com.intuit.quickbooks.accounting";

    // Lightweight state (MVP). For production, persist/verify this.
    const debug = typeof req.query?.debug === "string" ? req.query.debug : null;
    const state =
      (req.query?.state as string) ||
      base64(`qbo:${Date.now()}:${debug === "1" ? "debug" : "normal"}`);

    const url = new URL("https://appcenter.intuit.com/connect/oauth2");
    url.searchParams.set("client_id", clientId);
    url.searchParams.set("scope", scope);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("state", state);

    res.status(302).setHeader("Location", url.toString());
    res.end();
  } catch (e: any) {
    res.status(500).json({ error: e?.message || String(e) });
  }
}

