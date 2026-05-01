import { useMemo } from "react";
import { useStore } from "../store/store";
import { fmtMoney, fmtNum, fmtDateShort, ISO, parseAnyDate, weekStart } from "../lib/util";
import { PageHeader, EmptyState } from "../components/Layout";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from "recharts";

interface WeekRow {
  weekStart: string;
  orders: number;
  jars: number;
  revenue: number;
  cogs: number;
  freight: number;
  packaging: number;
  processing: number;
  shipping: number;
  promo: number;
  fees: number;
  profit: number;
}

export function ProfitView() {
  const state = useStore();

  const weekly = useMemo(() => {
    const map = new Map<string, WeekRow>();
    const settings = state.settings;
    for (const o of state.cleanOrders) {
      const d = parseAnyDate(o.date);
      if (!d) continue;
      const ws = ISO(weekStart(d));
      if (!map.has(ws)) {
        map.set(ws, {
          weekStart: ws,
          orders: 0,
          jars: 0,
          revenue: 0,
          cogs: 0,
          freight: 0,
          packaging: 0,
          processing: 0,
          shipping: 0,
          promo: 0,
          fees: 0,
          profit: 0,
        });
      }
      const w = map.get(ws)!;
      w.orders += 1;
      w.jars += o.totalJars;
      w.revenue += o.orderValue;
      // COGS: per-SKU
      for (const [skuId, qty] of Object.entries(o.units)) {
        const sku = state.skus.find((s) => s.id === skuId);
        if (sku) w.cogs += qty * sku.cogsPerJar;
      }
      w.freight += o.totalJars * settings.freightCostPerJarBlended;
      w.packaging += settings.packagingCostPerOrder;
      w.processing += o.orderValue * settings.processingCostPctOfOrder;
      w.fees += settings.fixedFeesPerOrder;
      // Shipping cost: small order ≤ 3 jars ⇒ small estimate
      const isSmall = o.totalJars <= 3;
      w.shipping += isSmall ? settings.smallOrderShippingEstimate : settings.largeOrderShippingEstimate;
      w.promo += o.discountValue;
    }
    for (const w of map.values()) {
      w.profit =
        w.revenue - w.cogs - w.freight - w.packaging - w.processing - w.shipping - w.promo - w.fees;
    }
    return [...map.values()].sort((a, b) => a.weekStart.localeCompare(b.weekStart));
  }, [state.cleanOrders, state.skus, state.settings]);

  if (weekly.length === 0) {
    return (
      <>
        <PageHeader title="Profitability" subtitle="Weekly P&L from Shopify" />
        <EmptyState title="Upload Shopify orders first" />
      </>
    );
  }

  const totals = weekly.reduce(
    (acc, w) => {
      acc.revenue += w.revenue;
      acc.cogs += w.cogs;
      acc.freight += w.freight;
      acc.packaging += w.packaging;
      acc.processing += w.processing;
      acc.shipping += w.shipping;
      acc.promo += w.promo;
      acc.fees += w.fees;
      acc.profit += w.profit;
      return acc;
    },
    { revenue: 0, cogs: 0, freight: 0, packaging: 0, processing: 0, shipping: 0, promo: 0, fees: 0, profit: 0 },
  );

  return (
    <>
      <PageHeader title="Profitability" subtitle="Weekly P&L derived from your Shopify export" />

      <div className="card p-4 mb-6">
        <div style={{ height: 280 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={weekly.slice(-26).map((w) => ({ ...w, week: fmtDateShort(w.weekStart) }))}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e3edd1" />
              <XAxis dataKey="week" />
              <YAxis tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
              <Tooltip formatter={(v) => fmtMoney(Number(v) || 0)} />
              <Legend />
              <Bar dataKey="revenue" fill="#65902f" name="Revenue" />
              <Bar dataKey="profit" fill="#84ac4a" name="Profit" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="card overflow-auto">
        <table className="w-full text-sm">
          <thead className="bg-pickle-50 sticky top-0">
            <tr>
              <th>Week</th>
              <th className="text-right">Orders</th>
              <th className="text-right">Jars</th>
              <th className="text-right">Revenue</th>
              <th className="text-right">COGS</th>
              <th className="text-right">Freight</th>
              <th className="text-right">Packaging</th>
              <th className="text-right">Processing</th>
              <th className="text-right">Shipping</th>
              <th className="text-right">Promo</th>
              <th className="text-right">Fees</th>
              <th className="text-right">Profit</th>
            </tr>
          </thead>
          <tbody>
            {weekly.map((w) => (
              <tr key={w.weekStart}>
                <td>{fmtDateShort(w.weekStart)}</td>
                <td className="text-right">{fmtNum(w.orders)}</td>
                <td className="text-right">{fmtNum(w.jars)}</td>
                <td className="text-right">{fmtMoney(w.revenue)}</td>
                <td className="text-right">{fmtMoney(w.cogs)}</td>
                <td className="text-right">{fmtMoney(w.freight)}</td>
                <td className="text-right">{fmtMoney(w.packaging)}</td>
                <td className="text-right">{fmtMoney(w.processing)}</td>
                <td className="text-right">{fmtMoney(w.shipping)}</td>
                <td className="text-right">{fmtMoney(w.promo)}</td>
                <td className="text-right">{fmtMoney(w.fees)}</td>
                <td className={"text-right font-semibold " + (w.profit >= 0 ? "text-pickle-700" : "text-red-700")}>
                  {fmtMoney(w.profit)}
                </td>
              </tr>
            ))}
            <tr className="bg-pickle-50 font-semibold">
              <td>Total ({weekly.length}w)</td>
              <td colSpan={2}></td>
              <td className="text-right">{fmtMoney(totals.revenue)}</td>
              <td className="text-right">{fmtMoney(totals.cogs)}</td>
              <td className="text-right">{fmtMoney(totals.freight)}</td>
              <td className="text-right">{fmtMoney(totals.packaging)}</td>
              <td className="text-right">{fmtMoney(totals.processing)}</td>
              <td className="text-right">{fmtMoney(totals.shipping)}</td>
              <td className="text-right">{fmtMoney(totals.promo)}</td>
              <td className="text-right">{fmtMoney(totals.fees)}</td>
              <td className="text-right">{fmtMoney(totals.profit)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </>
  );
}
