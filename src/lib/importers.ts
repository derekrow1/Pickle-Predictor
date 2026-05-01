import Papa from "papaparse";
import * as XLSX from "xlsx";
import type { InventorySnapshot, InventorySnapshotRow } from "../types";
import { ISO, parseAnyDate } from "./util";
import { DEFAULT_INVENTORY_SKU_MAP } from "./constants";

export interface ParsedFile {
  filename: string;
  rawArrays: any[][]; // raw rows as arrays (no header parsing)
  headers: string[]; // first non-empty row treated as headers
  rows: Record<string, any>[]; // object rows keyed by headers
}

export async function parseFile(file: File): Promise<ParsedFile> {
  const ext = (file.name.split(".").pop() || "").toLowerCase();
  if (ext === "csv" || ext === "tsv" || ext === "txt") {
    return new Promise((resolve, reject) => {
      Papa.parse(file, {
        header: false,
        skipEmptyLines: true,
        dynamicTyping: false,
        complete: (res) => {
          const rawArrays = (res.data as any[][]).map((row) =>
            Array.isArray(row) ? row : [row],
          );
          const headers = (rawArrays[0] || []).map((h) => String(h || "").trim());
          const rows = rawArrays.slice(1).map((arr) => {
            const obj: Record<string, any> = {};
            for (let i = 0; i < headers.length; i++) obj[headers[i]] = arr[i];
            return obj;
          });
          resolve({ filename: file.name, rawArrays, headers, rows });
        },
        error: (err) => reject(err),
      });
    });
  }
  // xlsx / xlsb / xls
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array", cellDates: true });
  // Pick the first non-empty sheet
  let chosenSheet = wb.SheetNames[0];
  for (const name of wb.SheetNames) {
    const ws = wb.Sheets[name];
    const ref = ws["!ref"];
    if (ref && ref.length > 0) {
      chosenSheet = name;
      break;
    }
  }
  const ws = wb.Sheets[chosenSheet];
  const rawArrays = XLSX.utils.sheet_to_json<any[]>(ws, {
    header: 1,
    defval: "",
    raw: false,
  }) as any[][];
  const headers = (rawArrays[0] || []).map((h) => String(h || "").trim());
  const rows = rawArrays.slice(1).map((arr) => {
    const obj: Record<string, any> = {};
    for (let i = 0; i < headers.length; i++) obj[headers[i]] = arr[i];
    return obj;
  });
  return { filename: file.name, rawArrays, headers, rows };
}

/** Returns true if the file looks like a "Lot Control Roll Forward" report. */
export function isLotControlFormat(parsed: ParsedFile): boolean {
  const firstCell = String(parsed.rawArrays[0]?.[0] || "").toLowerCase();
  return firstCell.includes("lot control") || firstCell.includes("roll forward");
}

/**
 * Returns true if the file looks like a Smartwarehousing single-warehouse inventory
 * snapshot (e.g. Joshspicklesmo_Inventory_*.xls). Headers at row 0; has a SKU column
 * and a Quantity column (no per-warehouse columns).
 */
export function isInventorySnapshotFormat(parsed: ParsedFile): boolean {
  const headers = (parsed.rawArrays[0] || []).map((h: any) =>
    String(h || "").trim().toLowerCase(),
  );
  const hasSku = headers.includes("sku");
  const hasQty =
    headers.includes("quantity") || headers.includes("on hand") || headers.includes("on hand + open");
  // Must NOT have per-warehouse columns (which would mean COUNT-style multi-warehouse)
  const hasPerWh = headers.some((h) => /^(mo|pa|nv)\s*qty/i.test(h));
  return hasSku && hasQty && !hasPerWh;
}

/**
 * Detects a warehouse id from a filename. Handles both:
 *   - "Joshs_Pickles-MO_RollFwd_..." (separator-bounded)
 *   - "Joshspicklesmo_Inventory_..." (glued to a longer string)
 *
 * Boundary matches win first; falls back to substring search.
 */
export function detectWarehouseFromFilename(
  filename: string,
  warehouseIds: string[],
): string | null {
  const upper = filename.toUpperCase();
  // Pass 1: separator-bounded match (highest confidence)
  for (const id of warehouseIds) {
    const idU = id.toUpperCase();
    const re = new RegExp(`(^|[^A-Z])${idU}([^A-Z]|$)`);
    if (re.test(upper)) return id;
  }
  // Pass 2: substring (catches "joshspicklesmo")
  for (const id of warehouseIds) {
    const idU = id.toUpperCase();
    if (upper.includes(idU)) return id;
  }
  return null;
}

/** Parse a date from a filename. Handles YYYY-MM-DD and YYYYMMDD. */
function dateFromFilename(filename: string): string | null {
  const dashed = filename.match(/(\d{4}-\d{2}-\d{2})/);
  if (dashed) return dashed[1];
  const compact = filename.match(/(\d{4})(\d{2})(\d{2})/);
  if (compact) return `${compact[1]}-${compact[2]}-${compact[3]}`;
  return null;
}

