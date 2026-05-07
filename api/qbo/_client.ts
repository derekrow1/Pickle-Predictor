declare const process: { env: Record<string, string | undefined> };
declare const Buffer: { from(input: string, encoding: "utf8"): { toString(enc: "base64"): string } };

function getEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

function basicAuth(clientId: string, clientSecret: string) {
  const token = Buffer.from(`${clientId}:${clientSecret}`, "utf8").toString("base64");
  return `Basic ${token}`;
}

export type QboTokenResponse = {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  x_refresh_token_expires_in?: number;
  token_type: string;
};

export async function getAccessTokenFromRefresh(): Promise<string> {
  const clientId = getEnv("QBO_CLIENT_ID");
  const clientSecret = getEnv("QBO_CLIENT_SECRET");
  const refreshToken = getEnv("QBO_REFRESH_TOKEN");

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
  if (!r.ok) {
    throw new Error(`QBO refresh_token exchange failed (${r.status}): ${text}`);
  }
  const data = JSON.parse(text) as QboTokenResponse;
  if (!data.access_token) throw new Error("QBO token response missing access_token");
  return data.access_token;
}

export function getRealmId(): string {
  return getEnv("QBO_REALM_ID");
}

