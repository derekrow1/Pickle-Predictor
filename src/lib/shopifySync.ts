import { fetchShopifyOrdersBackfill, fetchShopifyOrdersRefresh } from "./shopifyClient";
import { cleanShopifyAdminOrders } from "./cleanShopifyAdmin";
import { useStore } from "../store/store";
import { schedulePushSharedState } from "./sharedStateSync";

const STALE_HOURS = 6;
const BACKFILL_WEEKS = 52;
const REFRESH_DAYS = 30;

function isStale(iso: string | undefined, hours: number): boolean {
  if (!iso) return true;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return true;
  return Date.now() - t > hours * 60 * 60 * 1000;
}

export async function syncShopifyOnOpen(): Promise<{ mode: "none" | "backfill" | "refresh"; count: number }> {
  const state = useStore.getState();
  const hasCache = Array.isArray(state.shopifyAllCleanOrders) && state.shopifyAllCleanOrders.length > 0;

  const mode: "none" | "backfill" | "refresh" =
    !hasCache ? "backfill" : isStale(state.lastShopifySyncAt, STALE_HOURS) ? "refresh" : "none";

  if (mode === "none") return { mode, count: 0 };

  const orders =
    mode === "backfill"
      ? await fetchShopifyOrdersBackfill(BACKFILL_WEEKS)
      : await fetchShopifyOrdersRefresh(REFRESH_DAYS);

  const cleaned = cleanShopifyAdminOrders(orders, state.warehouseStateMap);
  useStore.getState().syncShopifyFromApi(cleaned.clean, mode);
  schedulePushSharedState();
  return { mode, count: cleaned.clean.length };
}

