import { useMemo } from "react";
import { useStore } from "../store/store";
import { computeOrderRecs } from "../lib/orderEngine";
import { fmtNum, fmtDate } from "../lib/util";
import { PageHeader, EmptyState } from "../components/Layout";
import { StockBar, StockBarLegend } from "../components/StockBar";

export function InventoryView() {
  const state = useStore();
  const result = useMemo(() => computeOrderRecs(state), [state]);

  if (state.inventorySnapshots.length === 0) {
    return (
      <>
        <PageHeader title="Inventory" subtitle="Pickle on-hand by warehouse" />
        <EmptyState
          title="No inventory uploaded"
          description="Upload a warehouse inventory snapshot from Raw Data."
        />
      </>
    );
  }

  const lastSnap = state.inventorySnapshots[state.inventorySnapshots.length - 1];
  const skuRecs = result.recs.filter((r) => r.itemKind === "pickle");
  const warehouses = state.warehouses.filter((w) => w.active);

  return (
    <>
      <PageHeader
        title="Inventory"
        subtitle={`Pickle SKUs · last snapshot ${fmtDate(lastSnap.date)}`}
        right={<StockBarLegend />}
      />
      <div className="card overflow-hidden">
        <table className="w-full">
          <thead className="bg-pickle-50">
            <tr>
              <th>SKU</th>
              {warehouses.map((w) => (
                <th key={w.id} className="text-right" colSpan={3}>
                  {w.name}
                </th>
              ))}
              <th className="text-right">Total</th>
            </tr>
            <tr>
              <th></th>
              {warehouses.flatMap((w) => [
                <th key={`${w.id}-on`} className="text-right text-[10px]" title="On hand + on order">Available</th>,
                <th key={`${w.id}-wk`} className="text-right text-[10px]">Wks</th>,
                <th key={`${w.id}-st`}></th>,
              ])}
              <th></th>
            </tr>
          </thead>
          <tbody>
            {state.skus.filter((s) => s.active).map((sku) => {
              let total = 0;
              const cells: React.ReactNode[] = [];
              for (const w of warehouses) {
                const r = skuRecs.find((x) => x.itemId === sku.id && x.warehouseId === w.id);
                if (!r) {
                  cells.push(
                    <td key={`${sku.id}-${w.id}-on`} className="text-right">—</td>,
                    <td key={`${sku.id}-${w.id}-wk`}></td>,
                    <td key={`${sku.id}-${w.id}-st`}></td>,
                  );
                  continue;
                }
                total += r.totalAvailable;
                const status = statusFor(r.weeksOnHand, state.settings.defaultMinWeeksOnHand, state.settings.defaultMaxWeeksOnHand);
                cells.push(
                  <td key={`${sku.id}-${w.id}-on`} className="text-right">
                    <div className="font-semibold">{fmtNum(r.totalAvailable)}</div>
                    <StockBar onHand={r.onHand} onOrder={r.onOrder} />
                    {r.onOrder > 0 && (
                      <div className="text-[10px] text-pickle-700 mt-0.5">
                        {fmtNum(r.onHand)} + {fmtNum(r.onOrder)}
                      </div>
                    )}
                  </td>,
                  <td key={`${sku.id}-${w.id}-wk`} className="text-right">{r.weeksOnHand < 99 ? r.weeksOnHand.toFixed(1) : "—"}</td>,
                  <td key={`${sku.id}-${w.id}-st`}><span className={status.cls}>{status.label}</span></td>,
                );
              }
              return (
                <tr key={sku.id}>
                  <td>
                    <div className="font-semibold">{sku.name}</div>
                    <div className="text-xs text-pickle-700">{sku.id} · {sku.jarOz}oz</div>
                  </td>
                  {cells}
                  <td className="text-right font-semibold">{fmtNum(total)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

export function ComponentInventoryView() {
  const state = useStore();
  const result = useMemo(() => computeOrderRecs(state), [state]);
  const compRecs = result.recs.filter((r) => r.itemKind === "component");
  const warehouses = state.warehouses.filter((w) => w.active);

  if (state.inventorySnapshots.length === 0) {
    return (
      <>
        <PageHeader title="Components" subtitle="Boxes, liners, gel packs" />
        <EmptyState
          title="No inventory uploaded"
          description="Upload a warehouse inventory snapshot from Raw Data."
        />
      </>
    );
  }

  // Hide service items (e.g. Freight) — they appear on POs but aren't inventory.
  const inventoryComps = state.components.filter((c) => c.category !== "service");
  const managed = inventoryComps.filter((c) => c.managedByMe);
  const stocked = inventoryComps.filter((c) => !c.managedByMe);

  return (
    <>
      <PageHeader title="Components" subtitle="Boxes, liners, gel packs" right={<StockBarLegend />} />

      <div className="mb-6">
        <h2 className="text-lg font-semibold text-pickle-900 mb-2">I manage these</h2>
        <ComponentTable comps={managed} warehouses={warehouses} recs={compRecs} settings={state.settings} />
      </div>
      <div>
        <h2 className="text-lg font-semibold text-pickle-900 mb-2">Warehouse stocks (monitor only)</h2>
        <ComponentTable comps={stocked} warehouses={warehouses} recs={compRecs} settings={state.settings} />
      </div>

      <OpenPODiagnostic state={state} />
    </>
  );
}

function OpenPODiagnostic({ state }: { state: any }) {
  const componentIds = new Set(state.components.map((c: any) => c.id));
  const skuIds = new Set(state.skus.map((s: any) => s.id));
  const warehouseIds = new Set(state.warehouses.map((w: any) => w.id));
  const openPOs = state.openPOs.filter((p: any) => p.status !== "received");

  type Row = {
    poId: string;
    poNumber?: string;
    warehouseId: string;
    warehouseKnown: boolean;
    itemId: string;
    itemKind: string;
    qty: number;
  };
  const rows: Row[] = [];
  for (const po of openPOs) {
    const lines = Array.isArray(po.lines) ? po.lines : [];
    for (const l of lines) {
      let itemKind = "❌ unknown";
      if (componentIds.has(l.itemId)) {
        const comp = state.components.find((c: any) => c.id === l.itemId);
        if (comp?.category === "service") itemKind = "service (won't show on Components)";
        else itemKind = comp?.managedByMe ? "component (managed)" : "component (warehouse-stocked)";
      } else if (skuIds.has(l.itemId)) {
        itemKind = "pickle SKU (shows on Inventory tab)";
      }
      rows.push({
        poId: po.id,
        poNumber: po.poNumber,
        warehouseId: po.warehouseId,
        warehouseKnown: warehouseIds.has(po.warehouseId),
        itemId: l.itemId,
        itemKind,
        qty: Number(l.qty) || 0,
      });
    }
  }
  if (rows.length === 0) return null;

  return (
    <details className="card p-4 mt-6 text-sm">
      <summary className="font-semibold cursor-pointer">
        Open PO diagnostic ({openPOs.length} open PO{openPOs.length === 1 ? "" : "s"} · {rows.length} line{rows.length === 1 ? "" : "s"})
      </summary>
      <div className="text-xs text-pickle-700 mt-2 mb-2">
        If a PO line isn't reflected on Components or Inventory, look for ❌ flags below — typically an item-id mismatch (e.g. you renamed C8CB but the PO still references the old ID), an unknown warehouse, or an item that's a pickle SKU / service.
      </div>
      <table className="w-full text-xs">
        <thead className="bg-pickle-50">
          <tr>
            <th>PO</th>
            <th>Warehouse</th>
            <th>Item</th>
            <th>Kind</th>
            <th className="text-right">Qty</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              <td>{r.poNumber ? `#${r.poNumber}` : r.poId.slice(-6)}</td>
              <td>
                {r.warehouseId}
                {!r.warehouseKnown && <span className="text-red-600"> ❌ unknown</span>}
              </td>
              <td>{r.itemId}</td>
              <td className={r.itemKind.startsWith("❌") ? "text-red-600" : ""}>
                {r.itemKind}
              </td>
              <td className="text-right">{fmtNum(r.qty)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}

function ComponentTable({ comps, warehouses, recs, settings }: any) {
  return (
    <div className="card overflow-hidden">
      <table className="w-full">
        <thead className="bg-pickle-50">
          <tr>
            <th>Component</th>
            {warehouses.map((w: any) => (
              <th key={w.id} className="text-right" colSpan={3}>{w.name}</th>
            ))}
          </tr>
          <tr>
            <th></th>
            {warehouses.flatMap((w: any) => [
              <th key={`${w.id}-on`} className="text-right text-[10px]" title="On hand + on order">Available</th>,
              <th key={`${w.id}-wk`} className="text-right text-[10px]">Wks</th>,
              <th key={`${w.id}-st`}></th>,
            ])}
          </tr>
        </thead>
        <tbody>
          {comps.map((c: any) => {
            const cells: React.ReactNode[] = [];
            for (const w of warehouses) {
              const r = recs.find((x: any) => x.itemId === c.id && x.warehouseId === w.id);
              if (!r) {
                cells.push(
                  <td key={`${c.id}-${w.id}-on`}>—</td>,
                  <td key={`${c.id}-${w.id}-wk`}></td>,
                  <td key={`${c.id}-${w.id}-st`}></td>,
                );
                continue;
              }
              const status = statusFor(r.weeksOnHand, settings.defaultMinWeeksOnHand, settings.defaultMaxWeeksOnHand);
              cells.push(
                <td key={`${c.id}-${w.id}-on`} className="text-right">
                  <div className="font-semibold">{fmtNum(r.totalAvailable)}</div>
                  <StockBar onHand={r.onHand} onOrder={r.onOrder} />
                  {r.onOrder > 0 && (
                    <div className="text-[10px] text-pickle-700 mt-0.5">
                      {fmtNum(r.onHand)} + {fmtNum(r.onOrder)}
                    </div>
                  )}
                </td>,
                <td key={`${c.id}-${w.id}-wk`} className="text-right">{r.weeksOnHand < 99 ? r.weeksOnHand.toFixed(1) : "—"}</td>,
                <td key={`${c.id}-${w.id}-st`}><span className={status.cls}>{status.label}</span></td>,
              );
            }
            return (
              <tr key={c.id}>
                <td>
                  <div className="font-semibold">{c.name}</div>
                  <div className="text-xs text-pickle-700">{c.id} · target {c.targetWeeksOnHand}w</div>
                </td>
                {cells}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function statusFor(weeks: number, min: number, max: number) {
  if (weeks < min) return { cls: "badge-bad", label: "Low" };
  if (weeks > max) return { cls: "badge-info", label: "High" };
  return { cls: "badge-ok", label: "OK" };
}
