import { useEffect, useMemo, useState } from "react";
import { addWeeks, format } from "date-fns";
import { PageHeader, EmptyState } from "../components/Layout";
import { fmtMoney } from "../lib/util";
import { linearBurnForecast } from "../lib/burnForecast";
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
} from "recharts";

type WeekPoint = { week: string; netIncome: number; burn: number };

type WeeklyBurnResponse = {
  ok?: boolean;
  error?: string;
  realmId?: string;
  start_date?: string;
  end_date?: string;
  weeks?: number;
  avgWeeks?: number;
  avgWeeklyBurn?: number;
  series?: WeekPoint[];
  seriesComplete?: WeekPoint[];
  definition?: string;
};

function daysInWeekLabel(label: string): number | null {
  const m = String(label).match(/(\d{1,2}\/\d{1,2}\/\d{2,4})\s*[-–]\s*(\d{1,2}\/\d{1,2}\/\d{2,4})/);
  if (!m) return null;
  const a = new Date(m[1]!);
  const b = new Date(m[2]!);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return null;
  const days = Math.round((b.getTime() - a.getTime()) / 86400000) + 1;
  return Number.isFinite(days) && days > 0 ? days : null;
}

function dropTrailingPartialWeek(series: WeekPoint[]): WeekPoint[] {
  if (!series.length) return series;
  const last = series[series.length - 1]!;
  const d = daysInWeekLabel(last.week);
  if (d != null && d < 7) return series.slice(0, -1);
  return series;
}

/** First day of QBO week column when title is "M/D/YY – M/D/YY". */
function parseWeekColumnStart(label: string): Date | null {
  const m = String(label).match(/(\d{1,2}\/\d{1,2}\/\d{2,4})\s*[-–]\s*\d{1,2}\/\d{1,2}\/\d{2,4}/);
  if (!m) return null;
  const d = new Date(m[1]!);
  return Number.isNaN(d.getTime()) ? null : d;
}

function shortWeekLabel(week: string): string {
  const start = parseWeekColumnStart(week);
  if (start) return format(start, "MMM d");
  return week.length > 16 ? `${week.slice(0, 14)}…` : week;
}

type ChartRow = {
  key: string;
  label: string;
  actual: number | null;
  projected: number | null;
};

