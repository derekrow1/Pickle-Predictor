import { useMemo, useState } from "react";
import { useStore } from "../store/store";
import { computeOrderRecs } from "../lib/orderEngine";
import type { OrderRecRow } from "../lib/orderEngine";
import { fmtDate, fmtNum } from "../lib/util";
import { PageHeader, EmptyState } from "../components/Layout";

export function OrderNowView() {
  const state = useStore();
  const [hideEmpty, setHideEmpty] = useState(true);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const result = useMemo(() => computeOrderRecs(state), [state]);

  const recs = result.recs.filter((r) => {
    if (!r.managedByMe) return false; // only show items I order
    if (hideEmpty && r.recommendedQty <= 0 && !r.shelfLifeBlocked) return false;
    return true;
  });

  const empty = state.cleanOrders.length === 0 || state.inventorySnapshots.length === 0;
  if (empty) {
    return (
      <>
        <PageHeader title="Order Now" subtitle="Recommended POs for this week" />
        <EmptyState
          title="Upload data to see recommendations"
          description="Import a warehouse inventory snapshot and a Shopify orders export from the Raw Data view, then come back here."
        />
      </>
    );
  }

  const totalActions = recs.filter((r) => r.recommendedQty > 0).length;
  const blocked = recs.filter((r) => r.shelfLifeBlocked).length;

  return (
    <>
      <PageHeader
        title="Order Now"
        subtitle={`${totalActions} recommended PO${totalActions === 1 ? "" : "s"} ${
          blocked ? `· ${blocked} blocked by shelf life` : ""
        }`}
        right={
          <label className="text-sm flex items-center gap-2">
            <input
              type="checkbox"
              checked={hideEmpty}
              onChange={(e) => setHideEmpty(e.target.checked)}
            />
            Hide rows with no action
          </label>
        }
      />

      <div className="card overflow-hidden">
        <table className="w-full">
          <thead className="bg-pickle-50">
            <tr>
              <th>SKU / Item</th>
              <th>Warehouse</th>
              <th className="text-right">Recommended</th>
              <th className="text-right">To Order</th>
              <th>PO By</th>
              <th>Expected Arrival</th>
              <th className="text-right">Now / Target</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {recs.length === 0 && (
              <tr>
                <td colSpan={8} className="text-center text-pickle-700 py-8">
                  Nothing to order this week. 🥒
                </td>
              </tr>
            )}
            {recs.map((r) => {
              const key = `${r.itemId}-${r.warehouseId}`;
              const isExp = expanded[key];
              return (
                <RecRow
                  key={key}
                  r={r}
                  expanded={isExp}
                  onToggle={() => setExpanded((s) => ({ ...s, [key]: !s[key] }))}
                />
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-6 grid grid-cols-3 gap-4 text-sm text-pickle-700">
        <div className="card p-3">
          <div className="label">Warehouse mix (recent)</div>
          <div className="mt-1">
            {Object.entries(result.warehouseMix).map(([w, share]) => (
              <div key={w} className="flex justify-between">
                <span>{w}</span>
                <span>{(share * 100).toFixed(1)}%</span>
              </div>
            ))}
          </div>
        </div>
        <div className="card p-3">
          <div className="label">Forecast lookback</div>
          <div className="mt-1">
            <div>Lookback weeks: {state.settings.forecastLookbackWeeks}</div>
            <div>Weekly growth: {(state.settings.weeklyGrowthRate * 100).toFixed(1)}%</div>
            <div>
              Summer lift: {(state.settings.summerSeasonalityPct * 100).toFixed(0)}% (
              {state.settings.summerStartMonth}–{state.settings.summerEndMonth})
            </div>
          </div>
        </div>
        <div className="card p-3">
          <div className="label">Shelf life guard</div>
          <div className="mt-1">
            <div>
              Total: {state.settings.totalShelfLifeWeeks}w · Lead {state.settings.manufacturerLeadWeeks}w · Transit {state.settings.shippingTransitDays}d
            </div>
            <div>
              Customer floor: {state.settings.retailEnabled
                ? `${(state.settings.retailFreshnessPct * 100).toFixed(0)}% (retail)`
                : `${state.settings.ecommerceMinWeeksAtCustomer}w (e-comm)`}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function RecRow({
  r,
  expanded,
  onToggle,
}: {
  r: OrderRecRow;
  expanded: boolean;
  onToggle: () => void;
}) {
  const targetUnits = r.weeklyDemand * r.targetWeeks;
  const hasAction = r.toOrderQty > 0;
  const status =
    hasAction
      ? r.shelfLifeBlocked
        ? "badge-bad"
        : r.shelfLifeRoundingConflict
        ? "badge-bad"
        : "badge-warn"
      : "badge-ok";
  const statusLabel = r.shelfLifeBlocked
    ? "Blocked"
    : r.shelfLifeRoundingConflict
    ? "Conflict"
    : hasAction
    ? "Order"
    : "OK";

  // Pretty label for "To Order" column: e.g. "1,000  (2 pallets)"
  const palletText =
    r.orderUnitCount > 0 && r.orderMultiple > 1
      ? `${r.orderUnitCount} ${r.orderUnitLabel || "pallet"}${r.orderUnitCount === 1 ? "" : "s"}`
      : "";

  return (
    <>
      <tr className="hover:bg-pickle-50/40 cursor-pointer" onClick={onToggle}>
        <td>
          <div className="font-semibold">{r.itemName}</div>
          <div className="text-xs text-pickle-700">
            {r.itemId} · <span className={status}>{statusLabel}</span>
          </div>
        </td>
        <td className="font-medium">{r.warehouseName}</td>
        <td className="text-right text-pickle-700">
          {r.recommendedQty > 0 ? fmtNum(r.recommendedQty) : "—"}
        </td>
        <td className="text-right">
          {hasAction ? (
            <>
              <div className="font-bold text-lg text-pickle-900">{fmtNum(r.toOrderQty)}</div>
              {palletText && <div className="text-xs text-pickle-700">{palletText}</div>}
            </>
          ) : (
            "—"
          )}
        </td>
        <td>{hasAction ? fmtDate(r.poByDate) : "—"}</td>
        <td>{hasAction ? fmtDate(r.expectedArrival) : "—"}</td>
        <td className="text-right text-sm">
          {fmtNum(r.totalAvailable)} / {fmtNum(targetUnits)}{" "}
          <div className="text-xs text-pickle-700">
            {r.weeksOnHand.toFixed(1)}w cover
          </div>
        </td>
        <td>
          <button className="text-pickle-700 text-xs">{expanded ? "▲" : "▼"} math</button>
        </td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={8} className="bg-pickle-50/40">
            <div className="text-sm pl-6">
              <ul className="list-disc list-inside space-y-1">
                {r.reasoning.map((line, i) => (
                  <li key={i}>{line}</li>
                ))}
              </ul>
              <div className="text-xs text-pickle-700 mt-2">
                Reorder threshold: {r.reorderThresholdWeeks.toFixed(1)}w · Target: {r.targetWeeks}w
                {r.orderMultiple > 1 && (
                  <> · Order multiple: {r.orderMultiple} per {r.orderUnitLabel || "pallet"}</>
                )}
                {r.shelfLifeMaxOrderQty != null && (
                  <> · Shelf-life cap: {fmtNum(r.shelfLifeMaxOrderQty)}</>
                )}
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
