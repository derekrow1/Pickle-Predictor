import { getQboRealmId, qboFetch, qboHost } from "../../lib/business/qbo";

export default async function handler(req: any, res: any) {
  try {
    if (req.method !== "GET") {
      res.status(405).json({ error: "Method not allowed" });
      return;
    }

    const realmId = getQboRealmId();
    const rid = encodeURIComponent(realmId);
    const url = `https://${qboHost()}/v3/company/${rid}/companyinfo/${rid}?minorversion=75`;
    const r = await qboFetch(url);

    const text = await r.text();
    res.status(r.status).setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(text);
  } catch (e: any) {
    res.status(500).json({ error: e?.message || String(e) });
  }
}