export interface LotControlImportResult {
  date: string; // ISO end-of-period date
  warehouseHint: string | null;
  rows: InventorySnapshotRow[];
  unknownItems: { sku: string; qty: number }[];
  warnings: string[];
  metadata: {
    periodStart: string | null;
    periodEnd: string | null;
    onHandTimestamp: string | null;
    title: string;
  };
}

/**
 * Parse a Lot Control Roll Forward report (one warehouse per file).
 * Title is at row 0, headers at row 1. SKU rows can repeat per lot — we sum "On Hand + Open" by SKU.
 */
export function parseLotControlReport(
  parsed: ParsedFile,
  warehouseIds: string[],
  inventorySkuMap: Record<string, string> = DEFAULT_INVENTORY_SKU_MAP,
): LotControlImportResult {
  const arrays = parsed.rawArrays;
  const titleRow = String(arrays[0]?.[0] || "");
  const isLotControl = isLotControlFormat(parsed);
  const headerRowIdx = isLotControl ? 1 : 0;
  const headers = (arrays[headerRowIdx] || []).map((h: any) =>
    String(h || "").trim().toLowerCase(),
  );

  const findCol = (...candidates: string[]) => {
    for (const c of candidates) {
      const lc = c.toLowerCase();
      const i = headers.findIndex(
        (h) => h === lc || h.startsWith(lc) || h.includes(lc),
      );
      if (i >= 0) return i;
    }
    return -1;
  };
  const idxSku = findCol("sku");
  const idxDesc = findCol("description");
  const idxOnHandOpen = findCol("on hand + open");
  const idxOnHand = findCol("on hand");
  const idxQuantity = findCol("quantity"); // Inventory snapshot format uses this column

  const warnings: string[] = [];
  if (idxSku < 0) {
    warnings.push("Couldn't find a 'SKU' column — file format not recognized.");
    return {
      date: ISO(new Date()),
      warehouseHint: null,
      rows: [],
      unknownItems: [],
      warnings,
      metadata: {
        periodStart: null,
        periodEnd: null,
        onHandTimestamp: null,
        title: titleRow,
      },
    };
  }

  // Snapshot date: prefer the period END from the title, then filename, then today.
  let periodStart: string | null = null;
  let periodEnd: string | null = null;
  let onHandTimestamp: string | null = null;
  if (isLotControl) {
    const range = titleRow.match(
      /(\d{4}-\d{2}-\d{2})[^A-Za-z0-9]*[^t]*to[^0-9]*(\d{4}-\d{2}-\d{2})/i,
    );
    if (range) {
      periodStart = range[1];
      periodEnd = range[2];
    }
    const onHandMatch =
      titleRow.match(/As of\s*(\d{4}-\d{2}-\d{2})/i) ||
      titleRow.match(/Quantities are as of\s*(\d{4}-\d{2}-\d{2})/i);
    if (onHandMatch) onHandTimestamp = onHandMatch[1];
  }
  let snapshotDate = periodEnd;
  if (!snapshotDate) snapshotDate = dateFromFilename(parsed.filename);
  if (!snapshotDate) snapshotDate = ISO(new Date());

  const warehouseHint = detectWarehouseFromFilename(parsed.filename, warehouseIds);

  // Aggregate qty by demand key
  const acc = new Map<string, number>();
  const unknown = new Map<string, number>();

  for (let i = headerRowIdx + 1; i < arrays.length; i++) {
    const row = arrays[i] || [];
    const sku = String(row[idxSku] || "").trim();
    if (!sku) continue;
    if (sku.toUpperCase() === "SKU") continue; // duplicate header in some exports

    if (sku.startsWith("H_")) {
      // HOLD stock — physically present but reserved/blocked
      warnings.push(`Excluded HOLD stock: ${sku}`);
      continue;
    }
    if (sku.startsWith("D_")) {
      // DAMAGED stock — not sellable
      warnings.push(`Excluded DAMAGED stock: ${sku}`);
      continue;
    }
    if (/sticker|label/i.test(sku)) continue;

    let demandKey = inventorySkuMap[sku];
    if (!demandKey) {
      const desc = String(row[idxDesc] || "").trim();
      demandKey = inventorySkuMap[desc] || "";
    }

    // Pick whichever qty column exists, in priority order:
    //   On Hand + Open (Lot Control) > On Hand > Quantity (Inventory snapshot)
    const qtyRaw =
      (idxOnHandOpen >= 0 ? row[idxOnHandOpen] : undefined) ??
      (idxOnHand >= 0 ? row[idxOnHand] : undefined) ??
      (idxQuantity >= 0 ? row[idxQuantity] : 0);
    const qty = parseFloat(String(qtyRaw || 0)) || 0;

    if (!demandKey) {
      unknown.set(sku, (unknown.get(sku) || 0) + qty);
      continue;
    }
    acc.set(demandKey, (acc.get(demandKey) || 0) + qty);
  }

  const rows: InventorySnapshotRow[] = [];
  for (const [itemId, qty] of acc) {
    rows.push({ warehouseId: warehouseHint || "", itemId, qty });
  }

  return {
    date: snapshotDate,
    warehouseHint,
    rows,
    unknownItems: [...unknown.entries()].map(([sku, qty]) => ({ sku, qty })),
    warnings,
    metadata: {
      periodStart,
      periodEnd,
      onHandTimestamp,
      title: titleRow,
    },
  };
}

