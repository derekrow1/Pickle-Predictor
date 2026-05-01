import { useState } from "react";
import { useStore, exportStateAsJSON } from "../store/store";
import { PageHeader } from "../components/Layout";
import { buildDefaultStateMap } from "../lib/constants";
import { uid, fmtNum, fmtDate } from "../lib/util";
import type {
  ComponentItem,
  OpenPO,
  OpenPOLine,
  Receipt,
  ReceiptLine,
  Sku,
  Warehouse,
} from "../types";

export function SettingsView() {
  const state = useStore();
  const update = useStore((s) => s.updateSettings);
  const upsertSku = useStore((s) => s.upsertSku);
  const removeSku = useStore((s) => s.removeSku);
  const renameSku = useStore((s) => s.renameSku);
  const upsertComp = useStore((s) => s.upsertComponent);
  const removeComp = useStore((s) => s.removeComponent);
  const renameComp = useStore((s) => s.renameComponent);
  const upsertWh = useStore((s) => s.upsertWarehouse);
  const removeWh = useStore((s) => s.removeWarehouse);
  const renameWh = useStore((s) => s.renameWarehouse);
  const setMap = useStore((s) => s.setWarehouseStateMap);
  const upsertPO = useStore((s) => s.upsertPO);
  const removePO = useStore((s) => s.removePO);
  const markPOReceived = useStore((s) => s.markPOReceived);
  const reopenPO = useStore((s) => s.reopenPO);
  const addReceipt = useStore((s) => s.addReceipt);
  const removeReceipt = useStore((s) => s.removeReceipt);
  const reset = useStore((s) => s.reset);
  const resetAssumptions = useStore((s) => s.resetAssumptions);
  const importJSON = useStore((s) => s.importJSON);
  const [importErr, setImportErr] = useState("");

  const onExport = () => {
    const json = exportStateAsJSON(state);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `pickle-predictor-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const onImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      importJSON(parsed);
      setImportErr("");
    } catch (err: any) {
      setImportErr(`Import failed: ${err.message}`);
    }
    e.target.value = "";
  };

  const s = state.settings;

  return (
    <>
      <PageHeader title="Settings"
        subtitle="All thresholds, lead times, and mappings live here. No magic numbers."
        right={
          <div className="flex gap-2">
            <button className="btn-secondary" onClick={onExport}>Export JSON</button>
            <label className="btn-secondary cursor-pointer">
              Import JSON
              <input type="file" accept=".json" className="hidden" onChange={onImport} />
            </label>
            <button
              className="btn-danger"
              title="Resets only the assumptions below (lead time, shelf life, forecast, cost %, etc.). Preserves your open POs, receipts, inventory uploads, retailers, marketing data, and bank balances."
              onClick={() => {
                if (
                  confirm(
                    "Reset assumptions?\n\nThis resets:\n  • Lead time & shelf life\n  • Forecast targets, lookback, growth, seasonality\n  • Ad elasticity & baseline\n  • Cost-of-goods percentages and shipping estimates\n\nIt does NOT touch:\n  • Open POs / Receipts\n  • Inventory uploads\n  • Shopify orders\n  • Retailers & velocities\n  • Marketing data\n  • Bank balances\n  • SKU / Component / Warehouse lists",
                  )
                ) {
                  resetAssumptions();
                }
              }}
            >
              Reset assumptions
            </button>
          </div>
        }
      />
      {importErr && <div className="text-red-600 text-sm mb-3">{importErr}</div>}

      <div className="grid grid-cols-2 gap-4">
        <div className="card p-4">
          <h2 className="font-semibold text-pickle-900 mb-3">Lead Time & Shelf Life</h2>
          <Field label="Manufacturer lead (weeks)" value={s.manufacturerLeadWeeks} step={1} onChange={(v) => update({ manufacturerLeadWeeks: v })}/>
          <Field label="Shipping transit (days)" value={s.shippingTransitDays} step={1} onChange={(v) => update({ shippingTransitDays: v })}/>
          <Field label="Total shelf life (weeks)" value={s.totalShelfLifeWeeks} step={1} onChange={(v) => update({ totalShelfLifeWeeks: v })}/>
          <Field label="E-comm: min weeks at customer" value={s.ecommerceMinWeeksAtCustomer} step={1} onChange={(v) => update({ ecommerceMinWeeksAtCustomer: v })}/>
          <div className="mt-3 pt-3 border-t border-pickle-100">
            <label className="text-sm flex items-center gap-2">
              <input type="checkbox" checked={s.retailEnabled} onChange={(e) => update({ retailEnabled: e.target.checked })} />
              Enable retail mode (apply 70% freshness rule)
            </label>
            <Field label="Retail freshness % at receipt" value={s.retailFreshnessPct} step={0.05} onChange={(v) => update({ retailFreshnessPct: v })}/>
          </div>
        </div>

        <div className="card p-4">
          <h2 className="font-semibold text-pickle-900 mb-3">Targets & Forecast</h2>
          <Field label="Pickle target weeks-on-hand" value={s.pickleTargetWeeksOnHand} step={1} onChange={(v) => update({ pickleTargetWeeksOnHand: v })}/>
          <Field label="Component default target weeks" value={s.componentTargetWeeksOnHand} step={1} onChange={(v) => update({ componentTargetWeeksOnHand: v })}/>
          <Field label="Min weeks (alert)" value={s.defaultMinWeeksOnHand} step={1} onChange={(v) => update({ defaultMinWeeksOnHand: v })}/>
          <Field label="Max weeks (alert)" value={s.defaultMaxWeeksOnHand} step={1} onChange={(v) => update({ defaultMaxWeeksOnHand: v })}/>
          <Field label="Forecast lookback (weeks)" value={s.forecastLookbackWeeks} step={1} onChange={(v) => update({ forecastLookbackWeeks: v })}/>
          <Field label="Weekly growth rate" value={s.weeklyGrowthRate} step={0.005} onChange={(v) => update({ weeklyGrowthRate: v })}/>
          <Field label="Summer seasonality lift" value={s.summerSeasonalityPct} step={0.01} onChange={(v) => update({ summerSeasonalityPct: v })}/>
          <Field label="Summer start month (1-12)" value={s.summerStartMonth} step={1} onChange={(v) => update({ summerStartMonth: v })}/>
          <Field label="Summer end month (1-12)" value={s.summerEndMonth} step={1} onChange={(v) => update({ summerEndMonth: v })}/>
          <Field label="Ad elasticity (per $1k over baseline)" value={s.adElasticity} step={0.005} onChange={(v) => update({ adElasticity: v })}/>
          <Field label="Ad baseline weekly $" value={s.adBaselineWeekly} step={500} onChange={(v) => update({ adBaselineWeekly: v })}/>
        </div>

        <div className="card p-4">
          <h2 className="font-semibold text-pickle-900 mb-3">Cost assumptions</h2>
          <Field label="Small-order shipping est ($)" value={s.smallOrderShippingEstimate} step={1} onChange={(v) => update({ smallOrderShippingEstimate: v })}/>
          <Field label="Large-order shipping est ($)" value={s.largeOrderShippingEstimate} step={1} onChange={(v) => update({ largeOrderShippingEstimate: v })}/>
          <Field label="Freight cost / jar (blended)" value={s.freightCostPerJarBlended} step={0.05} onChange={(v) => update({ freightCostPerJarBlended: v })}/>
          <Field label="Packaging cost / order" value={s.packagingCostPerOrder} step={0.10} onChange={(v) => update({ packagingCostPerOrder: v })}/>
          <Field label="Processing % of order" value={s.processingCostPctOfOrder} step={0.001} onChange={(v) => update({ processingCostPctOfOrder: v })}/>
          <Field label="Promo % of order" value={s.promoCostPctOfOrder} step={0.005} onChange={(v) => update({ promoCostPctOfOrder: v })}/>
          <Field label="Fees / order" value={s.fixedFeesPerOrder} step={0.05} onChange={(v) => update({ fixedFeesPerOrder: v })}/>
        </div>

        <div className="card p-4">
          <h2 className="font-semibold text-pickle-900 mb-3">SKUs</h2>
          <table className="w-full text-sm">
            <thead><tr><th>ID</th><th>Name</th><th>oz</th><th>Retail</th><th>COGS/jar</th><th>Order× / unit</th><th>Active</th><th></th></tr></thead>
            <tbody>
              {state.skus.map((sku, i) => (
                <tr key={`sku-row-${i}`}>
                  <td><input className="input" value={sku.id} onChange={(e) => renameSku(sku.id, e.target.value)}/></td>
                  <td><input className="input" value={sku.name} onChange={(e) => upsertSku({ ...sku, name: e.target.value })}/></td>
                  <td><input className="input w-16" type="number" value={sku.jarOz} onChange={(e) => upsertSku({ ...sku, jarOz: parseInt(e.target.value) as any })}/></td>
                  <td><input className="input w-20" type="number" step="0.01" value={sku.retailPrice} onChange={(e) => upsertSku({ ...sku, retailPrice: parseFloat(e.target.value) })}/></td>
                  <td><input className="input w-20" type="number" step="0.01" value={sku.cogsPerJar} onChange={(e) => upsertSku({ ...sku, cogsPerJar: parseFloat(e.target.value) })}/></td>
                  <td className="whitespace-nowrap">
                    <input className="input w-16" type="number" min={1} step={1} value={sku.orderMultiple ?? 6}
                      onChange={(e) => upsertSku({ ...sku, orderMultiple: parseInt(e.target.value) || 1 })}/>
                    <input className="input w-16 ml-1" placeholder="case" value={sku.orderUnitLabel ?? ""}
                      onChange={(e) => upsertSku({ ...sku, orderUnitLabel: e.target.value })}/>
                  </td>
                  <td><input type="checkbox" checked={sku.active} onChange={(e) => upsertSku({ ...sku, active: e.target.checked })}/></td>
                  <td><button className="text-xs text-red-600" onClick={() => removeSku(sku.id)}>×</button></td>
                </tr>
              ))}
            </tbody>
          </table>
          <button className="btn-secondary mt-2" onClick={() => upsertSku({ id: `NEW${Date.now() % 1000}`, name: "New SKU", jarOz: 19, retailPrice: 9.99, cogsPerJar: 3.2, orderMultiple: 6, orderUnitLabel: "case", active: true })}>+ Add SKU</button>
        </div>

        <div className="card p-4 col-span-2">
          <h2 className="font-semibold text-pickle-900 mb-3">Components</h2>
          <div className="text-xs text-pickle-700 mb-2">
            <strong>Order × / unit</strong>: minimum order quantity (e.g. 500 boxes per pallet). Recommendations get rounded up to a multiple of this. Set to 1 for no rounding.
          </div>
          <table className="w-full text-sm">
            <thead><tr><th>ID</th><th>Name</th><th>Category</th><th>Managed</th><th>Target wks</th><th>Unit cost</th><th>Order× / unit</th><th></th></tr></thead>
            <tbody>
              {state.components.map((c, i) => (
                <tr key={`comp-row-${i}`}>
                  <td><input className="input" value={c.id} onChange={(e) => renameComp(c.id, e.target.value)}/></td>
                  <td><input className="input" value={c.name} onChange={(e) => upsertComp({ ...c, name: e.target.value })}/></td>
                  <td>
                    <select className="input" value={c.category} onChange={(e) => upsertComp({ ...c, category: e.target.value as any })}>
                      <option value="box">box</option>
                      <option value="liner">liner</option>
                      <option value="gel">gel</option>
                      <option value="service">service</option>
                      <option value="other">other</option>
                    </select>
                  </td>
                  <td><input type="checkbox" checked={c.managedByMe} onChange={(e) => upsertComp({ ...c, managedByMe: e.target.checked })}/></td>
                  <td><input className="input w-16" type="number" value={c.targetWeeksOnHand} onChange={(e) => upsertComp({ ...c, targetWeeksOnHand: parseFloat(e.target.value) })}/></td>
                  <td><input className="input w-20" type="number" step="0.05" value={c.unitCost} onChange={(e) => upsertComp({ ...c, unitCost: parseFloat(e.target.value) })}/></td>
                  <td className="whitespace-nowrap">
                    <input className="input w-20" type="number" min={1} step={1} value={c.orderMultiple ?? 1}
                      onChange={(e) => upsertComp({ ...c, orderMultiple: parseInt(e.target.value) || 1 })}/>
                    <input className="input w-16 ml-1" placeholder="pallet" value={c.orderUnitLabel ?? ""}
                      onChange={(e) => upsertComp({ ...c, orderUnitLabel: e.target.value })}/>
                  </td>
                  <td><button className="text-xs text-red-600" onClick={() => removeComp(c.id)}>×</button></td>
                </tr>
              ))}
            </tbody>
          </table>
          <button className="btn-secondary mt-2" onClick={() => upsertComp({ id: `NEW${Date.now() % 1000}`, name: "New Component", category: "other", managedByMe: true, targetWeeksOnHand: 10, unitCost: 0, orderMultiple: 1, orderUnitLabel: "" })}>+ Add Component</button>
        </div>

        <div className="card p-4 col-span-2">
          <h2 className="font-semibold text-pickle-900 mb-3">Warehouses & state routing</h2>
          {state.warehouses.map((w, i) => (
            <div key={`wh-row-${i}`} className="border-b border-pickle-100 py-2 grid grid-cols-12 gap-2 items-center">
              <input className="input col-span-1" value={w.id} onChange={(e) => renameWh(w.id, e.target.value)}/>
              <input className="input col-span-2" value={w.name} onChange={(e) => upsertWh({ ...w, name: e.target.value })}/>
              <input className="input col-span-7" value={w.states.join(",")} onChange={(e) => upsertWh({ ...w, states: e.target.value.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean) })} placeholder="MO,KS,TX,..."/>
              <label className="text-xs flex items-center gap-1">
                <input type="checkbox" checked={w.active} onChange={(e) => upsertWh({ ...w, active: e.target.checked })}/>
                Active
              </label>
              <button className="text-xs text-red-600" onClick={() => removeWh(w.id)}>delete</button>
            </div>
          ))}
          <div className="flex gap-2 mt-2">
            <button className="btn-secondary" onClick={() => upsertWh({ id: `WH${Date.now() % 100}`, name: "New WH", states: [], active: true })}>+ Warehouse</button>
            <button className="btn-secondary" onClick={() => setMap(buildDefaultStateMap(state.warehouses))}>Rebuild state map from warehouses</button>
          </div>
          <div className="mt-3 text-xs text-pickle-700">
            State→warehouse map covers {Object.keys(state.warehouseStateMap).length} states.
          </div>
        </div>

        <div className="card p-4 col-span-2">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="font-semibold text-pickle-900">Open POs</h2>
              <div className="text-xs text-pickle-700">
                POs you've placed but haven't received yet. Each PO can have multiple line items. These count against "on order" in the Inventory and Order Now views.
              </div>
            </div>
            <button
              className="btn-primary"
              onClick={() => {
                const today = new Date();
                const arrive = new Date(today.getTime() + (state.settings.manufacturerLeadWeeks * 7 + state.settings.shippingTransitDays) * 86400000);
                upsertPO({
                  id: uid("po"),
                  warehouseId: state.warehouses[0]?.id || "",
                  poDate: today.toISOString().slice(0, 10),
                  expectedArrival: arrive.toISOString().slice(0, 10),
                  lines: [],
                });
              }}
            >
              + Add PO
            </button>
          </div>

          {(() => {
            const openPOs = state.openPOs.filter((p) => p.status !== "received");
            const receivedPOs = state.openPOs.filter((p) => p.status === "received");
            const standaloneReceipts = state.receipts.filter((r) => !r.linkedPoId);
            return (
              <>
                {openPOs.length === 0 && (
                  <div className="text-sm text-pickle-700 text-center py-6 border border-dashed border-pickle-200 rounded">
                    No open POs. Click "+ Add PO" to enter one.
                  </div>
                )}
                <div className="space-y-3">
                  {openPOs.map((po) => (
                    <POCard
                      key={po.id}
                      po={po}
                      skus={state.skus}
                      components={state.components}
                      warehouses={state.warehouses}
                      onChange={(next) => upsertPO(next)}
                      onDelete={() => removePO(po.id)}
                      onReceive={(receipt) => markPOReceived(po.id, receipt)}
                    />
                  ))}
                </div>

                {(receivedPOs.length > 0 || standaloneReceipts.length > 0) && (
                  <div className="mt-8">
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <h3 className="font-semibold text-pickle-900">Received POs &amp; Receipts</h3>
                        <div className="text-xs text-pickle-700">
                          History of received shipments. Reopen a PO if you marked it received by mistake.
                        </div>
                      </div>
                      <button
                        className="btn-secondary"
                        onClick={() => {
                          addReceipt({
                            id: uid("rcpt"),
                            receivedDate: new Date().toISOString().slice(0, 10),
                            warehouseId: state.warehouses[0]?.id || "",
                            type: "Supply Adjustment",
                            lines: [],
                          });
                        }}
                      >
                        + Add Standalone Receipt
                      </button>
                    </div>
                    <div className="space-y-3">
                      {receivedPOs.map((po) => {
                        const receipt = state.receipts.find((r) => r.linkedPoId === po.id);
                        return (
                          <ReceivedPOCard
                            key={po.id}
                            po={po}
                            receipt={receipt}
                            skus={state.skus}
                            components={state.components}
                            warehouses={state.warehouses}
                            onReopen={() => reopenPO(po.id)}
                          />
                        );
                      })}
                      {standaloneReceipts.map((r) => (
                        <StandaloneReceiptCard
                          key={r.id}
                          receipt={r}
                          skus={state.skus}
                          components={state.components}
                          warehouses={state.warehouses}
                          onChange={(next) => {
                            // upsert receipt: remove + add
                            removeReceipt(r.id);
                            addReceipt(next);
                          }}
                          onDelete={() => removeReceipt(r.id)}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </>
            );
          })()}
        </div>

        <div className="card p-4 col-span-2 border-red-200">
          <h2 className="font-semibold text-red-700 mb-2">Danger zone</h2>
          <div className="text-xs text-pickle-700 mb-3">
            <strong>Reset everything</strong> wipes ALL data — open POs, receipts, inventory uploads, Shopify orders, retailers, marketing, bank balances, plus all settings — and restores the app to a fresh-install state. Cannot be undone.
          </div>
          <button
            className="btn-danger"
            onClick={() => {
              const confirm1 = confirm(
                "This will DELETE everything: open POs, receipts, inventory uploads, Shopify orders, retailers, marketing data, bank balances. Continue?",
              );
              if (!confirm1) return;
              const phrase = prompt('Type "RESET EVERYTHING" to confirm:');
              if (phrase === "RESET EVERYTHING") reset();
            }}
          >
            Reset everything
          </button>
        </div>
      </div>
    </>
  );
}

function POCard({
  po,
  skus,
  components,
  warehouses,
  onChange,
  onDelete,
  onReceive,
}: {
  po: OpenPO;
  skus: Sku[];
  components: ComponentItem[];
  warehouses: Warehouse[];
  onChange: (po: OpenPO) => void;
  onDelete: () => void;
  onReceive: (r: Receipt) => void;
}) {
  const allItems = [
    ...skus.map((s) => ({ id: s.id, label: s.name, kind: "pickle" as const })),
    ...components.map((c) => ({ id: c.id, label: c.name, kind: "component" as const })),
  ];

  // Defensive: normalize lines so legacy POs (or any malformed entries) render.
  const lines: OpenPOLine[] = Array.isArray(po.lines)
    ? po.lines
    : (po as any).itemId
    ? [{ itemId: (po as any).itemId, qty: (po as any).qty || 0, unitCost: (po as any).unitCost }]
    : [];

  // Newly created POs (with no lines yet) start in edit mode; saved POs are collapsed.
  const [mode, setMode] = useState<"view" | "edit" | "receive">(
    lines.length === 0 ? "edit" : "view",
  );
  const editing = mode === "edit";

  const updateLine = (idx: number, patch: Partial<OpenPOLine>) => {
    const next = lines.map((l, i) => (i === idx ? { ...l, ...patch } : l));
    onChange({ ...po, lines: next });
  };
  const removeLine = (idx: number) => {
    onChange({ ...po, lines: lines.filter((_, i) => i !== idx) });
  };
  const addLine = () => {
    onChange({
      ...po,
      lines: [
        ...lines,
        {
          itemId: skus[0]?.id || components[0]?.id || "",
          qty: 0,
        },
      ],
    });
  };

  const totalQty = lines.reduce((a, l) => a + (Number(l.qty) || 0), 0);
  const totalCost = lines.reduce(
    (a, l) => a + (Number(l.qty) || 0) * (Number(l.unitCost) || 0),
    0,
  );

  const warehouse = warehouses.find((w) => w.id === po.warehouseId);

  if (mode === "receive") {
    return (
      <ReceivePOForm
        po={po}
        skus={skus}
        components={components}
        onCancel={() => setMode("view")}
        onSubmit={(receipt) => {
          onReceive(receipt);
          setMode("view");
        }}
      />
    );
  }

  if (mode === "view") {
    return (
      <div className="border border-pickle-200 rounded-lg overflow-hidden">
        {/* Collapsed read-only header */}
        <div
          className="bg-pickle-50/60 p-3 flex items-center justify-between cursor-pointer hover:bg-pickle-50"
          onClick={() => setMode("edit")}
          title="Click to edit"
        >
          <div className="flex items-center gap-4 text-sm">
            <div className="font-semibold text-pickle-900">
              {po.poNumber ? `PO #${po.poNumber}` : "(no PO #)"}
            </div>
            <div className="text-pickle-700">
              → <strong>{warehouse?.name || po.warehouseId || "—"}</strong>
            </div>
            <div className="text-xs text-pickle-700">
              Placed {po.poDate ? fmtDate(po.poDate) : "—"} · Arrives{" "}
              {po.expectedArrival ? fmtDate(po.expectedArrival) : "—"}
            </div>
            <div className="text-xs text-pickle-700">
              {lines.length} line{lines.length === 1 ? "" : "s"} · {fmtNum(totalQty)} units
              {totalCost > 0 && <> · ${totalCost.toFixed(2)}</>}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              className="btn-primary text-xs"
              onClick={(e) => {
                e.stopPropagation();
                setMode("receive");
              }}
              disabled={lines.length === 0}
              title={lines.length === 0 ? "Add line items first" : "Mark this PO received"}
            >
              Receive
            </button>
            <button
              className="btn-secondary text-xs"
              onClick={(e) => {
                e.stopPropagation();
                setMode("edit");
              }}
            >
              Edit
            </button>
            <button
              className="text-xs text-red-600"
              onClick={(e) => {
                e.stopPropagation();
                if (confirm("Delete this PO?")) onDelete();
              }}
            >
              Delete
            </button>
          </div>
        </div>

        {/* Notes (if any) */}
        {po.notes && (
          <div className="px-3 py-1.5 text-xs text-pickle-700 border-t border-pickle-100 bg-pickle-50/30">
            <span className="font-semibold">Notes:</span> {po.notes}
          </div>
        )}

        {/* Read-only line items */}
        {lines.length > 0 && (
          <table className="w-full text-sm">
            <thead className="bg-pickle-50/30">
              <tr>
                <th>Item</th>
                <th className="text-right">Qty</th>
                <th className="text-right">Unit cost</th>
                <th className="text-right">Line total</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line, i) => {
                const matched = allItems.find((it) => it.id === line.itemId);
                const lineTotal = (Number(line.qty) || 0) * (Number(line.unitCost) || 0);
                return (
                  <tr key={i}>
                    <td>
                      <span className="font-semibold">{line.itemId}</span>
                      {matched && (
                        <span className="text-pickle-700"> — {matched.label}</span>
                      )}
                    </td>
                    <td className="text-right">{fmtNum(Number(line.qty) || 0)}</td>
                    <td className="text-right">
                      {line.unitCost != null ? `$${Number(line.unitCost).toFixed(2)}` : "—"}
                    </td>
                    <td className="text-right">
                      {lineTotal > 0 ? `$${lineTotal.toFixed(2)}` : "—"}
                    </td>
                  </tr>
                );
              })}
              <tr className="bg-pickle-50/30 font-semibold">
                <td>Total</td>
                <td className="text-right">{fmtNum(totalQty)}</td>
                <td></td>
                <td className="text-right">
                  {totalCost > 0 ? `$${totalCost.toFixed(2)}` : ""}
                </td>
              </tr>
            </tbody>
          </table>
        )}
      </div>
    );
  }

  // Editing mode
  return (
    <div className="border border-pickle-400 ring-2 ring-pickle-200 rounded-lg overflow-hidden">
      {/* Editable header */}
      <div className="bg-pickle-50/60 p-3 grid grid-cols-12 gap-2 items-center">
        <div className="col-span-2">
          <div className="label">PO #</div>
          <input
            className="input"
            placeholder="(optional)"
            value={po.poNumber ?? ""}
            onChange={(e) => onChange({ ...po, poNumber: e.target.value })}
          />
        </div>
        <div className="col-span-2">
          <div className="label">Warehouse</div>
          <select
            className="input"
            value={po.warehouseId}
            onChange={(e) => onChange({ ...po, warehouseId: e.target.value })}
          >
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>
                {w.id} — {w.name}
              </option>
            ))}
          </select>
        </div>
        <div className="col-span-2">
          <div className="label">PO Date</div>
          <input
            type="date"
            className="input"
            value={po.poDate}
            onChange={(e) => onChange({ ...po, poDate: e.target.value })}
          />
        </div>
        <div className="col-span-2">
          <div className="label">Expected Arrival</div>
          <input
            type="date"
            className="input"
            value={po.expectedArrival}
            onChange={(e) => onChange({ ...po, expectedArrival: e.target.value })}
          />
        </div>
        <div className="col-span-3">
          <div className="label">Notes</div>
          <input
            className="input"
            placeholder="(optional)"
            value={po.notes ?? ""}
            onChange={(e) => onChange({ ...po, notes: e.target.value })}
          />
        </div>
        <div className="col-span-1 text-right">
          <button className="text-xs text-red-600" onClick={onDelete} title="Delete PO">
            Delete
          </button>
        </div>
      </div>

      {/* Editable line items */}
      <table className="w-full text-sm">
        <thead className="bg-pickle-50/30">
          <tr>
            <th>Item</th>
            <th className="text-right">Qty</th>
            <th className="text-right">Unit cost</th>
            <th className="text-right">Line total</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {lines.length === 0 && (
            <tr>
              <td colSpan={5} className="text-pickle-700 text-center py-4">
                No line items. Click "+ Add line" below.
              </td>
            </tr>
          )}
          {lines.map((line, i) => {
            const matched = allItems.find((it) => it.id === line.itemId);
            const lineTotal = (Number(line.qty) || 0) * (Number(line.unitCost) || 0);
            return (
              <tr key={i}>
                <td>
                  <select
                    className="input"
                    value={line.itemId}
                    onChange={(e) => updateLine(i, { itemId: e.target.value })}
                  >
                    {allItems.map((it) => (
                      <option key={it.id} value={it.id}>
                        {it.id} — {it.label}
                      </option>
                    ))}
                  </select>
                  {matched && (
                    <div className="text-[10px] text-pickle-700 mt-0.5">
                      {matched.kind}
                    </div>
                  )}
                </td>
                <td>
                  <input
                    type="number"
                    className="input w-24 text-right"
                    value={line.qty}
                    onChange={(e) => updateLine(i, { qty: parseFloat(e.target.value) || 0 })}
                  />
                </td>
                <td>
                  <input
                    type="number"
                    step="0.01"
                    className="input w-24 text-right"
                    value={line.unitCost ?? ""}
                    placeholder="(optional)"
                    onChange={(e) => updateLine(i, { unitCost: e.target.value === "" ? undefined : parseFloat(e.target.value) })}
                  />
                </td>
                <td className="text-right">
                  {lineTotal > 0 ? `$${lineTotal.toFixed(2)}` : ""}
                </td>
                <td>
                  <button
                    className="text-xs text-red-600"
                    onClick={() => removeLine(i)}
                  >
                    ×
                  </button>
                </td>
              </tr>
            );
          })}
          {lines.length > 0 && (
            <tr className="bg-pickle-50/30 font-semibold">
              <td>Total ({lines.length} line{lines.length === 1 ? "" : "s"})</td>
              <td className="text-right">{fmtNum(totalQty)}</td>
              <td></td>
              <td className="text-right">
                {totalCost > 0 ? `$${totalCost.toFixed(2)}` : ""}
              </td>
              <td></td>
            </tr>
          )}
        </tbody>
      </table>

      <div className="p-2 border-t border-pickle-100 flex justify-between items-center">
        <button className="btn-secondary text-xs" onClick={addLine}>
          + Add line
        </button>
        <button className="btn-primary text-xs" onClick={() => setMode("view")}>
          Done
        </button>
      </div>
    </div>
  );
}

