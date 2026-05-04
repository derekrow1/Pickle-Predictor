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

async function getAccessTokenFromRefresh(): Promise<string> {
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
  if (!r.ok) throw new Error(`QBO refresh_token exchange failed (${r.status}): ${text}`);
  const data = JSON.parse(text) as { access_token?: string };
  if (!data.access_token) throw new Error("QBO token response missing access_token");
  return data.access_token;
}

function qboHost(): string {
  const env = String(process.env.QBO_ENV || "production").toLowerCase();
  return env === "sandbox" ? "sandbox-quickbooks.api.intuit.com" : "quickbooks.api.intuit.com";
}

function fmtDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

function startOfWeekUtc(d: Date) {
  // Week starts Monday. Convert to UTC day index where Monday=0.
  const day = d.getUTCDay(); // Sunday=0
  const mondayIndex = (day + 6) % 7;
  const out = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  out.setUTCDate(out.getUTCDate() - mondayIndex);
  return out;
}

function addDays(d: Date, days: number) {
  const out = new Date(d.getTime());
  out.setUTCDate(out.getUTCDate() + days);
  return out;
}

function parseMoney(s: unknown): number {
  if (s == null) return 0;
  if (typeof s === "number" && Number.isFinite(s)) return s;
  const cleaned = String(s).replace(/[$,\\s]/g, "");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

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

type Report = any;

function findRow(report: Report, label: string): any | null {
  const rows = report?.Rows?.Row;
  if (!Array.isArray(rows)) return null;
  const target = label.toLowerCase();
  for (const r of rows) {
    const header = r?.Header?.ColData?.[0]?.value ?? r?.Summary?.ColData?.[0]?.value ?? "";
    if (String(header).toLowerCase() === target) return r;
  }
  return null;
}

export default async function handler(req: any, res: any) {
  try {
    if (req.method !== "GET") {
      res.status(405).json({ error: "Method not allowed" });
      return;
    }

    const realmId = getEnv("QBO_REALM_ID");
    const accessToken = await getAccessTokenFromRefresh();

    const weeks = Math.max(4, Math.min(26, Number(req.query?.weeks ?? 12)));
    const avgWeeks = Math.max(1, Math.min(26, Number(req.query?.avgWeeks ?? 8)));
    const now = new Date();
    const thisWeekStart = startOfWeekUtc(now);
    const start = addDays(thisWeekStart, -7 * weeks);
    const end = thisWeekStart; // exclude current partial week

    const url = new URL(`https://${qboHost()}/v3/company/${realmId}/reports/ProfitAndLoss`);
    url.searchParams.set("start_date", fmtDate(start));
    url.searchParams.set("end_date", fmtDate(end));
    url.searchParams.set("summarize_column_by", "Week");
    url.searchParams.set("accounting_method", "Accrual");

    const r = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
      },
    });

    const text = await r.text();
    if (!r.ok) {
      res.status(r.status).setHeader("Content-Type", "application/json; charset=utf-8");
      res.end(text);
      return;
    }

    const report = JSON.parse(text);
    const cols: any[] = report?.Columns?.Column ?? [];
    const colLabels = cols.map((c) => String(c?.ColTitle ?? c?.MetaData?.[0]?.Value ?? "").trim());

    // Net Income row is usually present and already Income-Expenses.
    const netIncomeRow = findRow(report, "Net Income");
    const colData: any[] = netIncomeRow?.Summary?.ColData ?? netIncomeRow?.ColData ?? [];

    const series: Array<{ week: string; netIncome: number; burn: number }> = [];
    for (let i = 1; i < colData.length; i++) {
      const label = colLabels[i] || `W${i}`;
      if (label.toLowerCase() === "total") continue;
      const netIncome = parseMoney(colData[i]?.value);
      const burn = netIncome < 0 ? -netIncome : 0;
      series.push({ week: label, netIncome, burn });
    }

    // Drop trailing partial week from averages & UI when QBO returns a short column (e.g. "5/3-5/4").
    let seriesComplete = series;
    if (seriesComplete.length > 0) {
      const last = seriesComplete[seriesComplete.length - 1]!;
      const d = daysInWeekLabel(last.week);
      if (d != null && d < 7) seriesComplete = seriesComplete.slice(0, -1);
    }

    const tail = seriesComplete.slice(-avgWeeks);
    const avgBurn = tail.length ? tail.reduce((a, b) => a + b.burn, 0) / tail.length : 0;

    res.status(200).json({
      ok: true,
      realmId,
      start_date: fmtDate(start),
      end_date: fmtDate(end),
      weeks,
      avgWeeks,
      avgWeeklyBurn: avgBurn,
      series,
      seriesComplete,
      definition:
        "Burn is max(0, -Net Income) per week (accrual, Monday–Sunday buckets). The report ends before the current partial week. seriesComplete omits a trailing partial column when detectable. avgWeeklyBurn is the mean burn over the last avgWeeks complete weeks.",
    });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || String(e) });
  }
}

