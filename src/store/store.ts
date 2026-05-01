import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type {
  AppState,
  AdSpendEntry,
  BankBalanceEntry,
  CleanOrderLine,
  ComponentItem,
  InitialFill,
  InventorySnapshot,
  InventorySnapshotRow,
  MarketingEvent,
  OpenPO,
  Receipt,
  Retailer,
  Settings,
  Sku,
  Warehouse,
} from "../types";
import {
  DEFAULT_COMPONENTS,
  DEFAULT_SETTINGS,
  DEFAULT_SKUS,
  DEFAULT_WAREHOUSES,
  buildDefaultStateMap,
} from "../lib/constants";

const initialState: AppState = {
  skus: DEFAULT_SKUS,
  components: DEFAULT_COMPONENTS,
  warehouses: DEFAULT_WAREHOUSES,
  warehouseStateMap: buildDefaultStateMap(DEFAULT_WAREHOUSES),
  inventorySnapshots: [],
  openPOs: [],
  receipts: [],
  retailers: [],
  retailVelocities: [],
  initialFills: [],
  rawShopifyRows: [],
  cleanOrders: [],
  adSpend: [],
  events: [],
  bankBalances: [],
  settings: DEFAULT_SETTINGS,
};

interface Actions {
  // Bulk
  reset(): void; // wipes everything (operational data too)
  resetAssumptions(): void; // resets only Settings — preserves POs, inventory, etc.
  importJSON(state: AppState): void;

  // Settings
  updateSettings(s: Partial<Settings>): void;

  // SKUs
  upsertSku(sku: Sku): void;
  removeSku(id: string): void;
  renameSku(oldId: string, newId: string): void;

  // Components
  upsertComponent(c: ComponentItem): void;
  removeComponent(id: string): void;
  renameComponent(oldId: string, newId: string): void;

  // Warehouses
  upsertWarehouse(w: Warehouse): void;
  removeWarehouse(id: string): void;
  renameWarehouse(oldId: string, newId: string): void;
  setWarehouseStateMap(map: Record<string, string>): void;

  // Inventory
  addInventorySnapshot(s: InventorySnapshot): void;
  removeInventorySnapshot(date: string): void;
  // Replace a single warehouse's slice of a snapshot for the given date,
  // creating the snapshot if it doesn't exist. Other warehouses' rows are preserved.
  upsertInventorySlice(date: string, warehouseId: string, rows: InventorySnapshotRow[]): void;

  // POs
  upsertPO(po: OpenPO): void;
  removePO(id: string): void;
  // Receipts
  addReceipt(r: Receipt): void;
  removeReceipt(id: string): void;
  // Atomic: stamp a PO as received and create a Receipt history record.
  // Pass a fully-formed Receipt object (with id and linkedPoId set).
  markPOReceived(poId: string, receipt: Receipt): void;
  // Reverse markPOReceived: deletes any receipts linked to this PO and reopens it.
  reopenPO(poId: string): void;

  // Shopify
  setShopifyData(raw: any[], clean: CleanOrderLine[]): void;
  appendShopifyData(raw: any[], clean: CleanOrderLine[]): void;
  clearShopifyData(): void;

  // Marketing
  upsertAdSpend(e: AdSpendEntry): void;
  removeAdSpend(weekStart: string, platform: string): void;
  upsertEvent(e: MarketingEvent): void;
  removeEvent(id: string): void;

  // Bank
  upsertBankBalance(b: BankBalanceEntry): void;
  removeBankBalance(date: string): void;

  // Retail
  upsertRetailer(r: Retailer): void;
  removeRetailer(id: string): void;
  renameRetailer(oldId: string, newId: string): void;
  setRetailVelocity(retailerId: string, skuId: string, weeklyVelocity: number): void;
  upsertInitialFill(f: InitialFill): void;
  removeInitialFill(id: string): void;
}

