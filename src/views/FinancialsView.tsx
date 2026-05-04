import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "../components/Layout";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

type MonthlyRevenueResponse = {
  ok: boolean;
  start_date: string;
  end_date: string;
  months: number;
  series: Array<{ month: string; revenue: number }>;
  error?: string;
};

function money(n: number) {
  return `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

export function FinancialsView() {
  const [months, setMonths] = useState<number>(12);
  const [data, setData] = useState<MonthlyRevenueResponse | null>(null);
  const [status, setStatus] = useState<string>("");

  const total = useMemo(() => {
    if (!data?.series?.length) return 0;
    return data.series.reduce((a, b) => a + (Number.isFinite(b.revenue) ? b.revenue : 0), 0);
  }, [data]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setStatus("Loading revenue from QuickBooks…");
      try {
        const r = await fetch(`/api/qbo/revenue/monthly?months=${months}`);
        const j = (await r.json()) as MonthlyRevenueResponse;
        if (!r.ok) throw new Error(j?.error || "Failed to load revenue");
        if (!cancelled) {
          setData(j);
          setStatus("");
        }
      } catch (e: any) {
        if (!cancelled) setStatus(`Error: ${e?.message || String(e)}`);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [months]);

  return (
    <>
      <PageHeader
        title="Financials"
        subtitle="QuickBooks Online reports"
        right={
          <div className="flex items-center gap-2 text-sm">
            <span className="text-pickle-700">Months</span>
            <select
              className="input"
              value={months}
              onChange={(e) => setMonths(Number(e.target.value))}
            >
              {[6, 12, 18, 24, 36].map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>
        }
      />

      <div className="card p-4 mb-4">
        <div className="text-sm font-semibold mb-2">Revenue per month</div>
        {status && <div className="text-sm text-pickle-700">{status}</div>}
        {data && (
          <div className="text-xs text-pickle-700 mb-3">
            Range: <strong>{data.start_date}</strong> → <strong>{data.end_date}</strong> · Total:{" "}
            <strong>{money(total)}</strong>
          </div>
        )}

        <div className="h-[320px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data?.series ?? []} margin={{ top: 10, right: 16, bottom: 8, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" tick={{ fontSize: 12 }} interval={0} angle={-25} textAnchor="end" height={60} />
              <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => money(Number(v))} />
              <Tooltip formatter={(v) => money(Number(v))} />
              <Line type="monotone" dataKey="revenue" stroke="#0f766e" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </>
  );
}

