import { useMemo, useState } from "react";
import Papa from "papaparse";
import { PageHeader } from "../components/Layout";
import {
  applyCustomerSubscriptionEmails,
  computeDashboard,
  computeScenario,
  enrichSubscribers,
  normalizeShopifyApiOrders,
  parseShopifyOrdersExportRows,
  scenarioFromBaseline,
  subscriberEmailsFromCustomerExport,
  type LtvBaseline,
  type LtvDashboard,
  type LtvOrder,
  type LtvScenario,
} from "../lib/ltv";
import { fmtNum } from "../lib/util";

function pct(x: number | null | undefined) {
  if (x == null || !Number.isFinite(x)) return "—";
  return `${(x * 100).toFixed(1)}%`;
}

function money(x: number | null | undefined) {
  if (x == null || !Number.isFinite(x)) return "—";
  return `$${x.toFixed(2)}`;
}

async function parseCsvFile(file: File): Promise<Record<string, unknown>[]> {
  const name = (file.name || "").toLowerCase();
  if (name.endsWith(".xlsx") || name.endsWith(".xls")) {
    throw new Error("This page expects a .csv file (Shopify → Export orders → CSV). Excel .xlsx won’t parse here.");
  }
  let text = await file.text();
  text = text.replace(/^\uFEFF/, "");
  const parsed = Papa.parse<Record<string, unknown>>(text, {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (h) => String(h).replace(/^\uFEFF/g, "").trim(),
  });
  const rows = (parsed.data || []).filter((r) => r && Object.keys(r).some((k) => String((r as Record<string, unknown>)[k] ?? "").trim() !== ""));
  const fatal = (parsed.errors || []).filter((e) => e && e.type !== "Quotes" && e.code !== "UndetectableDelimiter");
  if (rows.length === 0 && fatal.length > 0) {
    throw new Error(fatal[0]?.message || "Could not parse CSV.");
  }
  return rows;
}

