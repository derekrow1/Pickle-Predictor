import { addDays, addWeeks } from "date-fns";

/**
 * Week buckets: Sunday–Saturday, using **calendar dates only** (YYYY-MM-DD).
 * Order/revenue rows use the date as stored (first YYYY-MM-DD in the string)—no IANA timezone or hour rules.
 */

/** YYYY-MM-DD from a Date using UTC calendar fields (stable, date-only). */
export function calendarYmdUtc(instant: Date): string {
  const y = instant.getUTCFullYear();
  const m = String(instant.getUTCMonth() + 1).padStart(2, "0");
  const d = String(instant.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Sunday YYYY-MM-DD of the week that contains this calendar day. */
export function weekStartSundayFromYmd(ymd: string): string {
  const m = ymd.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return ymd;
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const day = Number(m[3]);
  const dt = new Date(Date.UTC(y, mo, day, 12, 0, 0));
  const dow = dt.getUTCDay();
  dt.setUTCDate(dt.getUTCDate() - dow);
  return calendarYmdUtc(dt);
}

/**
 * Prefer the date as written on the order/revenue field (leading YYYY-MM-DD).
 * Falls back to null if there is no date prefix (caller may parse a full timestamp).
 */
export function weekStartKeyForStoredDate(raw: string | undefined | null): string | null {
  if (raw == null || raw === "") return null;
  const m = String(raw).trim().match(/^(\d{4}-\d{2}-\d{2})/);
  if (!m) return null;
  return weekStartSundayFromYmd(m[1]);
}

/** Week key from an absolute instant (uses UTC calendar day of that instant). */
export function weekStartIsoKey(instant: Date): string {
  return weekStartSundayFromYmd(calendarYmdUtc(instant));
}

export function businessWeekStartSunday(instant: Date): Date {
  const key = weekStartIsoKey(instant);
  const m = key.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return instant;
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0));
}

export function parseWeekKeyStart(ymd: string): Date {
  const m = ymd.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return businessWeekStartSunday(new Date());
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0));
}

export function eachBusinessWeekStart(from: Date, count: number): Date[] {
  const first = businessWeekStartSunday(from);
  const out: Date[] = [];
  for (let i = 0; i < count; i++) {
    out.push(addWeeks(first, i));
  }
  return out;
}

/** start/end YYYY-MM-DD for QuickBooks ProfitAndLoss?summarize_column_by=Week (UTC calendar weeks). */
export function qboWeeklyProfitLossRange(now: Date, numWeeks: number): { startYmd: string; endYmd: string } {
  const currentWeekSunday = businessWeekStartSunday(now);
  const endInstant = addDays(currentWeekSunday, -1);
  const startInstant = addDays(currentWeekSunday, -7 * numWeeks);
  return {
    startYmd: calendarYmdUtc(startInstant),
    endYmd: calendarYmdUtc(endInstant),
  };
}

export type AdSpendEntryLike = { weekStart: string; platform: string; amount: number };

export function normalizeAdSpendWeekKeys(entries: AdSpendEntryLike[]): AdSpendEntryLike[] {
  const merged = new Map<string, AdSpendEntryLike>();
  for (const e of entries) {
    const m = e.weekStart.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) continue;
    const nk = weekStartSundayFromYmd(`${m[1]}-${m[2]}-${m[3]}`);
    const k = `${nk}|${e.platform}`;
    const prev = merged.get(k);
    if (prev) prev.amount += e.amount;
    else merged.set(k, { ...e, weekStart: nk });
  }
  return [...merged.values()];
}