/**
 * Warehouse inventory import. Expected columns (case-insensitive, flexible):
 *   Snapshot Date, SKU, Description, MO Qty, NV Qty, PA Qty, Demand Key
 *
 * Also tolerates files that have only one warehouse column (e.g., "Qty" + a separate file per warehouse).
 * Returns one snapshot per unique date in the file.
 */
export interface WarehouseImportResult {
  snapshots: InventorySnapshot[];
  unknownItems: { sku: string; description: string }[];
  warnings: string[];
}

export function importWarehouseInventory(
  rows: any[],
  warehouseIds: string[],
  inventorySkuMap: Record<string, string> = DEFAULT_INVENTORY_SKU_MAP,
): WarehouseImportResult {
  // Detect column shape
  const lower = (s: string) => s.toLowerCase().trim();
  const sample = rows.find((r) => Object.keys(r).length > 0) || {};
  const keys = Object.keys(sample);
  const findKey = (...needles: string[]) => {
    for (const k of keys) {
      const lk = lower(k);
      if (needles.some((n) => lk === n || lk.startsWith(n) || lk.includes(n))) return k;
    }
    return null;
  };

  const dateKey = findKey("snapshot date", "date");
  const skuKey = findKey("sku", "item");
  const descKey = findKey("description", "name");
  const demandKey = findKey("demand key");

  // Per-warehouse qty columns: "MO Qty", "NV Qty", "PA Qty"
  const whQtyKeys: Record<string, string | null> = {};
  for (const w of warehouseIds) {
    whQtyKeys[w] = findKey(`${w.toLowerCase()} qty`, `${w.toLowerCase()}_qty`, `${w.toLowerCase()} quantity`);
  }
  const singleQtyKey = findKey("qty", "quantity", "on hand");

  const grouped = new Map<string, InventorySnapshotRow[]>(); // date -> rows
  const unknown: { sku: string; description: string }[] = [];
  const warnings: string[] = [];

  for (const r of rows) {
    const date = parseAnyDate(dateKey ? r[dateKey] : null);
    if (!date) continue;
    const dateIso = ISO(date);
    const skuRaw = String((skuKey ? r[skuKey] : "") || "").trim();
    const desc = String((descKey ? r[descKey] : "") || "").trim();
    let demand = String((demandKey ? r[demandKey] : "") || "").trim();
    if (!demand) demand = inventorySkuMap[skuRaw] || inventorySkuMap[desc] || "";
    if (!demand) {
      unknown.push({ sku: skuRaw, description: desc });
      continue;
    }
    if (!grouped.has(dateIso)) grouped.set(dateIso, []);

    let added = 0;
    for (const w of warehouseIds) {
      const k = whQtyKeys[w];
      if (k != null) {
        const q = Number(r[k] || 0) || 0;
        if (q !== 0 || true) {
          grouped.get(dateIso)!.push({ warehouseId: w, itemId: demand, qty: q });
          added++;
        }
      }
    }
    if (added === 0 && singleQtyKey) {
      // Single-warehouse file shape — caller must specify warehouse id externally;
      // for now bucket into the first warehouseId.
      const q = Number(r[singleQtyKey] || 0) || 0;
      grouped.get(dateIso)!.push({ warehouseId: warehouseIds[0], itemId: demand, qty: q });
      warnings.push(`Row used single-quantity column for ${demand}; bucketed to ${warehouseIds[0]}.`);
    }
  }

  // Aggregate duplicates per (date, warehouse, item) — sum qty
  const snapshots: InventorySnapshot[] = [];
  for (const [date, rs] of grouped) {
    const acc = new Map<string, InventorySnapshotRow>();
    for (const r of rs) {
      const key = `${r.warehouseId}|${r.itemId}`;
      if (acc.has(key)) acc.get(key)!.qty += r.qty;
      else acc.set(key, { ...r });
    }
    snapshots.push({ date, rows: [...acc.values()] });
  }
  snapshots.sort((a, b) => a.date.localeCompare(b.date));

  // Dedupe unknowns
  const seenU = new Set<string>();
  const dedupUnknown: { sku: string; description: string }[] = [];
  for (const u of unknown) {
    const k = `${u.sku}|${u.description}`;
    if (seenU.has(k)) continue;
    seenU.add(k);
    dedupUnknown.push(u);
  }

  return { snapshots, unknownItems: dedupUnknown, warnings };
}
