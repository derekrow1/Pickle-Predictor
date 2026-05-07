import { fetchAllShopifyOrders } from "../../lib/business/shopifyOrders";

export default async function handler(req: any, res: any) {
  try {
    if (req.method !== "GET") {
      res.status(405).json({ error: "Method not allowed" });
      return;
    }

    const createdAtMin = typeof req.query?.createdAtMin === "string" ? req.query.createdAtMin : null;
    const createdAtMax = typeof req.query?.createdAtMax === "string" ? req.query.createdAtMax : null;

    const { orders, meta } = await fetchAllShopifyOrders({ createdAtMin, createdAtMax, maxPages: 50 });

    res.status(200).json({
      orders,
      meta: {
        count: orders.length,
        pages: meta.pages,
        apiVersion: meta.apiVersion,
        createdAtMin,
        createdAtMax,
      },
    });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || String(e) });
  }
}