export function WeeklyBurnView() {
  const [historyWeeks, setHistoryWeeks] = useState(20);
  const [avgWeeks, setAvgWeeks] = useState(8);
  const [data, setData] = useState<WeeklyBurnResponse | null>(null);
  const [status, setStatus] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setStatus("Loading weekly burn from QuickBooks…");
      try {
        const r = await fetch(`/api/qbo/burn/weekly?weeks=${historyWeeks}&avgWeeks=${avgWeeks}`);
        const j = (await r.json()) as WeeklyBurnResponse;
        if (!r.ok) throw new Error((j as { error?: string }).error || "Failed to load weekly burn");
        if (!cancelled) {
          setData(j);
          setStatus("");
        }
      } catch (e: unknown) {
        if (!cancelled) setStatus(`Error: ${e instanceof Error ? e.message : String(e)}`);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [historyWeeks, avgWeeks]);

  const complete = useMemo(() => {
    if (!data?.series?.length) return [];
    const raw = data.seriesComplete?.length ? data.seriesComplete : dropTrailingPartialWeek(data.series);
    return raw;
  }, [data]);

  const avg = Number(data?.avgWeeklyBurn) || 0;

  const forecast = useMemo(() => linearBurnForecast(complete.map((w) => w.burn), 4), [complete]);

  const forecastTotal = useMemo(() => forecast.reduce((a, b) => a + b, 0), [forecast]);

  const chartData: ChartRow[] = useMemo(() => {
    const lastStart = complete.length ? parseWeekColumnStart(complete[complete.length - 1]!.week) : null;
    const historical: ChartRow[] = complete.map((w, i) => ({
      key: `h-${i}`,
      label: shortWeekLabel(w.week),
      actual: w.burn,
      projected: null,
    }));
    const future: ChartRow[] = forecast.map((p, i) => ({
      key: `f-${i}`,
      label:
        lastStart != null
          ? `${format(addWeeks(lastStart, i + 1), "MMM d")} (est.)`
          : `+${i + 1} wk (est.)`,
      actual: null,
      projected: p,
    }));
    return [...historical, ...future];
  }, [complete, forecast]);

  return (
    <>
      <PageHeader
        title="Weekly Burn"
        subtitle="QuickBooks accrual P&L · Monday–Sunday weeks · current partial week omitted"
        right={
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <label className="flex items-center gap-1.5 text-pickle-700">
              <span>History</span>
              <select
                className="input !w-auto min-w-[4.5rem]"
                value={historyWeeks}
                onChange={(e) => setHistoryWeeks(Number(e.target.value))}
              >
                {[12, 16, 20, 26].map((w) => (
                  <option key={w} value={w}>
                    {w} wk
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-1.5 text-pickle-700">
              <span>Avg window</span>
              <select
                className="input !w-auto min-w-[4.5rem]"
                value={avgWeeks}
                onChange={(e) => setAvgWeeks(Number(e.target.value))}
              >
                {[4, 8, 12].map((w) => (
                  <option key={w} value={w}>
                    {w} wk
                  </option>
                ))}
              </select>
            </label>
          </div>
        }
      />

      {status && (
        <div className="card p-4 mb-4 text-sm text-pickle-800">
          {status}
        </div>
      )}

      {data && !status && complete.length === 0 && (
        <EmptyState title="No weekly columns returned" description="Connect QuickBooks or widen the history window." />
      )}

      {data && !status && complete.length > 0 && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
            <div className="card p-4">
              <div className="label">Avg weekly burn</div>
              <div className="text-2xl font-bold text-pickle-900 mt-1">{fmtMoney(avg)}</div>
              <div className="text-xs text-pickle-600 mt-1">Last {data.avgWeeks ?? avgWeeks} complete weeks</div>
            </div>
            <div className="card p-4">
              <div className="label">4-week projected burn</div>
              <div className="text-2xl font-bold text-pickle-900 mt-1">{fmtMoney(forecastTotal)}</div>
              <div className="text-xs text-pickle-600 mt-1">Linear trend on recent weekly burn (not a forecast of net income)</div>
            </div>
            <div className="card p-4">
              <div className="label">Reporting window</div>
              <div className="text-sm text-pickle-800 mt-1">
                <span className="font-medium">{data.start_date}</span>
                <span className="text-pickle-500"> → </span>
                <span className="font-medium">{data.end_date}</span>
              </div>
              <div className="text-xs text-pickle-600 mt-1">End date is start of current week (UTC), so the in-progress week is excluded.</div>
            </div>
          </div>

          <div className="card p-4 mb-4">
            <div className="text-sm font-semibold text-pickle-900 mb-1">Burn vs average & short-term outlook</div>
            <p className="text-xs text-pickle-600 mb-4">
              Bars are actual burn (max(0, −net income)) per complete week. Purple markers show a naive linear projection from recent weeks.
            </p>
            <div className="h-[340px]">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chartData} margin={{ top: 8, right: 12, left: 4, bottom: 48 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e3edd1" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} interval={0} angle={-35} textAnchor="end" height={70} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => fmtMoney(Number(v))} width={72} />
                  <Tooltip
                    formatter={(value) => {
                      const n = typeof value === "number" ? value : Number(value);
                      if (!Number.isFinite(n)) return null;
                      return fmtMoney(n);
                    }}
                  />
                  <Legend />
                  <ReferenceLine
                    y={avg}
                    stroke="#3d591d"
                    strokeDasharray="4 4"
                    label={{ value: "Avg burn", position: "insideTopRight", fill: "#3d591d", fontSize: 11 }}
                  />
                  <Bar dataKey="actual" name="Actual burn" fill="#b45309" radius={[2, 2, 0, 0]} maxBarSize={36} />
                  <Line
                    type="monotone"
                    dataKey="projected"
                    name="Projected burn"
                    stroke="#6d28d9"
                    strokeWidth={2}
                    dot={{ r: 4, fill: "#6d28d9" }}
                    connectNulls={false}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="card overflow-auto">
            <table className="w-full text-sm">
              <thead className="bg-pickle-50 sticky top-0">
                <tr>
                  <th>Week (QBO)</th>
                  <th className="text-right">Net income</th>
                  <th className="text-right">Burn</th>
                  <th className="text-right">vs avg</th>
                </tr>
              </thead>
              <tbody>
                {complete.map((w) => (
                  <tr key={w.week}>
                    <td className="font-medium text-pickle-900">{w.week}</td>
                    <td className="text-right tabular-nums">{fmtMoney(w.netIncome)}</td>
                    <td className="text-right tabular-nums">{fmtMoney(w.burn)}</td>
                    <td className="text-right tabular-nums text-pickle-700">
                      {avg > 0 ? `${((w.burn / avg) * 100).toFixed(0)}%` : "—"}
                    </td>
                  </tr>
                ))}
                {forecast.map((p, i) => (
                  <tr key={`proj-${i}`} className="bg-violet-50/60">
                    <td className="font-medium text-violet-900">
                      {chartData[complete.length + i]?.label ?? `+${i + 1} wk (est.)`}
                    </td>
                    <td className="text-right text-pickle-500">—</td>
                    <td className="text-right tabular-nums text-violet-900">{fmtMoney(p)}</td>
                    <td className="text-right text-pickle-500">proj.</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {data.definition && <p className="text-xs text-pickle-600 mt-3">{data.definition}</p>}
        </>
      )}
    </>
  );
}
