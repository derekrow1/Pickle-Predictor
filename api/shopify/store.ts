import { fetchShopInfo } from "../../lib/business/shopifyShop";

export default async function handler(req: any, res: any) {
  try {
    if (req.method !== "GET") {
      res.status(405).json({ error: "Method not allowed" });
      return;
    }

    const payload = await fetchShopInfo();
    res.status(200).json({ ok: true, ...((payload as object) ?? {}) });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || String(e) });
  }
}