export const useStore = create<AppState & Actions>()(
  persist(
    (set) => ({
      ...initialState,

      reset: () => set({ ...initialState }),
      resetAssumptions: () => set({ settings: DEFAULT_SETTINGS }),
      importJSON: (s) => set({ ...s }),

      updateSettings: (s) =>
        set((state) => ({ settings: { ...state.settings, ...s } })),

      upsertSku: (sku) =>
        set((state) => {
          const idx = state.skus.findIndex((x) => x.id === sku.id);
          const skus = [...state.skus];
          if (idx >= 0) skus[idx] = sku;
          else skus.push(sku);
          return { skus };
        }),
      removeSku: (id) => set((s) => ({ skus: s.skus.filter((x) => x.id !== id) })),
      renameSku: (oldId, newId) =>
        set((state) => ({
          skus: state.skus.map((s) => (s.id === oldId ? { ...s, id: newId } : s)),
        })),

      upsertComponent: (c) =>
        set((state) => {
          const idx = state.components.findIndex((x) => x.id === c.id);
          const items = [...state.components];
          if (idx >= 0) items[idx] = c;
          else items.push(c);
          return { components: items };
        }),
      removeComponent: (id) =>
        set((s) => ({ components: s.components.filter((x) => x.id !== id) })),
      renameComponent: (oldId, newId) =>
        set((state) => ({
          components: state.components.map((c) =>
            c.id === oldId ? { ...c, id: newId } : c,
          ),
        })),

      upsertWarehouse: (w) =>
        set((state) => {
          const idx = state.warehouses.findIndex((x) => x.id === w.id);
          const ws = [...state.warehouses];
          if (idx >= 0) ws[idx] = w;
          else ws.push(w);
          return { warehouses: ws };
        }),
      removeWarehouse: (id) =>
        set((s) => ({ warehouses: s.warehouses.filter((x) => x.id !== id) })),
      renameWarehouse: (oldId, newId) =>
        set((state) => ({
          warehouses: state.warehouses.map((w) =>
            w.id === oldId ? { ...w, id: newId } : w,
          ),
        })),

      setWarehouseStateMap: (map) => set({ warehouseStateMap: map }),

      addInventorySnapshot: (snap) =>
        set((state) => {
          const filtered = state.inventorySnapshots.filter((s) => s.date !== snap.date);
          return {
            inventorySnapshots: [...filtered, snap].sort((a, b) =>
              a.date.localeCompare(b.date),
            ),
            lastInventoryImportAt: new Date().toISOString(),
          };
        }),
      removeInventorySnapshot: (date) =>
        set((s) => ({
          inventorySnapshots: s.inventorySnapshots.filter((x) => x.date !== date),
        })),

      upsertInventorySlice: (date, warehouseId, newRows) =>
        set((state) => {
          const tagged: InventorySnapshotRow[] = newRows.map((r) => ({
            ...r,
            warehouseId,
          }));
          const snaps = [...state.inventorySnapshots];
          const idx = snaps.findIndex((s) => s.date === date);
          if (idx >= 0) {
            const existing = snaps[idx];
            const otherWh = existing.rows.filter(
              (r) => r.warehouseId !== warehouseId,
            );
            snaps[idx] = { date, rows: [...otherWh, ...tagged] };
          } else {
            snaps.push({ date, rows: tagged });
          }
          snaps.sort((a, b) => a.date.localeCompare(b.date));
          return {
            inventorySnapshots: snaps,
            lastInventoryImportAt: new Date().toISOString(),
          };
        }),

      upsertPO: (po) =>
        set((state) => {
          const idx = state.openPOs.findIndex((x) => x.id === po.id);
          const list = [...state.openPOs];
          if (idx >= 0) list[idx] = po;
          else list.push(po);
          return { openPOs: list };
        }),
      removePO: (id) => set((s) => ({ openPOs: s.openPOs.filter((x) => x.id !== id) })),

      addReceipt: (r) =>
        set((state) => ({ receipts: [...state.receipts, r] })),
      removeReceipt: (id) =>
        set((state) => ({ receipts: state.receipts.filter((r) => r.id !== id) })),
      markPOReceived: (poId, receipt) =>
        set((state) => ({
          receipts: [...state.receipts, receipt],
          openPOs: state.openPOs.map((p) =>
            p.id === poId
              ? { ...p, status: "received" as const, receivedAt: receipt.receivedDate }
              : p,
          ),
        })),
      reopenPO: (poId) =>
        set((state) => ({
          receipts: state.receipts.filter((r) => r.linkedPoId !== poId),
          openPOs: state.openPOs.map((p) =>
            p.id === poId ? { ...p, status: "open" as const, receivedAt: undefined } : p,
          ),
        })),

      setShopifyData: (raw, clean) =>
        set({
          rawShopifyRows: raw,
          cleanOrders: clean,
          lastShopifyImportAt: new Date().toISOString(),
        }),
      appendShopifyData: (raw, clean) =>
        set((state) => {
          const seen = new Set(state.cleanOrders.map((o) => o.orderName));
          const newClean = clean.filter((o) => !seen.has(o.orderName));
          return {
            rawShopifyRows: [...state.rawShopifyRows, ...raw],
            cleanOrders: [...state.cleanOrders, ...newClean],
            lastShopifyImportAt: new Date().toISOString(),
          };
        }),
      clearShopifyData: () => set({ rawShopifyRows: [], cleanOrders: [] }),

      upsertAdSpend: (e) =>
        set((state) => {
          const idx = state.adSpend.findIndex(
            (x) => x.weekStart === e.weekStart && x.platform === e.platform,
          );
          const list = [...state.adSpend];
          if (idx >= 0) list[idx] = e;
          else list.push(e);
          return { adSpend: list };
        }),
      removeAdSpend: (weekStart, platform) =>
        set((s) => ({
          adSpend: s.adSpend.filter(
            (x) => !(x.weekStart === weekStart && x.platform === platform),
          ),
        })),

      upsertEvent: (e) =>
        set((state) => {
          const idx = state.events.findIndex((x) => x.id === e.id);
          const list = [...state.events];
          if (idx >= 0) list[idx] = e;
          else list.push(e);
          return { events: list };
        }),
      removeEvent: (id) => set((s) => ({ events: s.events.filter((x) => x.id !== id) })),

      upsertBankBalance: (b) =>
        set((state) => {
          const idx = state.bankBalances.findIndex((x) => x.date === b.date);
          const list = [...state.bankBalances];
          if (idx >= 0) list[idx] = b;
          else list.push(b);
          list.sort((a, b) => a.date.localeCompare(b.date));
          return { bankBalances: list };
        }),
      removeBankBalance: (date) =>
        set((s) => ({ bankBalances: s.bankBalances.filter((x) => x.date !== date) })),

      // ===== Retail =====
      upsertRetailer: (r) =>
        set((state) => {
          const idx = state.retailers.findIndex((x) => x.id === r.id);
          const list = [...state.retailers];
          if (idx >= 0) list[idx] = r;
          else list.push(r);
          return { retailers: list };
        }),
      removeRetailer: (id) =>
        set((state) => ({
          retailers: state.retailers.filter((r) => r.id !== id),
          retailVelocities: state.retailVelocities.filter((v) => v.retailerId !== id),
          initialFills: state.initialFills.filter((f) => f.retailerId !== id),
        })),
      renameRetailer: (oldId, newId) =>
        set((state) => ({
          retailers: state.retailers.map((r) =>
            r.id === oldId ? { ...r, id: newId } : r,
          ),
          retailVelocities: state.retailVelocities.map((v) =>
            v.retailerId === oldId ? { ...v, retailerId: newId } : v,
          ),
          initialFills: state.initialFills.map((f) =>
            f.retailerId === oldId ? { ...f, retailerId: newId } : f,
          ),
        })),
      setRetailVelocity: (retailerId, skuId, weeklyVelocity) =>
        set((state) => {
          const idx = state.retailVelocities.findIndex(
            (v) => v.retailerId === retailerId && v.skuId === skuId,
          );
          const list = [...state.retailVelocities];
          if (weeklyVelocity <= 0) {
            // Remove zero/negative entries
            if (idx >= 0) list.splice(idx, 1);
          } else if (idx >= 0) {
            list[idx] = { retailerId, skuId, weeklyVelocity };
          } else {
            list.push({ retailerId, skuId, weeklyVelocity });
          }
          return { retailVelocities: list };
        }),
      upsertInitialFill: (f) =>
        set((state) => {
          const idx = state.initialFills.findIndex((x) => x.id === f.id);
          const list = [...state.initialFills];
          if (idx >= 0) list[idx] = f;
          else list.push(f);
          return { initialFills: list };
        }),
      removeInitialFill: (id) =>
        set((s) => ({ initialFills: s.initialFills.filter((f) => f.id !== id) })),
    }),
    {
      name: "pickle-predictor-v1",
      storage: createJSONStorage(() => localStorage),
      version: 6,
      migrate: (persistedState: any, fromVersion: number) => {
        // v1 -> v2: backfill orderMultiple / orderUnitLabel on SKUs and components.
        if (fromVersion < 2 && persistedState) {
          const skuDefaults = Object.fromEntries(
            DEFAULT_SKUS.map((s) => [s.id, { orderMultiple: s.orderMultiple, orderUnitLabel: s.orderUnitLabel }]),
          );
          const compDefaults = Object.fromEntries(
            DEFAULT_COMPONENTS.map((c) => [c.id, { orderMultiple: c.orderMultiple, orderUnitLabel: c.orderUnitLabel }]),
          );
          if (Array.isArray(persistedState.skus)) {
            persistedState.skus = persistedState.skus.map((s: any) => ({
              ...s,
              orderMultiple: s.orderMultiple ?? skuDefaults[s.id]?.orderMultiple ?? 6,
              orderUnitLabel: s.orderUnitLabel ?? skuDefaults[s.id]?.orderUnitLabel ?? "case",
            }));
          }
          if (Array.isArray(persistedState.components)) {
            persistedState.components = persistedState.components.map((c: any) => ({
              ...c,
              orderMultiple: c.orderMultiple ?? compDefaults[c.id]?.orderMultiple ?? 1,
              orderUnitLabel: c.orderUnitLabel ?? compDefaults[c.id]?.orderUnitLabel ?? "",
            }));
          }
        }
        // v5 -> v6: ensure retail arrays exist on AppState.
        if (fromVersion < 6 && persistedState) {
          if (!Array.isArray(persistedState.retailers)) persistedState.retailers = [];
          if (!Array.isArray(persistedState.retailVelocities)) persistedState.retailVelocities = [];
          if (!Array.isArray(persistedState.initialFills)) persistedState.initialFills = [];
        }
        // v4 -> v5: add receipts array and stamp existing POs with status="open".
        if (fromVersion < 5 && persistedState) {
          if (!Array.isArray(persistedState.receipts)) {
            persistedState.receipts = [];
          }
          if (Array.isArray(persistedState.openPOs)) {
            persistedState.openPOs = persistedState.openPOs.map((po: any) => ({
              ...po,
              status: po.status ?? "open",
            }));
          }
        }
        // v3 -> v4: ensure service items (e.g. Freight) exist in components.
        if (fromVersion < 4 && persistedState && Array.isArray(persistedState.components)) {
          const existingIds = new Set(persistedState.components.map((c: any) => c.id));
          const serviceDefaults = DEFAULT_COMPONENTS.filter((c) => c.category === "service");
          for (const svc of serviceDefaults) {
            if (!existingIds.has(svc.id)) {
              persistedState.components.push({ ...svc });
            }
          }
        }
        // v2 -> v3: convert single-item OpenPOs to multi-line POs.
        if (fromVersion < 3 && persistedState && Array.isArray(persistedState.openPOs)) {
          persistedState.openPOs = persistedState.openPOs.map((po: any) => {
            // already migrated?
            if (Array.isArray(po.lines)) return po;
            return {
              id: po.id,
              warehouseId: po.warehouseId,
              poDate: po.poDate,
              expectedArrival: po.expectedArrival,
              poNumber: po.poNumber,
              notes: po.notes,
              lines: [
                {
                  itemId: po.itemId,
                  qty: po.qty,
                  unitCost: po.unitCost,
                },
              ],
            };
          });
        }
        return persistedState;
      },
    },
  ),
);

// Helpers
export function exportStateAsJSON(state: AppState): string {
  const clean: AppState = {
    skus: state.skus,
    components: state.components,
    warehouses: state.warehouses,
    warehouseStateMap: state.warehouseStateMap,
    inventorySnapshots: state.inventorySnapshots,
    openPOs: state.openPOs,
    receipts: state.receipts,
    retailers: state.retailers,
    retailVelocities: state.retailVelocities,
    initialFills: state.initialFills,
    rawShopifyRows: state.rawShopifyRows,
    cleanOrders: state.cleanOrders,
    adSpend: state.adSpend,
    events: state.events,
    bankBalances: state.bankBalances,
    settings: state.settings,
    lastShopifyImportAt: state.lastShopifyImportAt,
    lastInventoryImportAt: state.lastInventoryImportAt,
  };
  return JSON.stringify(clean, null, 2);
}
