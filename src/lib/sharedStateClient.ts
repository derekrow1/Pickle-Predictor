import type { AppState } from "../types";

export type SharedStateEnvelope = {
  ok: true;
  updatedAt: string;
  pathname: string;
  state: AppState;
};

export async function fetchSharedState(): Promise<SharedStateEnvelope | null> {
  const r = await fetch("/api/shared/state-get", { method: "GET", headers: { Accept: "application/json" } });
  if (r.status === 404) return null;
  const text = await r.text();
  if (!r.ok) throw new Error(text.slice(0, 400));
  return JSON.parse(text) as SharedStateEnvelope;
}

export async function putSharedState(state: AppState, adminToken?: string): Promise<void> {
  const r = await fetch("/api/shared/state-put", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(adminToken ? { "x-shared-state-admin-token": adminToken } : {}),
    },
    body: JSON.stringify(state),
  });
  const text = await r.text();
  if (!r.ok) throw new Error(text.slice(0, 400));
}