/* ---------- Receive form (used when marking an open PO as received) ---------- */

function ReceivePOForm({
  po,
  skus,
  components,
  onCancel,
  onSubmit,
}: {
  po: OpenPO;
  skus: Sku[];
  components: ComponentItem[];
  onCancel: () => void;
  onSubmit: (r: Receipt) => void;
}) {
  const allItems = [
    ...skus.map((s) => ({ id: s.id, label: s.name })),
    ...components.map((c) => ({ id: c.id, label: c.name })),
  ];
  const labelFor = (id: string) =>
    allItems.find((it) => it.id === id)?.label || id;

  const [receiptNumber, setReceiptNumber] = useState("");
  const [receivedDate, setReceivedDate] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<ReceiptLine[]>(
    (po.lines || []).map((l) => ({
      itemId: l.itemId,
      orderedQty: Number(l.qty) || 0,
      qty: Number(l.qty) || 0,
      unitCost: l.unitCost,
    })),
  );

  const updateQty = (i: number, qty: number) =>
    setLines((curr) => curr.map((l, idx) => (idx === i ? { ...l, qty } : l)));
  const updateLot = (i: number, lot: string) =>
    setLines((curr) => curr.map((l, idx) => (idx === i ? { ...l, lot } : l)));
  const updateBestBy = (i: number, bestByDate: string) =>
    setLines((curr) => curr.map((l, idx) => (idx === i ? { ...l, bestByDate } : l)));

  const handleSave = () => {
    const receipt: Receipt = {
      id: uid("rcpt"),
      receiptNumber: receiptNumber.trim() || undefined,
      receivedDate,
      warehouseId: po.warehouseId,
      linkedPoId: po.id,
      type: "PO Receipt",
      notes: notes.trim() || undefined,
      lines,
    };
    onSubmit(receipt);
  };

  const totalReceived = lines.reduce((a, l) => a + (Number(l.qty) || 0), 0);

  return (
    <div className="border-2 border-sky-400 ring-2 ring-sky-100 rounded-lg overflow-hidden">
      <div className="bg-sky-50 p-3">
        <div className="font-semibold text-sky-900 mb-2">
          Receive PO {po.poNumber ? `#${po.poNumber}` : ""} · → {po.warehouseId}
        </div>
        <div className="grid grid-cols-12 gap-2">
          <div className="col-span-3">
            <div className="label">Receipt #</div>
            <input
              className="input"
              placeholder="e.g. MO Receipt 27"
              value={receiptNumber}
              onChange={(e) => setReceiptNumber(e.target.value)}
            />
          </div>
          <div className="col-span-3">
            <div className="label">Received date</div>
            <input
              type="date"
              className="input"
              value={receivedDate}
              onChange={(e) => setReceivedDate(e.target.value)}
            />
          </div>
          <div className="col-span-6">
            <div className="label">Notes (optional)</div>
            <input
              className="input"
              placeholder="e.g. Supply Count, CC attached"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </div>
      </div>
      <table className="w-full text-sm">
        <thead className="bg-pickle-50/30">
          <tr>
            <th>Item</th>
            <th className="text-right">Ordered</th>
            <th className="text-right">Received</th>
            <th className="text-right">Δ</th>
            <th>Lot</th>
            <th>Best By</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l, i) => {
            const delta = (Number(l.qty) || 0) - (Number(l.orderedQty) || 0);
            return (
              <tr key={i}>
                <td>
                  <div className="font-semibold">{l.itemId}</div>
                  <div className="text-xs text-pickle-700">{labelFor(l.itemId)}</div>
                </td>
                <td className="text-right">{fmtNum(Number(l.orderedQty) || 0)}</td>
                <td>
                  <input
                    type="number"
                    className="input w-24 text-right"
                    value={l.qty}
                    onChange={(e) => updateQty(i, parseFloat(e.target.value) || 0)}
                  />
                </td>
                <td
                  className={
                    "text-right text-xs " +
                    (delta < 0
                      ? "text-red-600"
                      : delta > 0
                      ? "text-amber-700"
                      : "text-pickle-700")
                  }
                >
                  {delta === 0 ? "—" : delta > 0 ? `+${delta}` : delta}
                </td>
                <td>
                  <input
                    className="input w-24"
                    placeholder="(opt)"
                    value={l.lot ?? ""}
                    onChange={(e) => updateLot(i, e.target.value)}
                  />
                </td>
                <td>
                  <input
                    type="date"
                    className="input"
                    value={l.bestByDate ?? ""}
                    onChange={(e) => updateBestBy(i, e.target.value)}
                  />
                </td>
              </tr>
            );
          })}
          <tr className="bg-pickle-50/30 font-semibold">
            <td>Total</td>
            <td></td>
            <td className="text-right">{fmtNum(totalReceived)}</td>
            <td colSpan={3}></td>
          </tr>
        </tbody>
      </table>
      <div className="p-2 border-t border-pickle-100 flex justify-between items-center">
        <button className="btn-secondary text-xs" onClick={onCancel}>
          Cancel
        </button>
        <button className="btn-primary text-xs" onClick={handleSave}>
          Save receipt &amp; mark received
        </button>
      </div>
    </div>
  );
}

