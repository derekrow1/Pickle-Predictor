import { useMemo, useState } from "react";
import { useStore } from "../store/store";
import { computeOrderRecs } from "../lib/orderEngine";
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
  Area,
} from "recharts";
import { fmtNum, fmtDateShort } from "../lib/util";
import { PageHeader, EmptyState } from "../components/Layout";

export function ForecastView() {
  const state = useStore();
  const [skuFilter, setSkuFilter] = useState<string>("ALL");
  const result = useMemo(() => computeOrderRecs(state), [state]);

  if (state.cleanOrders.length === 0) {
    return (
      <>
        <PageHeader title="Demand Forecast" subtitle="Next 12 weeks" />
        <EmptyState title="Upload Shopify orders first" />
      </>
    );
  }

  // Build chart data combining historical + forecast
  const histChart = result.history.slice(-12).map((h) => ({
    week: fmtDateShort(h.weekStart),
    weekIso: h.weekStart,
    Actual: skuFilter === "ALL"
      ? h.totalJars
      : h.unitsBySku[skuFilter] || 0,
    Forecast: 0,
  }));
  const fwdChart = result.forecast.map((f) => ({
    week: fmtDateShort(f.weekStart),
    weekIso: f.weekStart,
    Actual: 0,
    Forecast: skuFilter === "ALL"
      ? f.totalJars
      : f.unitsBySku[skuFilter] || 0,
    Baseline: skuFilter === "ALL" ? f.baseline : (f.unitsBySku[skuFilter] || 0) / (f.adMul * f.eventMul * f.seasonalityMul || 1),
    SeasonalityLift: skuFilter === "ALL" ? f.baseline * (f.seasonalityMul - 1) : 0,
    AdLift: skuFilter === "ALL" ? f.baseline * (f.adMul - 1) : 0,
    EventLift: skuFilter === "ALL" ? f.baseline * (f.eventMul - 1) : 0,
  }));

  return (
    <>
      <PageHeader
        title="Demand Forecast"
        subtitle={`Next ${result.forecast.length} weeks · ${state.settings.forecastLookbackWeeks}-week lookback baseline`}
        right={
          <select
            className="input"
            value={skuFilter}
            onChange={(e) => setSkuFilter(e.target.value)}
          >
            <option value="ALL">All SKUs (jars)</option>
            {state.skus.filter((s) => s.active).map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        }
      />

      <div className="card p-4">
        <div className="text-sm font-semibold mb-2">Weekly jars: history → forecast</div>
        <div style={{ height: 360 }}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={[...histChart, ...fwdChart]}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e3edd1" />
              <XAxis dataKey="week" />
              <YAxis />
              <Tooltip formatter={(v) => fmtNum(Number(v) || 0)} />
              <Legend />
              <Bar dataKey="Actual" fill="#65902f" />
              <Line dataKey="Forecast" stroke="#84ac4a" strokeWidth={2} dot={false} />
              {skuFilter === "ALL" && (
                <>
                  <Area dataKey="Baseline" type="monotone" fill="#a4c474" stroke="#a4c474" fillOpacity={0.3} />
                </>
              )}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4 mt-4">
        <div className="card p-4">
          <div className="label">Total forecast (12 weeks)</div>
          <div className="text-2xl font-bold mt-1">
            {fmtNum(result.forecast.reduce((a, b) => a + b.totalJars, 0))}
          </div>
          <div className="text-xs text-pickle-700">jars</div>
        </div>
        <div className="card p-4">
          <div className="label">Avg weekly</div>
          <div className="text-2xl font-bold mt-1">
            {fmtNum(result.forecast.reduce((a, b) => a + b.totalJars, 0) / Math.max(result.forecast.length, 1))}
          </div>
          <div className="text-xs text-pickle-700">jars/wk</div>
        </div>
        <div className="card p-4">
          <div className="label">Active warehouse mix</div>
          <div className="mt-1 text-sm">
            {Object.entries(result.warehouseMix).map(([w, s]) => (
              <div key={w} className="flex justify-between">
                <span>{w}</span>
                <span>{(s * 100).toFixed(1)}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="card p-4 mt-4">
        <div className="text-sm font-semibold mb-2">Forecast detail</div>
        <table className="w-full text-sm">
          <thead className="bg-pickle-50">
            <tr>
              <th>Week</th>
              <th className="text-right">Baseline</th>
              <th className="text-right">Seasonality ×</th>
              <th className="text-right">Ad ×</th>
              <th className="text-right">Event ×</th>
              <th className="text-right">Total Forecast</th>
            </tr>
          </thead>
          <tbody>
            {result.forecast.map((f) => (
              <tr key={f.weekStart}>
                <td>{fmtDateShort(f.weekStart)}</td>
                <td className="text-right">{fmtNum(f.baseline)}</td>
                <td className="text-right">{f.seasonalityMul.toFixed(2)}</td>
                <td className="text-right">{f.adMul.toFixed(2)}</td>
                <td className="text-right">{f.eventMul.toFixed(2)}</td>
                <td className="text-right font-semibold">{fmtNum(f.totalJars)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
