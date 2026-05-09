import { TZDate } from "@date-fns/tz";
import { addDays, addWeeks, startOfWeek } from "date-fns";

/**
 * Single source of truth for “business weeks”:
 * Sunday–Saturday, in one IANA timezone (matches QuickBooks Online weekly P&L for US companies).
 * Use this everywhere we bucket Shopify orders, forecasts, retail, and QBO report ranges.
 */
export const DEFAULT_BUSINESS_TIMEZONE = "America/Los_Angeles";

/** Strip quotes/whitespace; fall back if env is not a valid IANA zone (avoids cryptic runtime errors). */
export function normalizeBusinessTimeZone(input: string | undefined | null): string {
  const raw = String(input ?? "")
    .trim()
    .replace(/^['"]|['"]$/g, "");
  if (!raw) return DEFAULT_BUSINESS_TIMEZONE;
  try {
    new Intl.DateTimeFormat("en-CA", { timeZone: raw }).format(new Date(0));
    return raw;
  } catch {
    return DEFAULT_BUSINESS_TIMEZONE;
  }
}

export function serverBusinessTimezone(): string {
  try {
    const v = typeof process !== "undefined" && process.env?.BUSINESS_TIMEZONE;
    if (v && String(v).trim()) return normalizeBusinessTimeZone(String(v));
  } catch {
    /* no process (browser) */
  }
  return DEFAULT_BUSINESS_TIMEZONE;
}

export function calendarYmdInZone(instant: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(instant);
}

export function businessWeekStartSunday(instant: Date, timeZone: string): TZDate {
  const z = new TZDate(instant, timeZone);
  return startOfWeek(z, { weekStartsOn: 0 }) as TZDate;
}

/** Canonical week id: YYYY-MM-DD of the Sunday that starts the business week. */
export function weekStartIsoKey(instant: Date, timeZone: string): string {
  const ws = businessWeekStartSunday(instant, timeZone);
  return calendarYmdInZone(ws, timeZone);
}

export function parseWeekKeyStart(ymd: string, timeZone: string): TZDate {
  const m = ymd.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) {
    return businessWeekStartSunday(new Date(), timeZone);
  }
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const d = Number(m[3]);
  return new TZDate(y, mo, d, 0, 0, 0, timeZone);
}

export function eachBusinessWeekStart(from: Date, count: number, timeZone: string): TZDate[] {
  const first = businessWeekStartSunday(from, timeZone);
  const out: TZDate[] = [];
  for (let i = 0; i < count; i++) {
    out.push(addWeeks(first, i) as TZDate);
  }
  return out;
}

/** start/end YYYY-MM-DD for QuickBooks ProfitAndLoss?summarize_column_by=Week */
export function qboWeeklyProfitLossRange(
  now: Date,
  numWeeks: number,
  timeZone: string,
): { startYmd: string; endYmd: string } {
  const currentWeekSunday = businessWeekStartSunday(now, timeZone);
  const endInstant = addDays(currentWeekSunday, -1);
  const startInstant = addDays(currentWeekSunday, -7 * numWeeks);
  return {
    startYmd: calendarYmdInZone(startInstant, timeZone),
    endYmd: calendarYmdInZone(endInstant, timeZone),
  };
}

export type AdSpendEntryLike = { weekStart: string; platform: string; amount: number };

/** Remap ad rows onto Sun–Sat week keys and merge duplicates (e.g. after changing week rules). */
export function normalizeAdSpendWeekKeys(entries: AdSpendEntryLike[], timeZone: string): AdSpendEntryLike[] {
  const merged = new Map<string, AdSpendEntryLike>();
  for (const e of entries) {
    const m = e.weekStart.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) continue;
    const anchor = new TZDate(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0, timeZone);
    const nk = weekStartIsoKey(anchor, timeZone);
    const k = `${nk}|${e.platform}`;
    const prev = merged.get(k);
    if (prev) prev.amount += e.amount;
    else merged.set(k, { ...e, weekStart: nk });
  }
  return [...merged.values()];
}