function HistogramTable({
  title,
  rows,
}: {
  title: string;
  rows: Array<{ k: number; customers: number }>;
}) {
  if (!rows.length) {
    return (
      <div className="text-xs text-pickle-700 py-2">
        No data for <strong>{title}</strong>.
      </div>
    );
  }
  return (
    <div className="mb-3">
      <div className="text-xs font-semibold text-pickle-800 mb-1">{title}</div>
      <div className="flex flex-wrap gap-1">
        {rows.map((r) => (
          <div
            key={`${title}-${r.k}`}
            className="text-[11px] rounded border border-pickle-100 px-2 py-1 bg-white"
            title={`${r.customers} customers with ${r.k} order(s)`}
          >
            <span className="font-semibold">{r.k}×</span>{" "}
            <span className="text-pickle-700">{fmtNum(r.customers)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function BaselineMini({ b, label }: { b: LtvBaseline; label: string }) {
  return (
    <div className="rounded border border-pickle-100 p-3 bg-pickle-50/40">
      <div className="text-xs font-semibold text-pickle-900 mb-2">{label}</div>
      <div className="grid grid-cols-2 gap-y-0.5 text-[11px]">
        <span className="text-pickle-700">Purchasers</span>
        <span className="text-right font-semibold">{fmtNum(b.purchasers)}</span>
        <span className="text-pickle-700">Reorder rate</span>
        <span className="text-right font-semibold">{pct(b.reorderRate)}</span>
        <span className="text-pickle-700">AOV</span>
        <span className="text-right font-semibold">{money(b.aov)}</span>
        <span className="text-pickle-700">Avg orders / cust</span>
        <span className="text-right font-semibold">{b.avgOrdersPerCustomer.toFixed(2)}</span>
        <span className="text-pickle-700">Mature ({b.matureMinTenureDays}d+) cust</span>
        <span className="text-right font-semibold">{fmtNum(b.maturePurchasers)}</span>
        <span className="text-pickle-700">Median gap (repeat)</span>
        <span className="text-right font-semibold">
          {b.medianDaysBetweenOrdersRepeaters == null ? "—" : `${b.medianDaysBetweenOrdersRepeaters.toFixed(0)}d`}
        </span>
      </div>
    </div>
  );
}

function ScenarioPanel({
  title,
  scenario,
  setScenario,
  baseline,
  onReset,
}: {
  title: string;
  scenario: LtvScenario;
  setScenario: (s: LtvScenario) => void;
  baseline: LtvBaseline;
  onReset: () => void;
}) {
  const res = useMemo(() => computeScenario(scenario), [scenario]);
  return (
    <div className="rounded border border-pickle-100 p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm font-semibold">{title}</div>
        <button type="button" className="text-xs btn-secondary py-1 px-2" onClick={onReset}>
          Reset
        </button>
      </div>
      <div className="grid gap-2 text-xs mb-2">
        <label>
          <div className="label">Horizon (months)</div>
          <input
            type="number"
            className="input w-full"
            min={1}
            max={60}
            value={scenario.horizonMonths}
            onChange={(e) => setScenario({ ...scenario, horizonMonths: Number(e.target.value) })}
          />
        </label>
        <label>
          <div className="label">AOV ($)</div>
          <input
            type="number"
            className="input w-full"
            min={0}
            step={0.01}
            value={scenario.aov}
            onChange={(e) => setScenario({ ...scenario, aov: Number(e.target.value) })}
          />
        </label>
        <label>
          <div className="label">Expected orders / customer (horizon)</div>
          <input
            type="number"
            className="input w-full"
            min={0}
            step={0.1}
            value={scenario.expectedOrdersPerCustomer}
            onChange={(e) =>
              setScenario({ ...scenario, expectedOrdersPerCustomer: Number(e.target.value) })
            }
          />
        </label>
        <label>
          <div className="label">Margin (%)</div>
          <input
            type="number"
            className="input w-full"
            min={0}
            max={100}
            step={0.1}
            value={scenario.marginPct}
            onChange={(e) => setScenario({ ...scenario, marginPct: Number(e.target.value) })}
          />
        </label>
      </div>
      <div className="text-[11px] text-pickle-700 mb-1">Baseline hint: avg orders {baseline.avgOrdersPerCustomer.toFixed(2)}</div>
      <div className="grid grid-cols-2 gap-y-0.5 text-xs border-t border-pickle-100 pt-2">
        <span className="text-pickle-700">Revenue LTV</span>
        <span className="text-right font-semibold">{money(res.ltvRevenue)}</span>
        <span className="text-pickle-700">Profit LTV</span>
        <span className="text-right font-semibold">{money(res.ltvProfit)}</span>
        <span className="text-pickle-700">Break-even CAC</span>
        <span className="text-right font-semibold">{money(res.breakEvenCAC)}</span>
      </div>
    </div>
  );
}

export function LtvView() {
  const [orders, setOrders] = useState<LtvOrder[]>([]);
  const [dashboard, setDashboard] = useState<LtvDashboard | null>(null);
  const [matureDays, setMatureDays] = useState(90);

  const [scenarioSub, setScenarioSub] = useState<LtvScenario>({
    horizonMonths: 12,
    aov: 45,
    expectedOrdersPerCustomer: 2.5,
    marginPct: 10,
  });
  const [scenarioNon, setScenarioNon] = useState<LtvScenario>({
    horizonMonths: 12,
    aov: 45,
    expectedOrdersPerCustomer: 2.5,
    marginPct: 10,
  });

  const [baselineScenarioSub, setBaselineScenarioSub] = useState<LtvScenario | null>(null);
  const [baselineScenarioNon, setBaselineScenarioNon] = useState<LtvScenario | null>(null);

  const [status, setStatus] = useState<string>("");

  const ingestOrders = (o: LtvOrder[], mature: number) => {
    const enriched = enrichSubscribers(o);
    setOrders(enriched);
    const d = computeDashboard(enriched, mature);
    setDashboard(d);
    const bs = scenarioFromBaseline(d.subscribers);
    const bn = scenarioFromBaseline(d.nonSubscribers);
    setScenarioSub(bs);
    setScenarioNon(bn);
    setBaselineScenarioSub(bs);
    setBaselineScenarioNon(bn);
  };

  const resetAll = () => {
    if (!baselineScenarioSub || !baselineScenarioNon) return;
    setScenarioSub({ ...baselineScenarioSub });
    setScenarioNon({ ...baselineScenarioNon });
  };

  const handleOrdersCsv = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setStatus("Parsing orders export…");
    try {
      const rows = await parseCsvFile(file);
      const { orders: parsed, stats } = parseShopifyOrdersExportRows(rows);
      ingestOrders(parsed, matureDays);
      if (parsed.length === 0) {
        setStatus(
          `Parsed ${fmtNum(stats.inputRows)} data rows → ${fmtNum(stats.orderGroups)} order groups, but 0 usable paid orders. ` +
            `Skipped: unpaid ${fmtNum(stats.skippedUnpaid)}, no email ${fmtNum(stats.skippedNoEmail)}, bad total ${fmtNum(stats.skippedBadTotal)}, bad date ${fmtNum(stats.skippedBadDate)}. ` +
            `Use Shopify’s line-item orders CSV with columns Email, Financial Status, Created at, Total, Id (or Name).`,
        );
      } else {
        setStatus(
          `Loaded ${fmtNum(parsed.length)} paid orders (${fmtNum(stats.orderGroups)} order groups from ${fmtNum(stats.inputRows)} rows). Subscriber split applied.`,
        );
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setStatus(`Error: ${msg}`);
    }
    e.target.value = "";
  };

  const handleCustomersCsv = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!orders.length) {
      setStatus("Upload orders CSV first, then customers CSV.");
      e.target.value = "";
      return;
    }
    setStatus("Merging customer subscription tags…");
    try {
      const rows = await parseCsvFile(file);
      const subEmails = subscriberEmailsFromCustomerExport(rows);
      const merged = applyCustomerSubscriptionEmails(orders, subEmails);
      ingestOrders(merged, matureDays);
      setStatus(`Merged customer tags (${fmtNum(subEmails.size)} subscription-tagged emails).`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setStatus(`Error: ${msg}`);
    }
    e.target.value = "";
  };

  const refreshFromShopify = async () => {
    setStatus("Fetching from Shopify…");
    try {
      const r = await fetch("/api/shopify/pull");
      const data = (await r.json()) as { orders?: unknown[]; error?: string };
      if (!r.ok) throw new Error(data?.error || "Shopify fetch failed");

      const parsed = normalizeShopifyApiOrders(data?.orders || []);
      ingestOrders(parsed, matureDays);
      setStatus(`Fetched ${parsed.length} paid orders from Shopify.`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setStatus(`Error: ${msg}`);
    }
  };

  const recomputeMature = () => {
    if (!orders.length) return;
    ingestOrders(orders, matureDays);
  };

  const bAll = dashboard?.all;

  return (
    <>
      <PageHeader
        title="LTV Scenarios"
        subtitle="Subscribers vs non-subscribers, mature-cohort context, reorder histograms, and simplified channels (Shopify / Amazon / TikTok)."
        right={
          <div className="flex gap-2">
            <button type="button" className="btn-secondary" onClick={resetAll} disabled={!baselineScenarioSub}>
              Reset scenarios
            </button>
            <button type="button" className="btn-primary" onClick={refreshFromShopify}>
              Refresh from Shopify
            </button>
          </div>
        }
      />

      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-12 lg:col-span-4">
          <div className="card p-4 mb-4">
            <div className="text-sm font-semibold mb-2">📥 Load data</div>
            <div className="text-xs text-pickle-700 mb-2">
              Upload <strong>Orders</strong> export (paid rows only). Optionally upload <strong>Customers</strong> export
              to tag subscribers via the <code>Tags</code> column (e.g. “Subscription Active”).
            </div>
            <div className="space-y-2">
              <label className="block text-xs">
                Orders CSV
                <input className="block mt-1" type="file" accept=".csv" onChange={handleOrdersCsv} />
              </label>
              <label className="block text-xs">
                Customers CSV (optional)
                <input className="block mt-1" type="file" accept=".csv" onChange={handleCustomersCsv} />
              </label>
            </div>
            <label className="block mt-3 text-xs">
              Mature cohort min. tenure (days since first order)
              <input
                type="number"
                className="input w-full mt-1"
                min={30}
                max={365}
                value={matureDays}
                onChange={(e) => setMatureDays(Number(e.target.value))}
                onBlur={recomputeMature}
              />
            </label>
            {status && <div className="text-sm mt-2">{status}</div>}
            {bAll && (
              <div className="mt-3 text-xs text-pickle-700">
                First order: <strong>{bAll.firstOrderDateISO?.slice(0, 10) ?? "—"}</strong>
                <br />
                Last order: <strong>{bAll.endDateISO?.slice(0, 10) ?? "—"}</strong>
                <br />
                Paid orders loaded: <strong>{fmtNum(orders.length)}</strong>
              </div>
            )}
          </div>

          <div className="card p-4 mb-4">
            <div className="text-sm font-semibold mb-2">🧭 Mature vs recent</div>
            <div className="text-xs text-pickle-700">
              Customers whose <strong>first order</strong> was fewer than <strong>{matureDays}</strong> days before the
              latest order are still “ramping” — repeat rates can look low until they have had time to reorder. Mature
              histograms isolate customers with enough tenure to compare fairly.
            </div>
          </div>

          {dashboard ? (
            <div className="grid grid-cols-1 gap-3">
              <ScenarioPanel
                title="Scenario · Subscribers"
                scenario={scenarioSub}
                setScenario={setScenarioSub}
                baseline={dashboard.subscribers}
                onReset={() => baselineScenarioSub && setScenarioSub({ ...baselineScenarioSub })}
              />
              <ScenarioPanel
                title="Scenario · Non-subscribers"
                scenario={scenarioNon}
                setScenario={setScenarioNon}
                baseline={dashboard.nonSubscribers}
                onReset={() => baselineScenarioNon && setScenarioNon({ ...baselineScenarioNon })}
              />
            </div>
          ) : (
            <div className="card p-4 text-xs text-pickle-700">Load orders to unlock subscriber vs non-subscriber scenarios.</div>
          )}
        </div>

        <div className="col-span-12 lg:col-span-8 space-y-4">
          {!dashboard ? (
            <div className="card p-6 text-sm text-pickle-700">Load orders to see subscriber splits and histograms.</div>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <BaselineMini b={dashboard.all} label="All customers" />
                <BaselineMini b={dashboard.subscribers} label="Subscribers" />
                <BaselineMini b={dashboard.nonSubscribers} label="Non-subscribers" />
              </div>

              <div className="card p-4">
                <div className="text-sm font-semibold mb-2">Reorder counts (customers by # of paid orders)</div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                  <div>
                    <div className="font-semibold text-pickle-900 mb-1">All</div>
                    <HistogramTable title="Observed (all tenure)" rows={dashboard.all.orderHistogram} />
                    <HistogramTable title={`Mature (≥${matureDays}d tenure)`} rows={dashboard.all.orderHistogramMature} />
                    <HistogramTable title="Projected (simple)" rows={dashboard.all.orderHistogramProjected} />
                    <div className="text-[11px] text-pickle-600">{dashboard.all.projectionSummary}</div>
                  </div>
                  <div>
                    <div className="font-semibold text-pickle-900 mb-1">Subscribers</div>
                    <HistogramTable title="Observed" rows={dashboard.subscribers.orderHistogram} />
                    <HistogramTable title="Mature" rows={dashboard.subscribers.orderHistogramMature} />
                    <HistogramTable title="Projected" rows={dashboard.subscribers.orderHistogramProjected} />
                    <div className="text-[11px] text-pickle-600">{dashboard.subscribers.projectionSummary}</div>
                  </div>
                  <div>
                    <div className="font-semibold text-pickle-900 mb-1">Non-subscribers</div>
                    <HistogramTable title="Observed" rows={dashboard.nonSubscribers.orderHistogram} />
                    <HistogramTable title="Mature" rows={dashboard.nonSubscribers.orderHistogramMature} />
                    <HistogramTable title="Projected" rows={dashboard.nonSubscribers.orderHistogramProjected} />
                    <div className="text-[11px] text-pickle-600">{dashboard.nonSubscribers.projectionSummary}</div>
                  </div>
                </div>
              </div>

              <div className="card p-4">
                <div className="text-sm font-semibold mb-2">Channels (Shopify / Amazon / TikTok)</div>
                <div className="text-[11px] text-pickle-700 mb-2">
                  Shopify = DTC storefront (web, subscriptions checkout, POS, etc.). Amazon / TikTok from source or
                  tags.
                </div>
                <div className="overflow-auto">
                  <table className="text-xs w-full min-w-[520px]">
                    <thead className="bg-pickle-50">
                      <tr>
                        <th className="text-left py-1">Channel</th>
                        <th className="text-right">Purchasers</th>
                        <th className="text-right">Subscribers</th>
                        <th className="text-right">Non-sub</th>
                        <th className="text-right">Reorder</th>
                        <th className="text-right">AOV</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dashboard.all.byChannel.map((r) => (
                        <tr key={r.channel} className="border-t border-pickle-50">
                          <td className="py-1 font-medium">{r.channel}</td>
                          <td className="text-right">{fmtNum(r.purchasers)}</td>
                          <td className="text-right">{fmtNum(r.subscribers)}</td>
                          <td className="text-right">{fmtNum(r.nonSubscribers)}</td>
                          <td className="text-right">{pct(r.reorderRate)}</td>
                          <td className="text-right">{money(r.aov)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="card p-4">
                <div className="text-sm font-semibold mb-2">First SKU × subscriber segment</div>
                <div className="text-[11px] text-pickle-700 mb-2">
                  Top rows by purchaser count. “First SKU” is best-effort from the first line item with a SKU on the
                  order header row.
                </div>
                <div className="overflow-auto max-h-[360px]">
                  <table className="text-xs w-full min-w-[480px]">
                    <thead className="bg-pickle-50 sticky top-0">
                      <tr>
                        <th className="text-left">SKU</th>
                        <th className="text-left">Segment</th>
                        <th className="text-right">Purchasers</th>
                        <th className="text-right">Reorder</th>
                        <th className="text-right">AOV</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dashboard.all.byFirstSkuSubscriber.map((r, i) => (
                        <tr key={`${r.sku}-${r.segment}-${i}`} className="border-t border-pickle-50">
                          <td className="py-1">{r.sku}</td>
                          <td>{r.segment}</td>
                          <td className="text-right">{fmtNum(r.purchasers)}</td>
                          <td className="text-right">{pct(r.reorderRate)}</td>
                          <td className="text-right">{money(r.aov)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="card p-4">
                <div className="text-sm font-semibold mb-2">Attrition proxy (all customers)</div>
                <div className="grid grid-cols-3 gap-3">
                  {[60, 90, 120].map((d) => (
                    <div key={d} className="rounded border border-pickle-100 p-3">
                      <div className="text-xs text-pickle-700">Churn ≥ {d} days</div>
                      <div className="text-lg font-bold text-pickle-900">{pct(dashboard.all.churnRates[d])}</div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
