import type { ReactNode } from "react";
import clsx from "clsx";
import { useStore } from "../store/store";
import { fmtDate } from "../lib/util";

export type Page =
  | "order-now"
  | "inventory"
  | "components"
  | "retail"
  | "forecast"
  | "cash"
  | "profit"
  | "marketing"
  | "data"
  | "settings";

interface NavItem {
  id: Page;
  label: string;
  icon: string;
}

const NAV: NavItem[] = [
  { id: "order-now", label: "Order Now",   icon: "📋" },
  { id: "inventory", label: "Inventory",   icon: "🏬" },
  { id: "components", label: "Components", icon: "📦" },
  { id: "retail", label: "Retail",         icon: "🛒" },
  { id: "forecast", label: "Forecast",     icon: "📈" },
  { id: "cash", label: "Cash & Burn",      icon: "💰" },
  { id: "profit", label: "Profitability",  icon: "🧾" },
  { id: "marketing", label: "Marketing",   icon: "📣" },
  { id: "data", label: "Raw Data",         icon: "🗂" },
  { id: "settings", label: "Settings",     icon: "⚙️" },
];

export function Layout({
  page,
  setPage,
  children,
}: {
  page: Page;
  setPage: (p: Page) => void;
  children: ReactNode;
}) {
  const lastShopify = useStore((s) => s.lastShopifyImportAt);
  const lastInv = useStore((s) => s.lastInventoryImportAt);
  return (
    <div className="flex h-full">
      <aside className="w-56 shrink-0 bg-pickle-900 text-white flex flex-col">
        <div className="p-4 border-b border-pickle-700">
          <div className="text-xl font-bold">🥒 Pickle Predictor</div>
          <div className="text-xs text-pickle-200 mt-1">Inventory · Cash · Demand</div>
        </div>
        <nav className="flex-1 p-2">
          {NAV.map((n) => (
            <button
              key={n.id}
              onClick={() => setPage(n.id)}
              className={clsx(
                "w-full text-left px-3 py-2 rounded text-sm flex items-center gap-2 mb-0.5",
                page === n.id
                  ? "bg-pickle-700 text-white"
                  : "text-pickle-100 hover:bg-pickle-800",
              )}
            >
              <span>{n.icon}</span>
              <span>{n.label}</span>
            </button>
          ))}
        </nav>
        <div className="p-3 border-t border-pickle-700 text-xs text-pickle-200">
          {lastShopify ? (
            <div>Shopify: {fmtDate(lastShopify.slice(0, 10))}</div>
          ) : (
            <div className="text-amber-300">No Shopify upload yet</div>
          )}
          {lastInv ? (
            <div>Inventory: {fmtDate(lastInv.slice(0, 10))}</div>
          ) : (
            <div className="text-amber-300">No inventory upload yet</div>
          )}
        </div>
      </aside>
      <main className="flex-1 overflow-auto">
        <div className="p-6 max-w-[1500px] mx-auto">{children}</div>
      </main>
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  right,
}: {
  title: string;
  subtitle?: string;
  right?: ReactNode;
}) {
  return (
    <div className="flex items-end justify-between mb-6">
      <div>
        <h1 className="text-2xl font-bold text-pickle-900">{title}</h1>
        {subtitle && <div className="text-sm text-pickle-700 mt-0.5">{subtitle}</div>}
      </div>
      <div>{right}</div>
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="card p-12 text-center">
      <div className="text-2xl mb-2">🥒</div>
      <div className="text-lg font-semibold text-pickle-900">{title}</div>
      {description && <div className="text-sm text-pickle-700 mt-1">{description}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
