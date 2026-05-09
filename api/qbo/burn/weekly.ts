import { getQboRealmId } from "../../../lib/business/qbo";
import { qboWeeklyProfitLossRange, serverBusinessTimezone } from "../../../lib/business/calendar";
import {
  extractColumnLabels,
  fetchProfitAndLossReport,
  findReportRowByLabel,
  parseMoney,
} from "../../../lib/business/qboProfitLoss";

/** If label looks like "M/D/YY - M/D/YY", return inclusive day count; else null (unknown). */
function daysInWeekLabel(label: string): number | null {
  const m = String(label).match(/(\d{1,2}\/\d{1,2}\/\d{2,4})\s*[-–]\s*(\d{1,2}\/\d{1,2}\/\d{2,4})/);
  if (!m) return null;
  const a = new Date(m[1]);
  const b = new Date(m[2]);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return null;
  const days = Math.round((b.getTime() - a.getTime()) / 86400000) + 1;
  return Number.isFinite(days) && days > 0 ? days : null;
}

export default async function handler(req: any, res: any) {
  try {
    if (req.method !== "GET") {
      res.status(405).json({ error: "Method not allowed" });
      return;
    }

    const realmId = getQboRealmId();
    const timeZone = serverBusinessTimezone();

    const weeksRaw = Number(req.query?.weeks ?? 12);
    const avgWeeksRaw = Number(req.query?.avgWeeks ?? 8);
    const weeks = Math.max(4, Math.min(26, Number.isFinite(weeksRaw) ? weeksRaw : 12));
    const avgWeeks = Math.max(1, Math.min(26, Number.isFinite(avgWeeksRaw) ? avgWeeksRaw : 8));

    const { startYmd, endYmd } = qboWeeklyProfitLossRange(new Date(), weeks, timeZone);
    if (startYmd > endYmd) {
      throw new Error(`Invalid burn range: start ${startYmd} after end ${endYmd}`);
    }

    let report;
    try {
      report = await fetchProfitAndLossReport({
        start_date: startYmd,
        end_date: endYmd,
        summarize_column_by: "Week",
        reportDateStyle: "us",
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (/pattern/i.test(msg)) {
        report = await fetchProfitAndLossReport({
          start_date: startYmd,
          end_date: endYmd,
          summarize_column_by: "Week",
          reportDateStyle: "iso",
        });
      } else {
        throw e;
      }
    }

    const colLabels = extractColumnLabels(report);
    const netIncomeRow = findReportRowByLabel(report, "Net Income");
    const summary = netIncomeRow?.Summary as { ColData?: { value?: string }[] } | undefined;
    const colData = summary?.ColData ?? (netIncomeRow?.ColData as { value?: string }[] | undefined) ?? [];

    const series: Array<{ week: string; netIncome: number; burn: number }> = [];
    for (let i = 1; i < colData.length; i++) {
      const label = colLabels[i] || `W${i}`;
      if (label.toLowerCase() === "total") continue;
      const netIncome = parseMoney(colData[i]?.value);
      const burn = netIncome < 0 ? -netIncome : 0;
      series.push({ week: label, netIncome, burn });
    }

    let seriesComplete = series;
    if (seriesComplete.length > 0) {
      const last = seriesComplete[seriesComplete.length - 1]!;
      const d = daysInWeekLabel(last.week);
      if (d != null && d < 7) seriesComplete = seriesComplete.slice(0, -1);
    }

    const tail = seriesComplete.slice(-avgWeeks);
    const avgBurnH = tail.length ? tail.reduce((a, b) => a + b.burn, 0) / tail.length : 0;

    res.status(200).json({
      ok: true,
      realmId,
      businessTimeZone: timeZone,
      start_date: startYmd,
      end_date: endYmd,
      weeks,
      avgWeeks,
      avgWeeklyBurn: avgBurnH,
      series,
      seriesComplete,
      definition:
        "Burn is max(0, -Net Income) per week (accrual, Sunday–Saturday in BUSINESS_TIMEZONE / settings). Range aligns to QuickBooks weekly columns. avgWeeklyBurn is the mean burn over the last avgWeeks complete weeks.",
    });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || String(e) });
  }
}
