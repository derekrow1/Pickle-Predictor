import { useMemo, useState } from "react";
import { useStore } from "../store/store";
import { computeOrderRecs } from "../lib/orderEngine";
import { fmtMoney, fmtDate, ISO } from "../lib/util";
import { PageHeader } from "../components/Layout";
import { Stat } from "../components/Stat";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import { fmtDateShort } from "../lib/util";

export function CashView() {
  const state = useStore();
  const [newDate, setNewDate] = useState(ISO(new Date()));
  const [newAmount, setNewAmount] = useState<string>("");
  const [withOrders, setWithOrders] = useState(false);
  const upsertBank = useStore((s) => s.upsertBankBalance);
  const removeBank = useStore((s) => s.removeBankBalance);

  const balances = state.bankBalances;
  const latest = balances[balances.length - 1];

  // Estimate weekly burn: average of (revenue - costs) over last 4 weeks from clean orders.
  const result = useMemo(() => computeOrderRecs(state), [state]);
  const weeklyRevenue = useMemo(() => {
    const map = new Map<string, number>();
    for (const o of state.cleanOrders) {
      const ws = o.date.slice(0, 10);
      map.set(ws, (map.get(ws) || 0) + o.orderValue);
    }
    return [...map.entries()].sort();
  }, [state.cleanOrders]);

  // Approximate weekly costs from settings
  const settings = state.settings;
  const recentClean = state.cleanOrders.slice(-2000);
  const orderCount = recentClean.length || 1;
  const estCostsPerOrder =
    settings.packagingCostPerOrder +
    (recentClean.reduce((a, b) => a + b.orderValue, 0) / orderCount) * (settings.processingCostPctOfOrder + settings.promoCostPctOfOrder) +
    settings.fixedFeesPerOrder;
  const totalRevenue = recentClean.reduce((a, b) => a + b.orderValue, 0);
  const totalCosts =
    recentClean.length * estCostsPerOrder +
    recentClean.reduce((a, b) => a + b.totalJars * settings.freightCostPerJarBlended, 0);
  const weeksWorth = Math.max(1, weeklyRevenue.length);
  const weeklyBurn = (totalCosts - totalRevenue) / weeksWorth; // negative = profit

  const projectedPOCash = result.recs
    .filter((r) => r.recommendedQty > 0 && r.managedByMe)
    .reduce((a, r) => {
      const sku = state.skus.find((s) => s.id === r.itemId);
      const comp = state.components.find((c) => c.id === r.itemId);
      const unit = sku?.cogsPerJar ?? comp?.unitCost ?? 0;
      return a + r.recommendedQty * unit;
    }, 0);

  const cashNow = latest?.amount ?? 0;
  const cashAfterOrders = cashNow - projectedPOCash;
  const runwayWeeks = weeklyBurn > 0 ? cashNow / weeklyBurn : 999;
  const runwayAfter = weeklyBurn > 0 ? cashAfterOrders / weeklyBurn : 999;

  const empty = balances.length === 0;
  return (
    <>
      <PageHeader title="Cash & Burn" subtitle="Runway and the impact of upcoming POs" />

      <div className="grid grid-cols-4 gap-4 mb-6">
        <Stat
          label="Cash on hand"
          value={fmtMoney(cashNow)}
          hint={latest ? `As of ${fmtDate(latest.date)}` : "Enter your balance →"}
        />
        <Stat
          label="Weekly burn"
          value={weeklyBurn > 0 ? fmtMoney(weeklyBurn) : `+${fmtMoney(-weeklyBurn)}`}
          hint={weeklyBurn > 0 ? "Net outflow" : "Net profit"}
          tone={weeklyBurn > 0 ? "warn" : "good"}
        />
        <Stat
          label={withOrders ? "Runway after POs" : "Runway"}
          value={
            withOrders
              ? runwayAfter > 99
                ? "—"
                : `${runwayAfter.toFixed(1)}w`
              : runwayWeeks > 99
              ? "—"
              : `${runwayWeeks.toFixed(1)}w`
          }
          tone={withOrders ? (runwayAfter < 8 ? "bad" : "default") : runwayWeeks < 8 ? "bad" : "default"}
        />
        <Stat label="Recommended PO cash" value={fmtMoney(projectedPOCash)} hint="At current COGS" tone="warn" />
      </div>

      <div className="card p-4 mb-6 flex items-center gap-4">
        <label className="text-sm flex items-center gap-2">
          <input type="checkbox" checked={withOrders} onChange={(e) => setWithOrders(e.target.checked)} />
          Show runway <strong>after</strong> placing recommended orders
        </label>
        <div className="text-sm text-pickle-700">
          {withOrders
            ? `Cash drops to ${fmtMoney(cashAfterOrders)}; runway ${runwayAfter > 99 ? "—" : runwayAfter.toFixed(1) + "w"}.`
            : `Toggle on to project the cash impact of all recommended POs.`}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="card p-4">
          <div className="text-sm font-semibold mb-2">Bank balance history</div>
          {empty ? (
            <div className="text-sm text-pickle-700">No balance entries yet.</div>
          ) : (
            <div style={{ height: 220 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={balances}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e3edd1" />
                  <XAxis dataKey="date" tickFormatter={(s) => fmtDateShort(s)} />
                  <YAxis tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                  <Tooltip
                    formatter={(v) => fmtMoney(Number(v) || 0)}
                    labelFormatter={(s) => fmtDate(String(s))}
                  />
                  <Line type="monotone" dataKey="amount" stroke="#65902f" strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
        <div className="card p-4">
          <div className="text-sm font-semibold mb-2">Add bank balance</div>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs">
              Date
              <input
                type="date"
                className="input"
                value={newDate}
                onChange={(e) => setNewDate(e.target.value)}
              />
            </label>
            <label className="text-xs">
              Amount
              <input
                type="number"
                className="input"
                value={newAmount}
                onChange={(e) => setNewAmount(e.target.value)}
              />
            </label>
          </div>
          <button
            className="btn-primary mt-3"
            onClick={() => {
              if (!newAmount) return;
              upsertBank({ date: newDate, amount: parseFloat(newAmount) });
              setNewAmount("");
            }}
          >
            Save
          </button>
          <div className="mt-4 max-h-40 overflow-auto">
            <table className="w-full text-sm">
              <thead><tr><th>Date</th><th className="text-right">Amount</th><th></th></tr></thead>
              <tbody>
                {balances.slice().reverse().map((b) => (
                  <tr key={b.date}>
                    <td>{fmtDate(b.date)}</td>
                    <td className="text-right">{fmtMoney(b.amount)}</td>
                    <td>
                      <button className="text-xs text-red-600" onClick={() => removeBank(b.date)}>
                        delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}
