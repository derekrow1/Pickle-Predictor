import type { Sku, ComponentItem, Warehouse, Settings } from "../types";

export const DEFAULT_SKUS: Sku[] = [
  { id: "HDW25", name: "Heritage Dill Whole 25oz",   jarOz: 25, retailPrice: 11.99, cogsPerJar: 3.2, orderMultiple: 6, orderUnitLabel: "case", active: true },
  { id: "SDW25", name: "Spicy Dill Whole 25oz",      jarOz: 25, retailPrice: 11.99, cogsPerJar: 3.2, orderMultiple: 6, orderUnitLabel: "case", active: true },
  { id: "HDS19", name: "Heritage Dill Slices 19oz",  jarOz: 19, retailPrice: 9.99,  cogsPerJar: 3.2, orderMultiple: 6, orderUnitLabel: "case", active: true },
  { id: "SDS19", name: "Hot Dill Slices 19oz",       jarOz: 19, retailPrice: 9.99,  cogsPerJar: 3.2, orderMultiple: 6, orderUnitLabel: "case", active: true },
  { id: "GJS19", name: "Garlic Jalapeño Slices 19oz",jarOz: 19, retailPrice: 9.99,  cogsPerJar: 3.2, orderMultiple: 6, orderUnitLabel: "case", active: true },
];

// Pallet quantities seeded from the existing spreadsheet's "Pallets" reference table where known.
// Where unknown I default to 1 (no rounding) so the user notices and edits in Settings.
export const DEFAULT_COMPONENTS: ComponentItem[] = [
  { id: "C8CB",  name: "8x8x8 Box",     category: "box",   managedByMe: true,  targetWeeksOnHand: 10, unitCost: 1.20, orderMultiple: 900, orderUnitLabel: "pallet" },
  { id: "C10CB", name: "10x10x10 Box",  category: "box",   managedByMe: true,  targetWeeksOnHand: 10, unitCost: 1.40, orderMultiple: 500, orderUnitLabel: "pallet" },
  { id: "C12CB", name: "12x12x12 Box",  category: "box",   managedByMe: false, targetWeeksOnHand: 10, unitCost: 1.65, orderMultiple: 1,   orderUnitLabel: "" },
  { id: "C14CB", name: "14x14x14 Box",  category: "box",   managedByMe: false, targetWeeksOnHand: 10, unitCost: 1.95, orderMultiple: 1,   orderUnitLabel: "" },
  { id: "L8CB",  name: "8x8x8 Liner",   category: "liner", managedByMe: true,  targetWeeksOnHand: 10, unitCost: 1.10, orderMultiple: 265, orderUnitLabel: "pallet" },
  { id: "L10CB", name: "10x10x10 Liner",category: "liner", managedByMe: true,  targetWeeksOnHand: 10, unitCost: 1.25, orderMultiple: 175, orderUnitLabel: "pallet" },
  { id: "L12CB", name: "12x12x12 Liner",category: "liner", managedByMe: false, targetWeeksOnHand: 10, unitCost: 1.45, orderMultiple: 1,   orderUnitLabel: "" },
  { id: "L14CB", name: "14x14x14 Liner",category: "liner", managedByMe: false, targetWeeksOnHand: 10, unitCost: 1.70, orderMultiple: 1,   orderUnitLabel: "" },
  { id: "IP16",  name: "16oz Gel Pack", category: "gel",   managedByMe: true,  targetWeeksOnHand: 10, unitCost: 0.55, orderMultiple: 1,   orderUnitLabel: "" },
  { id: "IP32",  name: "32oz Gel Pack", category: "gel",   managedByMe: false, targetWeeksOnHand: 10, unitCost: 0.85, orderMultiple: 1,   orderUnitLabel: "" },
  // Service items — appear on POs but are not inventory.
  { id: "FREIGHT", name: "Freight",     category: "service", managedByMe: false, targetWeeksOnHand: 0, unitCost: 0, orderMultiple: 1, orderUnitLabel: "" },
];

// Default warehouse → state mapping (FedEx/UPS 2-day-or-less zones, editable in Settings)
export const DEFAULT_WAREHOUSES: Warehouse[] = [
  {
    id: "MO",
    name: "Missouri",
    states: ["MO","KS","OK","AR","TN","KY","IL","IA","NE","TX","LA","MS","AL","CO","WI","IN","MN","SD","ND"],
    active: true,
  },
  {
    id: "PA",
    name: "Pennsylvania",
    states: ["PA","NY","NJ","DE","MD","DC","VA","WV","NC","SC","GA","FL","CT","RI","MA","VT","NH","ME","OH","MI"],
    active: true,
  },
  {
    id: "NV",
    name: "Nevada",
    states: ["NV","CA","OR","WA","AZ","UT","ID","MT","WY","NM","HI","AK"],
    active: true,
  },
];

export function buildDefaultStateMap(warehouses: Warehouse[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const w of warehouses) {
    for (const s of w.states) map[s.toUpperCase()] = w.id;
  }
  return map;
}

export const DEFAULT_SETTINGS: Settings = {
  manufacturerLeadWeeks: 4,
  shippingTransitDays: 5,
  totalShelfLifeWeeks: 26,
  retailEnabled: false,
  retailFreshnessPct: 0.7,
  ecommerceMinWeeksAtCustomer: 4,
  defaultMinWeeksOnHand: 4,
  defaultMaxWeeksOnHand: 8,
  pickleTargetWeeksOnHand: 5,
  componentTargetWeeksOnHand: 10,
  forecastLookbackWeeks: 4,
  weeklyGrowthRate: 0.02,
  summerSeasonalityPct: 0.10,
  summerStartMonth: 6,
  summerEndMonth: 8,
  adElasticity: 0.05,
  adBaselineWeekly: 5000,
  smallOrderShippingEstimate: 15,
  largeOrderShippingEstimate: 20,
  freightCostPerJarBlended: 0.30,
  packagingCostPerOrder: 3.20,
  processingCostPctOfOrder: 0.029,
  fixedFeesPerOrder: 0.30,
  promoCostPctOfOrder: 0.05,
};

export const PLATFORM_OPTIONS = ["Meta", "TikTok", "Google", "YouTube", "Influencer", "Other"];

export const EVENT_TYPES = ["Influencer", "Celebrity", "Launch", "Promo", "Demo", "Press", "Other"];

// Maps a description from warehouse CSV to a demand key.
// Editable in Settings; this is a starting set seeded from the user's existing sheet.
export const DEFAULT_INVENTORY_SKU_MAP: Record<string, string> = {
  "10x10x10 Liner A": "L10CB",
  "10x10x10 Liner B": "L10CB",
  "8x8x8 Liner A": "L8CB",
  "8x8x8 Liner B": "L8CB",
  "12x12x12 Liner": "L12CB",
  "14x14x14 Liner": "L14CB",
  "16oz Gel Packs": "IP16",
  "32oz Gel Packs": "IP32",
  "Josh_8x8x8_EcoLiner": "C8CB",
  "Josh_10x10x10_EcoLiner": "C10CB",
  "Josh_12x12x12_EcoLiner": "C12CB",
  "Josh_14x14x14_EcoLiner": "C14CB",
  "GJS19": "GJS19",
  "HDS19": "HDS19",
  "HDW25": "HDW25",
  "SDS19": "SDS19",
  "SDW25": "SDW25",
};
