import { addDays, addWeeks, format, parseISO, startOfWeek, isValid } from "date-fns";

export const ISO = (d: Date) => format(d, "yyyy-MM-dd");

export function parseAnyDate(v: unknown): Date | null {
  if (v == null || v === "") return null;
  if (v instanceof Date) return isValid(v) ? v : null;
  if (typeof v === "number") {
    // Excel serial? If between 30000 and 70000 treat as Excel date
    if (v > 25569 && v < 90000) {
      // Excel epoch 1899-12-30
      const ms = (v - 25569) * 86400 * 1000;
      const d = new Date(ms);
      return isValid(d) ? d : null;
    }
    const d = new Date(v);
    return isValid(d) ? d : null;
  }
  if (typeof v === "string") {
    const s = v.trim();
    if (!s) return null;
    const isoTry = parseISO(s);
    if (isValid(isoTry)) return isoTry;
    const fallback = new Date(s);
    return isValid(fallback) ? fallback : null;
  }
  return null;
}

export const weekStart = (d: Date) => startOfWeek(d, { weekStartsOn: 1 }); // Monday

export function eachWeekStart(from: Date, weeks: number): Date[] {
  const out: Date[] = [];
  let d = weekStart(from);
  for (let i = 0; i < weeks; i++) {
    out.push(d);
    d = addWeeks(d, 1);
  }
  return out;
}

export const fmtMoney = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n || 0);

export const fmtMoney2 = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(n || 0);

export const fmtNum = (n: number, digits = 0) =>
  new Intl.NumberFormat("en-US", { maximumFractionDigits: digits }).format(n || 0);

export const fmtPct = (n: number, digits = 0) =>
  new Intl.NumberFormat("en-US", { style: "percent", maximumFractionDigits: digits }).format(n || 0);

export const fmtDate = (iso: string) => {
  const d = parseAnyDate(iso);
  return d ? format(d, "MMM d, yyyy") : iso;
};

export const fmtDateShort = (iso: string) => {
  const d = parseAnyDate(iso);
  return d ? format(d, "MMM d") : iso;
};

export function uid(prefix = "id"): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

export { addDays, addWeeks };
