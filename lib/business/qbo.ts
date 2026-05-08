import { requireEnv } from "./env";

function basicAuth(clientId: string, clientSecret: string): string {
  const token = Buffer.from(`${clientId}:${clientSecret}`, "utf8").toString("base64");
  return `Basic ${token}`;
}

export function qboHost(): string {
  const env = String(process.env.QBO_ENV || "production").toLowerCase();
  return env === "sandbox" ? "sandbox-quickbooks.api.intuit.com" : "quickbooks.api.intuit.com";
}

export function getQboRealmId(): string {
  return requireEnv("QBO_REALM_ID");
}

export async function getQboAccessToken(): Promise<string> {
  const clientId = requireEnv("QBO_CLIENT_ID");
  const clientSecret = requireEnv("QBO_CLIENT_SECRET");
  const refreshToken = requireEnv("QBO_REFRESH_TOKEN");

  const tokenUrl = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer";
  const body = new URLSearchParams();
  body.set("grant_type", "refresh_token");
  body.set("refresh_token", refreshToken);

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
  if (!r.ok) throw new Error(`QBO refresh_token exchange failed (${r.status}): ${text}`);
  const data = JSON.parse(text) as { access_token?: string };
  if (!data.access_token) throw new Error("QBO token response missing access_token");
  return data.access_token;
}

export async function qboFetch(url: string | URL, init?: RequestInit): Promise<Response> {
  const token = await getQboAccessToken();
  const target = typeof url === "string" ? url : url.toString();
  return fetch(target, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      ...init?.headers,
    },
  });
}

export async function qboQuery(sql: string): Promise<unknown> {
  const realmId = getQboRealmId();
  const url = new URL(`https://${qboHost()}/v3/company/${encodeURIComponent(realmId)}/query`);
  url.searchParams.set("query", sql);
  url.searchParams.set("minorversion", "75");
  const r = await qboFetch(url.toString());
  const text = await r.text();
  if (!r.ok) {
    throw new Error(`QBO query failed (${r.status}): ${text}`);
  }
  return JSON.parse(text) as unknown;
}
