import { useState } from "react";
import { useStore } from "../store/store";
import {
  parseFile,
  importWarehouseInventory,
  parseLotControlReport,
  isLotControlFormat,
} from "../lib/importers";
import type { LotControlImportResult } from "../lib/importers";
import { cleanShopifyRows } from "../lib/cleanShopify";
import { fmtDate, fmtNum } from "../lib/util";
import type { InventorySnapshotRow } from "../types";
import { PageHeader } from "../components/Layout";

interface StagedFile {
  filename: string;
  warehouseId: string; // detected or user-selected
  date: string;
  rows: InventorySnapshotRow[];
  unknownItems: { sku: string; qty: number }[];
  warnings: string[];
  metadata: LotControlImportResult["metadata"];
  applied: boolean;
}

export function DataView() {
  const state = useStore();
  const setShopify = useStore((s) => s.setShopifyData);
  const appendShopify = useStore((s) => s.appendShopifyData);
  const clearShopify = useStore((s) => s.clearShopifyData);
  const removeInv = useStore((s) => s.removeInventorySnapshot);
  const upsertSlice = useStore((s) => s.upsertInventorySlice);

  const [shopifyMsg, setShopifyMsg] = useState<string>("");
  const [invMsg, setInvMsg] = useState<string>("");
  const [unmatched, setUnmatched] = useState<{ sku: string; count: number }[]>([]);
  const [staged, setStaged] = useState<StagedFile[]>([]);

  const handleShopify = async (
    e: React.ChangeEvent<HTMLInputElement>,
    append: boolean,
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setShopifyMsg("Parsing…");
    try {
      const parsed = await parseFile(file);
      const result = cleanShopifyRows(parsed.rows, state.warehouseStateMap);
      if (append) appendShopify(parsed.rows, result.clean);
      else setShopify(parsed.rows, result.clean);
      setUnmatched(result.unmatchedSkus.slice(0, 20));
      setShopifyMsg(
        `Imported ${result.clean.length} clean orders from ${parsed.rows.length} raw rows. ${
          result.unmatchedSkus.length
            ? result.unmatchedSkus.length + " unmatched SKUs (see below)."
            : ""
        }`,
      );
    } catch (err: any) {
      setShopifyMsg(`Error: ${err.message || err}`);
    }
    e.target.value = "";
  };

  const handleWarehouseFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    setInvMsg(`Parsing ${files.length} file(s)…`);
    const newStaged: StagedFile[] = [];
    const whIds = state.warehouses.map((w) => w.id);

    for (const file of files) {
      try {
        const parsed = await parseFile(file);
        if (isLotControlFormat(parsed)) {
          // Lot Control Roll Forward — one warehouse per file
          const result = parseLotControlReport(parsed, whIds);
          newStaged.push({
            filename: file.name,
            warehouseId: result.warehouseHint || whIds[0] || "",
            date: result.date,
            rows: result.rows,
            unknownItems: result.unknownItems,
            warnings: result.warnings,
            metadata: result.metadata,
            applied: false,
          });
        } else {
          // Old COUNT-style: multi-warehouse, one or more dates per file
          const result = importWarehouseInventory(parsed.rows, whIds);
          for (const snap of result.snapshots) {
            // Group rows by warehouseId for staging
            const byWh = new Map<string, InventorySnapshotRow[]>();
            for (const r of snap.rows) {
              if (!byWh.has(r.warehouseId)) byWh.set(r.warehouseId, []);
              byWh.get(r.warehouseId)!.push(r);
            }
            for (const [wh, rs] of byWh) {
              newStaged.push({
                filename: file.name,
                warehouseId: wh,
                date: snap.date,
                rows: rs,
                unknownItems: result.unknownItems.map((u) => ({ sku: u.sku, qty: 0 })),
                warnings: result.warnings,
                metadata: { periodStart: null, periodEnd: null, onHandTimestamp: null, title: "" },
                applied: false,
              });
            }
          }
        }
      } catch (err: any) {
        setInvMsg(`Error parsing ${file.name}: ${err.message || err}`);
        return;
      }
    }
    setStaged((s) => [...s, ...newStaged]);
    setInvMsg(
      `Staged ${newStaged.length} upload(s). Review warehouse + date below, then click "Apply".`,
    );
    e.target.value = "";
  };

  const updateStaged = (idx: number, patch: Partial<StagedFile>) => {
    setStaged((s) => s.map((f, i) => (i === idx ? { ...f, ...patch } : f)));
  };

  const applyStaged = () => {
    let count = 0;
    setStaged((s) =>
      s.map((f) => {
        if (f.applied || !f.warehouseId || !f.date) return f;
        upsertSlice(f.date, f.warehouseId, f.rows);
        count++;
        return { ...f, applied: true };
      }),
    );
    setInvMsg(`Applied ${count} upload(s) to inventory.`);
  };

  const clearStaged = () => {
    setStaged([]);
    setInvMsg("");
  };

  const whIds = state.warehouses.map((w) => w.id);

  return (
    <>
      <PageHeader title="Raw Data" subtitle="Upload, audit, and inspect raw imports" />

      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="card p-4">
          <div className="text-sm font-semibold mb-2">📦 Warehouse inventory</div>
          <div className="text-xs text-pickle-700 mb-2">
            Drop one or more <strong>Lot Control Roll Forward</strong> reports (one per warehouse).
            Filenames containing <code>MO</code>, <code>PA</code>, or <code>NV</code> auto-route — you can override below.
          </div>
          <input
            type="file"
            multiple
            accept=".csv,.xlsx,.xls"
            onChange={handleWarehouseFiles}
          />
          {invMsg && <div className="text-sm mt-2">{invMsg}</div>}

          {staged.length > 0 && (
            <div className="mt-3 border-t border-pickle-100 pt-3">
              <div className="flex justify-between items-center mb-2">
                <div className="font-semibold text-sm">Staged uploads ({staged.length})</div>
                <div className="flex gap-2">
                  <button className="btn-primary" onClick={applyStaged}>
                    Apply all
                  </button>
                  <button className="btn-secondary" onClick={clearStaged}>
                    Clear
                  </button>
                </div>
              </div>
              <table className="w-full text-xs">
                <thead>
                  <tr>
                    <th>File</th>
                    <th>Warehouse</th>
                    <th>Date</th>
                    <th className="text-right">Items</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {staged.map((f, idx) => (
                    <tr key={idx}>
                      <td>
                        <div title={f.filename} className="max-w-[220px] truncate">
                          {f.filename}
                        </div>
                        {f.warnings.length > 0 && (
                          <details className="text-[10px] text-amber-700">
                            <summary>{f.warnings.length} note(s)</summary>
                            <ul className="ml-2">
                              {f.warnings.map((w, i) => (
                                <li key={i}>· {w}</li>
                              ))}
                            </ul>
                          </details>
                        )}
                        {f.unknownItems.length > 0 && (
                          <details className="text-[10px] text-red-700">
                            <summary>
                              {f.unknownItems.length} unknown SKU(s)
                            </summary>
                            <ul className="ml-2">
                              {f.unknownItems.map((u, i) => (
                                <li key={i}>
                                  · {u.sku} (qty {u.qty})
                                </li>
                              ))}
                            </ul>
                          </details>
                        )}
                      </td>
                      <td>
                        <select
                          className="input"
                          value={f.warehouseId}
                          onChange={(e) => updateStaged(idx, { warehouseId: e.target.value })}
                          disabled={f.applied}
                        >
                          <option value="">— pick —</option>
                          {whIds.map((id) => (
                            <option key={id} value={id}>
                              {id}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <input
                          type="date"
                          className="input"
                          value={f.date}
                          onChange={(e) => updateStaged(idx, { date: e.target.value })}
                          disabled={f.applied}
                        />
                      </td>
                      <td className="text-right">{f.rows.length}</td>
                      <td>
                        {f.applied ? (
                          <span className="badge-ok">applied</span>
                        ) : (
                          <span className="badge-info">pending</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="mt-4">
            <div className="label">Recent snapshots</div>
            <ul className="text-sm">
              {state.inventorySnapshots
                .slice()
                .reverse()
                .slice(0, 5)
                .map((s) => {
                  const whSummary = whIds
                    .map((wh) => {
                      const t = s.rows
                        .filter((r) => r.warehouseId === wh)
                        .reduce((a, b) => a + b.qty, 0);
                      return t > 0 ? `${wh}: ${fmtNum(t)}` : null;
                    })
                    .filter(Boolean)
                    .join("  ·  ");
                  return (
                    <li
                      key={s.date}
                      className="flex justify-between items-center py-1 border-b border-pickle-50"
                    >
                      <div>
                        <div className="font-semibold">{fmtDate(s.date)}</div>
                        <div className="text-xs text-pickle-700">{whSummary}</div>
                      </div>
                      <button
                        className="text-xs text-red-600"
                        onClick={() => removeInv(s.date)}
                      >
                        delete
                      </button>
                    </li>
                  );
                })}
              {state.inventorySnapshots.length === 0 && (
                <li className="text-pickle-700">None yet</li>
              )}
            </ul>
          </div>
        </div>

        <div className="card p-4">
          <div className="text-sm font-semibold mb-2">🛒 Shopify orders export</div>
          <div className="text-xs text-pickle-700 mb-2">
            Upload the raw Shopify order export. We auto-expand multi-pack SKUs into per-SKU jars.
          </div>
          <div className="flex gap-2 items-center">
            <label className="text-xs">
              Replace all:
              <input
                className="ml-1"
                type="file"
                accept=".csv,.xlsx,.xls"
                onChange={(e) => handleShopify(e, false)}
              />
            </label>
            <label className="text-xs">
              Append:
              <input
                className="ml-1"
                type="file"
                accept=".csv,.xlsx,.xls"
                onChange={(e) => handleShopify(e, true)}
              />
            </label>
          </div>
          {shopifyMsg && <div className="text-sm mt-2">{shopifyMsg}</div>}
          {unmatched.length > 0 && (
            <details className="mt-2 text-xs">
              <summary className="cursor-pointer">{unmatched.length} unmatched SKUs</summary>
              <ul className="mt-1">
                {unmatched.map((u) => (
                  <li key={u.sku}>
                    {u.sku} — qty {u.count}
                  </li>
                ))}
              </ul>
            </details>
          )}
          <div className="mt-3 flex gap-3 text-sm items-center">
            <div>
              Clean orders: <strong>{state.cleanOrders.length}</strong>
            </div>
            <div>
              Raw rows: <strong>{state.rawShopifyRows.length}</strong>
            </div>
            <button className="text-xs text-red-600" onClick={clearShopify}>
              clear
            </button>
          </div>
        </div>
      </div>

      <div className="card p-4 mb-4">
        <div className="text-sm font-semibold mb-2">Cleaned orders preview</div>
        <div className="overflow-auto max-h-[420px]">
          <table className="text-xs w-full">
            <thead className="bg-pickle-50 sticky top-0">
              <tr>
                <th>Order</th>
                <th>Date</th>
                <th>State</th>
                <th>WH</th>
                <th className="text-right">Jars</th>
                <th className="text-right">HDW25</th>
                <th className="text-right">SDW25</th>
                <th className="text-right">HDS19</th>
                <th className="text-right">SDS19</th>
                <th className="text-right">GJS19</th>
                <th className="text-right">Order $</th>
              </tr>
            </thead>
            <tbody>
              {state.cleanOrders
                .slice(-200)
                .reverse()
                .map((o) => (
                  <tr key={o.orderName}>
                    <td>{o.orderName}</td>
                    <td>{fmtDate(o.date)}</td>
                    <td>{o.shippingState || "—"}</td>
                    <td>{o.warehouseId || "—"}</td>
                    <td className="text-right">{o.totalJars}</td>
                    <td className="text-right">{o.units.HDW25 || ""}</td>
                    <td className="text-right">{o.units.SDW25 || ""}</td>
                    <td className="text-right">{o.units.HDS19 || ""}</td>
                    <td className="text-right">{o.units.SDS19 || ""}</td>
                    <td className="text-right">{o.units.GJS19 || ""}</td>
                    <td className="text-right">${(o.orderValue || 0).toFixed(2)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
