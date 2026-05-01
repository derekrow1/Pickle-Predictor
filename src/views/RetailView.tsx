import { useState } from "react";
import { useStore } from "../store/store";
import { PageHeader, EmptyState } from "../components/Layout";
import { fmtDate, fmtNum, ISO, uid } from "../lib/util";
import {
  retailWeeklyDemand,
  totalWeeklyVelocityBySku,
} from "../lib/retail";
import type { InitialFill, Retailer } from "../types";

export function RetailView() {
  const state = useStore();
  const upsertRetailer = useStore((s) => s.upsertRetailer);
  const removeRetailer = useStore((s) => s.removeRetailer);
  const renameRetailer = useStore((s) => s.renameRetailer);
  const setVelocity = useStore((s) => s.setRetailVelocity);
  const upsertFill = useStore((s) => s.upsertInitialFill);
  const removeFill = useStore((s) => s.removeInitialFill);

  const totalVelocity = totalWeeklyVelocityBySku(state);
  const next8Weeks = retailWeeklyDemand(state, 8);

  return (
    <>
      <PageHeader
        title="Retail"
        subtitle="Retailers, SKU velocities, and initial fills"
        right={
          <button
            className="btn-primary"
            onClick={() =>
              upsertRetailer({
                id: `RT${Date.now() % 10000}`,
                name: "New Retailer",
                active: true,
              })
            }
          >
            + Add Retailer
          </button>
        }
      />

      {state.retailers.length === 0 ? (
        <EmptyState
          title="No retailers yet"
          description="Add a retailer to track which SKUs they carry, weekly velocity, and any initial fills."
          action={
            <button
              className="btn-primary"
              onClick={() =>
                upsertRetailer({
                  id: `RT${Date.now() % 10000}`,
                  name: "New Retailer",
                  active: true,
                })
              }
            >
              + Add Retailer
            </button>
          }
        />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 mb-6">
            {/* Per-SKU sustained velocity summary */}
            <div className="card p-4">
              <div className="text-sm font-semibold mb-2">
                Sustained weekly velocity (sum across active retailers)
              </div>
              <table className="w-full text-sm">
                <thead className="bg-pickle-50">
                  <tr>
                    <th>SKU</th>
                    <th className="text-right">Jars / week</th>
                  </tr>
                </thead>
                <tbody>
                  {state.skus
                    .filter((s) => s.active)
                    .map((sku) => (
                      <tr key={sku.id}>
                        <td>
                          <span className="font-semibold">{sku.id}</span>{" "}
                          <span className="text-pickle-700">— {sku.name}</span>
                        </td>
                        <td className="text-right font-semibold">
                          {fmtNum(totalVelocity[sku.id] || 0)}
                        </td>
                      </tr>
                    ))}
                  <tr className="bg-pickle-50/30 font-semibold">
                    <td>Total</td>
                    <td className="text-right">
                      {fmtNum(
                        Object.values(totalVelocity).reduce((a, b) => a + b, 0),
                      )}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Next 8 weeks demand including initial fills */}
            <div className="card p-4">
              <div className="text-sm font-semibold mb-2">
                Next 8 weeks of retail demand (velocity + fills)
              </div>
              <div className="overflow-x-auto">
                <table className="text-sm">
                  <thead className="bg-pickle-50">
                    <tr>
                      <th>SKU</th>
                      {next8Weeks.map((w) => (
                        <th key={w.weekStart} className="text-right text-[10px]">
                          {fmtDate(w.weekStart).split(",")[0]}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {state.skus
                      .filter((s) => s.active)
                      .map((sku) => (
                        <tr key={sku.id}>
                          <td className="font-semibold">{sku.id}</td>
                          {next8Weeks.map((w) => {
                            const total = w.bySku[sku.id] || 0;
                            const baseline = w.velocityBySku[sku.id] || 0;
                            const fillBump = total - baseline;
                            return (
                              <td
                                key={w.weekStart}
                                className="text-right tabular-nums"
                                title={
                                  fillBump > 0
                                    ? `${baseline} velocity + ${fillBump} initial fill`
                                    : ""
                                }
                              >
                                {total > 0 ? (
                                  <>
                                    <span>{fmtNum(total)}</span>
                                    {fillBump > 0 && (
                                      <span className="text-amber-700 text-[10px]">
                                        {" "}
                                        (+{fmtNum(fillBump)})
                                      </span>
                                    )}
                                  </>
                                ) : (
                                  "—"
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
              <div className="text-xs text-pickle-700 mt-2">
                Amber numbers in parens = one-time initial fill landing that week.
              </div>
            </div>
          </div>

          <div className="space-y-3">
            {state.retailers.map((retailer) => (
              <RetailerCard
                key={retailer.id}
                retailer={retailer}
                onChange={upsertRetailer}
                onDelete={() => {
                  if (confirm(`Delete retailer "${retailer.name}" and all its data?`)) {
                    removeRetailer(retailer.id);
                  }
                }}
                onRename={(newId) => renameRetailer(retailer.id, newId)}
                velocities={state.retailVelocities.filter(
                  (v) => v.retailerId === retailer.id,
                )}
                onSetVelocity={(skuId, qty) => setVelocity(retailer.id, skuId, qty)}
                fills={state.initialFills.filter((f) => f.retailerId === retailer.id)}
                onUpsertFill={upsertFill}
                onRemoveFill={removeFill}
                skus={state.skus}
              />
            ))}
          </div>
        </>
      )}
    </>
  );
}

function RetailerCard({
  retailer,
  onChange,
  onDelete,
  onRename,
  velocities,
  onSetVelocity,
  fills,
  onUpsertFill,
  onRemoveFill,
  skus,
}: {
  retailer: Retailer;
  onChange: (r: Retailer) => void;
  onDelete: () => void;
  onRename: (newId: string) => void;
  velocities: { retailerId: string; skuId: string; weeklyVelocity: number }[];
  onSetVelocity: (skuId: string, qty: number) => void;
  fills: InitialFill[];
  onUpsertFill: (f: InitialFill) => void;
  onRemoveFill: (id: string) => void;
  skus: { id: string; name: string; active: boolean }[];
}) {
  const [expanded, setExpanded] = useState(true);
  const skuActive = skus.filter((s) => s.active);
  const totalVel = velocities.reduce(
    (a, v) => a + (Number(v.weeklyVelocity) || 0),
    0,
  );
  const carriedSkuCount = velocities.filter(
    (v) => (Number(v.weeklyVelocity) || 0) > 0,
  ).length;
  const pendingFills = fills.filter((f) => !f.fulfilled);

  return (
    <div className="border border-pickle-200 rounded-lg overflow-hidden">
      <div
        className={
          "bg-pickle-50/60 p-3 flex items-center justify-between cursor-pointer hover:bg-pickle-50 " +
          (retailer.active ? "" : "opacity-60")
        }
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="flex items-center gap-3">
          <span className={retailer.active ? "badge-ok" : "badge-bad"}>
            {retailer.active ? "Active" : "Inactive"}
          </span>
          <input
            className="font-semibold text-pickle-900 bg-transparent border-0 focus:bg-white focus:border focus:border-pickle-200 rounded px-1"
            value={retailer.name}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => onChange({ ...retailer, name: e.target.value })}
          />
          <div className="text-xs text-pickle-700">
            {carriedSkuCount} SKU{carriedSkuCount === 1 ? "" : "s"} ·{" "}
            {fmtNum(totalVel)} jars/wk
            {pendingFills.length > 0 && (
              <> · <span className="text-amber-700">{pendingFills.length} pending fill{pendingFills.length === 1 ? "" : "s"}</span></>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <label className="text-xs flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
            <input
              type="checkbox"
              checked={retailer.active}
              onChange={(e) => onChange({ ...retailer, active: e.target.checked })}
            />
            Active
          </label>
          <button
            className="text-xs text-red-600"
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
          >
            Delete
          </button>
          <span className="text-pickle-700 text-xs">{expanded ? "▲" : "▼"}</span>
        </div>
      </div>

      {expanded && (
        <div className="p-3 grid grid-cols-2 gap-4">
          {/* SKU velocity table */}
          <div>
            <div className="font-semibold text-sm mb-2">SKU velocity (jars/week)</div>
            <table className="w-full text-sm">
              <thead className="bg-pickle-50/30">
                <tr>
                  <th>SKU</th>
                  <th className="text-right">Jars / week</th>
                </tr>
              </thead>
              <tbody>
                {skuActive.map((sku) => {
                  const v = velocities.find((x) => x.skuId === sku.id);
                  return (
                    <tr key={sku.id}>
                      <td>
                        <span className="font-semibold">{sku.id}</span>{" "}
                        <span className="text-pickle-700 text-xs">{sku.name}</span>
                      </td>
                      <td>
                        <input
                          type="number"
                          className="input w-24 text-right"
                          value={v?.weeklyVelocity ?? ""}
                          placeholder="0"
                          min={0}
                          onChange={(e) =>
                            onSetVelocity(
                              sku.id,
                              parseFloat(e.target.value) || 0,
                            )
                          }
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="mt-2 text-xs text-pickle-700">
              Internal id: <code>{retailer.id}</code> ·{" "}
              <button
                className="text-pickle-700 underline"
                onClick={() => {
                  const newId = prompt("New retailer id?", retailer.id);
                  if (newId && newId !== retailer.id) onRename(newId);
                }}
              >
                rename
              </button>
            </div>
            <div className="mt-2">
              <textarea
                className="input"
                rows={2}
                placeholder="Notes (optional) — e.g. distributor, region, contact"
                value={retailer.notes ?? ""}
                onChange={(e) => onChange({ ...retailer, notes: e.target.value })}
              />
            </div>
          </div>

          {/* Initial fills */}
          <div>
            <div className="flex justify-between items-center mb-2">
              <div className="font-semibold text-sm">Initial fills</div>
              <button
                className="btn-secondary text-xs"
                onClick={() =>
                  onUpsertFill({
                    id: uid("fill"),
                    retailerId: retailer.id,
                    fillDate: ISO(new Date()),
                    fulfilled: false,
                    lines: [],
                  })
                }
              >
                + Add Initial Fill
              </button>
            </div>
            {fills.length === 0 ? (
              <div className="text-xs text-pickle-700 border border-dashed border-pickle-200 rounded p-3 text-center">
                No initial fills. Add one for new retailers or new SKU launches.
              </div>
            ) : (
              <div className="space-y-2">
                {fills
                  .slice()
                  .sort((a, b) => a.fillDate.localeCompare(b.fillDate))
                  .map((f) => (
                    <FillCard
                      key={f.id}
                      fill={f}
                      skus={skuActive}
                      onChange={onUpsertFill}
                      onDelete={() => onRemoveFill(f.id)}
                    />
                  ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function FillCard({
  fill,
  skus,
  onChange,
  onDelete,
}: {
  fill: InitialFill;
  skus: { id: string; name: string }[];
  onChange: (f: InitialFill) => void;
  onDelete: () => void;
}) {
  const totalQty = fill.lines.reduce((a, l) => a + (Number(l.qty) || 0), 0);
  const updateLine = (i: number, patch: Partial<{ skuId: string; qty: number }>) =>
    onChange({
      ...fill,
      lines: fill.lines.map((l, idx) => (idx === i ? { ...l, ...patch } : l)),
    });
  const addLine = () =>
    onChange({
      ...fill,
      lines: [...fill.lines, { skuId: skus[0]?.id || "", qty: 0 }],
    });
  const removeLine = (i: number) =>
    onChange({ ...fill, lines: fill.lines.filter((_, idx) => idx !== i) });

  return (
    <div className="border border-pickle-200 rounded p-2 bg-white">
      <div className="grid grid-cols-12 gap-2 items-center mb-2">
        <div className="col-span-4">
          <div className="label">Fill date</div>
          <input
            type="date"
            className="input"
            value={fill.fillDate}
            onChange={(e) => onChange({ ...fill, fillDate: e.target.value })}
          />
        </div>
        <div className="col-span-4">
          <label className="text-xs flex items-center gap-1 mt-3">
            <input
              type="checkbox"
              checked={fill.fulfilled}
              onChange={(e) => onChange({ ...fill, fulfilled: e.target.checked })}
            />
            Fulfilled
          </label>
        </div>
        <div className="col-span-4 text-right text-xs text-pickle-700">
          Total: <span className="font-semibold">{fmtNum(totalQty)}</span> jars
          <button className="text-red-600 ml-2" onClick={onDelete}>
            ×
          </button>
        </div>
      </div>
      <table className="w-full text-xs">
        <thead>
          <tr>
            <th>SKU</th>
            <th className="text-right">Qty</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {fill.lines.length === 0 && (
            <tr>
              <td colSpan={3} className="text-pickle-700 text-center py-2">
                No SKUs yet — click "+ line" below.
              </td>
            </tr>
          )}
          {fill.lines.map((l, i) => (
            <tr key={i}>
              <td>
                <select
                  className="input"
                  value={l.skuId}
                  onChange={(e) => updateLine(i, { skuId: e.target.value })}
                >
                  {skus.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.id} — {s.name}
                    </option>
                  ))}
                </select>
              </td>
              <td>
                <input
                  type="number"
                  className="input w-20 text-right"
                  value={l.qty}
                  onChange={(e) =>
                    updateLine(i, { qty: parseFloat(e.target.value) || 0 })
                  }
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
      <button className="btn-secondary text-xs mt-1" onClick={addLine}>
        + line
      </button>
      {fill.fulfilled && (
        <div className="text-[10px] text-pickle-700 mt-1">
          Marked fulfilled — won't count in upcoming demand.
        </div>
      )}
    </div>
  );
}
