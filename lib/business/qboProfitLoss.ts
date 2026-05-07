import { getQboRealmId, qboFetch, qboHost } from "./qbo";

export function fmtDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function firstDayOfMonth(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

export function addMonths(d: Date, months: number): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, 1));
}

export function parseMoney(s: unknown): number {
  if (s == null) return 0;
  if (typeof s === "number" && Number.isFinite(s)) return s;
  const cleaned = String(s).replace(/[$,\s]/g, "");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

type Report = Record<string, unknown>;

export async function fetchProfitAndLossReport(params: {
  start_date: string;
  end_date: string;
  summarize_column_by: "Month" | "Week";
  accounting_method?: "Accrual" | "Cash";
}): Promise<Report> {
  const realmId = getQboRealmId();
  const url = new URL(`https://${qboHost()}/v3/company/${realmId}/reports/ProfitAndLoss`);
  url.searchParams.set("start_date", params.start_date);
  url.searchParams.set("end_date", params.end_date);
  url.searchParams.set("summarize_column_by", params.summarize_column_by);
  url.searchParams.set("accounting_method", params.accounting_method ?? "Accrual");

  const r = await qboFetch(url.toString());
  const text = await r.text();
  if (!r.ok) {
    throw new Error(`QBO ProfitAndLoss failed (${r.status}): ${text}`);
  }
  return JSON.parse(text) as Report;
}

export function findReportRowByLabel(report: Report, label: string): Report | null {
  const rows = report?.Rows as Report | undefined;
  const row = rows?.Row;
  if (!Array.isArray(row)) return null;
  const target = label.toLowerCase();
  for (const r of row as Report[]) {
    const header = (r?.Header as Record<string, unknown> | undefined)?.ColData;
    const summary = (r?.Summary as Record<string, unknown> | undefined)?.ColData;
    const col0 =
      (Array.isArray(header) ? (header[0] as { value?: string })?.value : undefined) ??
      (Array.isArray(summary) ? (summary[0] as { value?: string })?.value : undefined) ??
      "";
    if (String(col0).toLowerCase() === target) return r;
  }
  return null;
}

export function extractColumnLabels(report: Report): string[] {
  const cols = report?.Columns as { Column?: unknown[] } | undefined;
  const column = cols?.Column;
  if (!Array.isArray(column)) return [];
  return column.map((c) => {
    const col = c as { ColTitle?: string; MetaData?: { Value?: string }[] };
    return String(col?.ColTitle ?? col?.MetaData?.[0]?.Value ?? "").trim();
  });
}

export function extractRowSeries(
  report: Report,
  row: Report | null,
): Array<{ label: string; value: number }> {
  const colLabels = extractColumnLabels(report);
  const summary = row?.Summary as { ColData?: { value?: string }[] } | undefined;
  const colData = summary?.ColData ?? (row?.ColData as { value?: string }[] | undefined) ?? [];
  const series: Array<{ label: string; value: number }> = [];

  for (let i = 1; i < colData.length; i++) {
    const label = colLabels[i] || `C${i}`;
    if (label.toLowerCase() === "total") continue;
    series.push({ label, value: parseMoney(colData[i]?.value) });
  }
  return series;
}

export function findTotalIncomeRow(report: Report): Report | null {
  const income = findReportRowByLabel(report, "Total Income");
  if (income) return income;
  return findReportRowByLabel(report, "Income");
}

export async function getMonthlyRevenueSeries(months: number): Promise<{
  realmId: string;
  start_date: string;
  end_date: string;
  months: number;
  series: Array<{ month: string; revenue: number }>;
}> {
  const realmId = getQboRealmId();
  const m = Math.max(1, Math.min(36, months));
  const now = new Date();
  const end = firstDayOfMonth(addMonths(now, 1));
  const start = firstDayOfMonth(addMonths(now, -m + 1));

  const report = await fetchProfitAndLossReport({
    start_date: fmtDate(start),
    end_date: fmtDate(end),
    summarize_column_by: "Month",
  });

  const incomeRow = findTotalIncomeRow(report);
  const raw = extractRowSeries(report, incomeRow);
  return {
    realmId,
    start_date: fmtDate(start),
    end_date: fmtDate(end),
    months: m,
    series: raw.map((x) => ({ month: x.label, revenue: x.value })),
  };
}
