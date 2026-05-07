import { getMonthlyRevenueSeries } from "../../lib/business/qboProfitLoss";

export default async function handler(req: any, res: any) {
  try {
    if (req.method !== "GET") {
      res.status(405).json({ error: "Method not allowed" });
      return;
    }

    const months = Math.max(1, Math.min(36, Number(req.query?.months ?? 12)));
    const result = await getMonthlyRevenueSeries(months);

    res.status(200).json({
      ok: true,
      realmId: result.realmId,
      start_date: result.start_date,
      end_date: result.end_date,
      months: result.months,
      series: result.series,
    });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || String(e) });
  }
}
