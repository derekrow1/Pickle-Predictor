import { fetchSharedState, putSharedState } from "./sharedStateClient";
import { useStore } from "../store/store";
import type { AppState } from "../types";

function parseTime(iso?: string): number {
  if (!iso) return 0;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : 0;
}

function mergeLocalSettingsIntoShared(local: AppState, shared: AppState): AppState {
  // Preserve local-only UI preferences and secrets (token).
  return {
    ...shared,
    settings: {
      ...shared.settings,
      shopifyWeeksBack: local.settings.shopifyWeeksBack,
      sharedStateAdminToken: local.settings.sharedStateAdminToken,
    },
  };
}

export async function pullSharedStateOnOpen(): Promise<"pulled" | "none"> {
  const local = useStore.getState();
  const remote = await fetchSharedState();
  if (!remote) return "none";

  const localPulledAt = parseTime(local.sharedStateLastPulledAt);
  const remoteUpdatedAt = parseTime(remote.updatedAt);
  if (remoteUpdatedAt && localPulledAt && remoteUpdatedAt <= localPulledAt) {
    return "none";
  }

  const merged = mergeLocalSettingsIntoShared(local, remote.state);
  useStore.getState().importJSON({
    ...merged,
    sharedStateLastPulledAt: new Date().toISOString(),
  });
  return "pulled";
}

let pushTimer: number | null = null;

export function schedulePushSharedState(delayMs = 1500): void {
  if (pushTimer) window.clearTimeout(pushTimer);
  pushTimer = window.setTimeout(() => {
    void pushSharedStateNow();
  }, delayMs);
}

export async function pushSharedStateNow(): Promise<void> {
  const state = useStore.getState();
  const token = String(state.settings.sharedStateAdminToken || "").trim();
  if (!token) return;

  await putSharedState(state as AppState, token);
}