/* ---------- Read-only card for received POs ---------- */

function ReceivedPOCard({
  po,
  receipt,
  skus,
  components,
  warehouses,
  onReopen,
}: {
  po: OpenPO;
  receipt?: Receipt;
  skus: Sku[];
  components: ComponentItem[];
  warehouses: Warehouse[];
  onReopen: () => void;
}) {
  const allItems = [
    ...skus.map((s) => ({ id: s.id, label: s.name })),
    ...components.map((c) => ({ id: c.id, label: c.name })),
  ];
  const labelFor = (id: string) =>
    allItems.find((it) => it.id === id)?.label || id;
  const wh = warehouses.find((w) => w.id === po.warehouseId);
  const [expanded, setExpanded] = useState(false);

  const lines: ReceiptLine[] = receipt?.lines ?? [];
  const totalQty = lines.reduce((a, l) => a + (Number(l.qty) || 0), 0);

  return (
    <div className="border border-pickle-200 bg-pickle-50/30 rounded-lg overflow-hidden opacity-90">
      <div
        className="p-3 flex items-center justify-between cursor-pointer hover:bg-pickle-50"
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="flex items-center gap-4 text-sm">
          <span className="badge-ok">Received</span>
          <div className="font-semibold text-pickle-900">
            {po.poNumber ? `PO #${po.poNumber}` : "(no PO #)"}
          </div>
          <div className="text-pickle-700">
            → <strong>{wh?.name || po.warehouseId}</strong>
          </div>
          <div className="text-xs text-pickle-700">
            Received {receipt?.receivedDate ? fmtDate(receipt.receivedDate) : po.receivedAt ? fmtDate(po.receivedAt) : "—"}
            {receipt?.receiptNumber && <> · Receipt {receipt.receiptNumber}</>}
            {" · "}
            {lines.length} line{lines.length === 1 ? "" : "s"} · {fmtNum(totalQty)} units
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            className="btn-secondary text-xs"
            onClick={(e) => {
              e.stopPropagation();
              if (confirm("Reopen this PO? It will move back to Open POs and the receipt will be deleted.")) {
                onReopen();
              }
            }}
          >
            Reopen
          </button>
          <span className="text-pickle-700 text-xs">{expanded ? "▲" : "▼"}</span>
        </div>
      </div>
      {expanded && lines.length > 0 && (
        <table className="w-full text-sm">
          <thead className="bg-pickle-50/30">
            <tr>
              <th>Item</th>
              <th className="text-right">Ordered</th>
              <th className="text-right">Received</th>
              <th>Lot</th>
              <th>Best By</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l, i) => (
              <tr key={i}>
                <td>
                  <span className="font-semibold">{l.itemId}</span>{" "}
                  <span className="text-pickle-700">— {labelFor(l.itemId)}</span>
                </td>
                <td className="text-right">{fmtNum(Number(l.orderedQty) || 0)}</td>
                <td className="text-right">{fmtNum(Number(l.qty) || 0)}</td>
                <td>{l.lot || "—"}</td>
                <td>{l.bestByDate ? fmtDate(l.bestByDate) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {receipt?.notes && expanded && (
        <div className="px-3 py-1.5 text-xs text-pickle-700 border-t border-pickle-100 bg-pickle-50/50">
          <span className="font-semibold">Notes:</span> {receipt.notes}
        </div>
      )}
    </div>
  );
}

/* ---------- Standalone receipt card (no linked PO) ---------- */

function StandaloneReceiptCard({
  receipt,
  skus,
  components,
  warehouses,
  onChange,
  onDelete,
}: {
  receipt: Receipt;
  skus: Sku[];
  components: ComponentItem[];
  warehouses: Warehouse[];
  onChange: (next: Receipt) => void;
  onDelete: () => void;
}) {
  const allItems = [
    ...skus.map((s) => ({ id: s.id, label: s.name })),
    ...components.map((c) => ({ id: c.id, label: c.name })),
  ];
  const labelFor = (id: string) =>
    allItems.find((it) => it.id === id)?.label || id;
  const [editing, setLocalEditing] = useState(receipt.lines.length === 0);

  const updateLine = (idx: number, patch: Partial<ReceiptLine>) =>
    onChange({
      ...receipt,
      lines: receipt.lines.map((l, i) => (i === idx ? { ...l, ...patch } : l)),
    });
  const removeLine = (idx: number) =>
    onChange({ ...receipt, lines: receipt.lines.filter((_, i) => i !== idx) });
  const addLine = () =>
    onChange({
      ...receipt,
      lines: [
        ...receipt.lines,
        { itemId: skus[0]?.id || components[0]?.id || "", qty: 0 },
      ],
    });

  const wh = warehouses.find((w) => w.id === receipt.warehouseId);
  const totalQty = receipt.lines.reduce((a, l) => a + (Number(l.qty) || 0), 0);

  if (!editing) {
    return (
      <div className="border border-pickle-200 bg-pickle-50/30 rounded-lg overflow-hidden">
        <div
          className="p-3 flex items-center justify-between cursor-pointer hover:bg-pickle-50"
          onClick={() => setLocalEditing(true)}
        >
          <div className="flex items-center gap-4 text-sm">
            <span className="badge-info">{receipt.type || "Receipt"}</span>
            <div className="font-semibold">
              {receipt.receiptNumber ? `Receipt ${receipt.receiptNumber}` : "(no #)"}
            </div>
            <div className="text-pickle-700">
              → <strong>{wh?.name || receipt.warehouseId}</strong>
            </div>
            <div className="text-xs text-pickle-700">
              {fmtDate(receipt.receivedDate)} · {receipt.lines.length} line
              {receipt.lines.length === 1 ? "" : "s"} · {fmtNum(totalQty)} units
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              className="btn-secondary text-xs"
              onClick={(e) => {
                e.stopPropagation();
                setLocalEditing(true);
              }}
            >
              Edit
            </button>
            <button
              className="text-xs text-red-600"
              onClick={(e) => {
                e.stopPropagation();
                if (confirm("Delete this receipt?")) onDelete();
              }}
            >
              Delete
            </button>
          </div>
        </div>
        {receipt.lines.length > 0 && (
          <table className="w-full text-sm">
            <thead className="bg-pickle-50/30">
              <tr>
                <th>Item</th>
                <th className="text-right">Qty</th>
                <th>Lot</th>
                <th>Best By</th>
              </tr>
            </thead>
            <tbody>
              {receipt.lines.map((l, i) => (
                <tr key={i}>
                  <td>
                    <span className="font-semibold">{l.itemId}</span>{" "}
                    <span className="text-pickle-700">— {labelFor(l.itemId)}</span>
                  </td>
                  <td className="text-right">{fmtNum(Number(l.qty) || 0)}</td>
                  <td>{l.lot || "—"}</td>
                  <td>{l.bestByDate ? fmtDate(l.bestByDate) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    );
  }

  return (
    <div className="border-2 border-pickle-400 ring-2 ring-pickle-100 rounded-lg overflow-hidden">
      <div className="bg-pickle-50/60 p-3 grid grid-cols-12 gap-2 items-center">
        <div className="col-span-2">
          <div className="label">Receipt #</div>
          <input
            className="input"
            placeholder="(optional)"
            value={receipt.receiptNumber ?? ""}
            onChange={(e) => onChange({ ...receipt, receiptNumber: e.target.value })}
          />
        </div>
        <div className="col-span-2">
          <div className="label">Warehouse</div>
          <select
            className="input"
            value={receipt.warehouseId}
            onChange={(e) => onChange({ ...receipt, warehouseId: e.target.value })}
          >
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>
                {w.id} — {w.name}
              </option>
            ))}
          </select>
        </div>
        <div className="col-span-2">
          <div className="label">Received date</div>
          <input
            type="date"
            className="input"
            value={receipt.receivedDate}
            onChange={(e) => onChange({ ...receipt, receivedDate: e.target.value })}
          />
        </div>
        <div className="col-span-2">
          <div className="label">Type</div>
          <input
            className="input"
            value={receipt.type ?? ""}
            placeholder="Supply Adjustment"
            onChange={(e) => onChange({ ...receipt, type: e.target.value })}
          />
        </div>
        <div className="col-span-3">
          <div className="label">Notes</div>
          <input
            className="input"
            value={receipt.notes ?? ""}
            onChange={(e) => onChange({ ...receipt, notes: e.target.value })}
          />
        </div>
        <div className="col-span-1 text-right">
          <button className="text-xs text-red-600" onClick={onDelete}>
            Delete
          </button>
        </div>
      </div>

      <table className="w-full text-sm">
        <thead className="bg-pickle-50/30">
          <tr>
            <th>Item</th>
            <th className="text-right">Qty</th>
            <th>Lot</th>
            <th>Best By</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {receipt.lines.length === 0 && (
            <tr>
              <td colSpan={5} className="text-pickle-700 text-center py-4">
                No line items. Click "+ Add line".
              </td>
            </tr>
          )}
          {receipt.lines.map((l, i) => (
            <tr key={i}>
              <td>
                <select
                  className="input"
                  value={l.itemId}
                  onChange={(e) => updateLine(i, { itemId: e.target.value })}
                >
                  {allItems.map((it) => (
                    <option key={it.id} value={it.id}>
                      {it.id} — {it.label}
                    </option>
                  ))}
                </select>
              </td>
              <td>
                <input
                  type="number"
                  className="input w-24 text-right"
                  value={l.qty}
                  onChange={(e) => updateLine(i, { qty: parseFloat(e.target.value) || 0 })}
                />
              </td>
              <td>
                <input
                  className="input"
                  placeholder="(optional)"
                  value={l.lot ?? ""}
                  onChange={(e) => updateLine(i, { lot: e.target.value })}
                />
              </td>
              <td>
                <input
                  type="date"
                  className="input"
                  value={l.bestByDate ?? ""}
                  onChange={(e) => updateLine(i, { bestByDate: e.target.value })}
                />
              </td>
              <td>
                <button className="text-xs text-red-600" onClick={() => removeLine(i)}>
                  ×
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="p-2 border-t border-pickle-100 flex justify-between items-center">
        <button className="btn-secondary text-xs" onClick={addLine}>
          + Add line
        </button>
        <button className="btn-primary text-xs" onClick={() => setLocalEditing(false)}>
          Done
        </button>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  step,
  onChange,
}: {
  label: string;
  value: number;
  step: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="block mb-2 text-sm">
      <div className="label mb-1">{label}</div>
      <input
        type="number"
        step={step}
        className="input"
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
      />
    </label>
  );
}
