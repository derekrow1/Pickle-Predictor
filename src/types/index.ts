// ===== Core domain types =====

export type Channel = "Shopify" | "TikTok" | "Amazon" | "Other";

export interface Sku {
  id: string; // demand key, e.g. "HDW25"
  name: string; // human friendly
  jarOz: 19 | 25 | 32;
  retailPrice: number;
  cogsPerJar: number; // landed product cost per jar
  // Order quantity must be a multiple of this. Defaults to 6 (a case of jars).
  // 0 or 1 means "no rounding".
  orderMultiple: number;
  // Friendly label for the unit, e.g. "case" or "pallet". Used in tooltips.
  orderUnitLabel?: string;
  active: boolean;
}

export interface ComponentItem {
  id: string; // e.g. "C8CB", "L8CB", "IP16", "FREIGHT"
  name: string;
  // "service" items (e.g. Freight, Customs, Setup Fee) appear on POs but are
  // excluded from inventory tracking and order recommendations.
  category: "box" | "liner" | "gel" | "service" | "other";
  managedByMe: boolean; // true = I order; false = warehouse stocks
  targetWeeksOnHand: number; // default 10 for managed
  unitCost: number; // optional, for cash math
  // Order quantity must be a multiple of this (e.g. 500 for 10x10x10 box pallet).
  // 0 or 1 means "no rounding".
  orderMultiple: number;
  orderUnitLabel?: string;
}

export interface Warehouse {
  id: string; // e.g. "MO", "NV", "PA"
  name: string;
  // States routed to this warehouse
  states: string[]; // 2-letter US codes
  active: boolean;
}

export interface InventorySnapshotRow {
  warehouseId: string;
  itemId: string; // SKU id or component id (demand key)
  qty: number;
}

export interface InventorySnapshot {
  date: string; // ISO date
  rows: InventorySnapshotRow[];
}

export interface OpenPOLine {
  itemId: string; // SKU id or component id
  qty: number;
  unitCost?: number;
}

export interface OpenPO {
  id: string;
  warehouseId: string;
  poDate: string; // ISO
  expectedArrival: string; // ISO
  poNumber?: string; // optional reference number from the WMS portal
  notes?: string;
  lines: OpenPOLine[];
  status?: "open" | "received"; // default "open"
  receivedAt?: string; // ISO date stamped when status flipped
}

export interface ReceiptLine {
  itemId: string;
  orderedQty?: number; // qty on the linked PO line, for over/under tracking
  qty: number; // actual received qty
  lot?: string;
  bestByDate?: string;
  unitCost?: number;
}

export interface Receipt {
  id: string;
  receiptNumber?: string; // e.g. "MO Receipt 27"
  receivedDate: string; // ISO
  warehouseId: string;
  linkedPoId?: string; // optional — standalone receipts (Supply Adjustment) have no PO link
  type?: string; // freeform, e.g. "PO Receipt", "Supply Adjustment", "Cycle Count"
  notes?: string;
  lines: ReceiptLine[];
}

// ===== Retail =====

export interface Retailer {
  id: string;
  name: string; // e.g. "Whole Foods Pacific NW"
  notes?: string;
  active: boolean;
}

export interface RetailVelocity {
  retailerId: string;
  skuId: string;
  weeklyVelocity: number; // jars/week sold by this retailer for this SKU
}

export interface InitialFill {
  id: string;
  retailerId: string;
  fillDate: string; // ISO — date the fill is needed (or has shipped)
  notes?: string;
  fulfilled: boolean; // true once shipped
  lines: { skuId: string; qty: number }[]; // per-SKU jars in the initial fill
}

export interface CleanOrderLine {
  orderName: string;
  date: string; // ISO
  shippingState?: string;
  warehouseId?: string; // computed from state
  // Per-SKU jars on this line (after multi-pack expansion)
  units: Record<string, number>; // skuId -> jars
  totalJars: number;
  merchQty: number;
  merchValue: number;
  pickleValue: number;
  shippingValue: number;
  taxValue: number;
  discountValue: number;
  orderValue: number;
}

export interface AdSpendEntry {
  weekStart: string; // ISO Monday
  platform: string; // "Meta" | "TikTok" | "Google" | etc — freeform
  amount: number;
}

export interface MarketingEvent {
  id: string;
  date: string; // ISO
  type: string; // "Influencer" | "Celebrity" | "Launch" | "Promo" | "Demo" | etc.
  label: string;
  multiplier: number; // 1.0 = neutral, 1.30 = +30% week-of
  affectedSkuIds?: string[]; // empty = all
  notes?: string;
}

export interface BankBalanceEntry {
  date: string; // ISO
  amount: number;
  notes?: string;
}

export interface Settings {
  // Lead times
  manufacturerLeadWeeks: number; // default 4
  shippingTransitDays: number; // default 5
  // Shelf life
  totalShelfLifeWeeks: number; // default 26
  retailEnabled: boolean; // default false
  retailFreshnessPct: number; // default 0.7 (70%)
  ecommerceMinWeeksAtCustomer: number; // default 4
  // Targets
  defaultMinWeeksOnHand: number;
  defaultMaxWeeksOnHand: number;
  pickleTargetWeeksOnHand: number; // default 5
  componentTargetWeeksOnHand: number; // default 10
  // Forecast
  forecastLookbackWeeks: number; // default 4
  weeklyGrowthRate: number; // default 0.02 -> 2%/wk
  summerSeasonalityPct: number; // default 0.10 (lift)
  summerStartMonth: number; // 1-12, default 6
  summerEndMonth: number; // default 8
  // Marketing model
  adElasticity: number; // % demand uplift per $1k of weekly spend over baseline; default 0.05
  adBaselineWeekly: number; // $ baseline above which we count uplift
  // Costs
  smallOrderShippingEstimate: number;
  largeOrderShippingEstimate: number;
  // Cash
  freightCostPerJarBlended: number; // simple blended freight per jar
  packagingCostPerOrder: number;
  processingCostPctOfOrder: number; // 0.029
  fixedFeesPerOrder: number; // 0.30
  promoCostPctOfOrder: number; // ~0.05
}

export interface AppState {
  skus: Sku[];
  components: ComponentItem[];
  warehouses: Warehouse[];
  warehouseStateMap: Record<string, string>; // state -> warehouseId
  inventorySnapshots: InventorySnapshot[];
  openPOs: OpenPO[];
  receipts: Receipt[];
  // Retail
  retailers: Retailer[];
  retailVelocities: RetailVelocity[]; // sparse — only entries that exist
  initialFills: InitialFill[];
  // Order data
  rawShopifyRows: any[]; // last raw upload (audit)
  cleanOrders: CleanOrderLine[]; // expanded by SKU
  // Marketing
  adSpend: AdSpendEntry[];
  events: MarketingEvent[];
  // Cash
  bankBalances: BankBalanceEntry[];
  // Settings
  settings: Settings;
  // Meta
  lastShopifyImportAt?: string;
  lastInventoryImportAt?: string;
}
