import { fmtNum } from "../lib/util";

interface StockBarProps {
  onHand: number;
  onOrder: number;
  width?: number; // px
}

/** Tiny horizontal stacked bar showing on-hand vs on-order. */
export function StockBar({ onHand, onOrder, width = 80 }: StockBarProps) {
  const total = Math.max(0, onHand) + Math.max(0, onOrder);
  if (total <= 0) {
    return <div className="h-1.5 rounded bg-pickle-100 mt-1" style={{ width }} />;
  }
  const onHandPct = (Math.max(0, onHand) / total) * 100;
  return (
    <div
      className="flex h-1.5 mt-1 rounded overflow-hidden bg-pickle-100 ml-auto"
      style={{ width }}
      title={`${fmtNum(onHand)} on hand · ${fmtNum(onOrder)} on order`}
    >
      <div className="bg-pickle-600" style={{ width: `${onHandPct}%` }} />
      {onOrder > 0 && (
        <div className="bg-sky-400" style={{ width: `${100 - onHandPct}%` }} />
      )}
    </div>
  );
}

/** Small legend for the bar — drop into a toolbar above tables that use StockBar. */
export function StockBarLegend() {
  return (
    <div className="flex items-center gap-3 text-xs text-pickle-700">
      <div className="flex items-center gap-1">
        <span className="inline-block w-3 h-1.5 rounded bg-pickle-600" />
        <span>On hand</span>
      </div>
      <div className="flex items-center gap-1">
        <span className="inline-block w-3 h-1.5 rounded bg-sky-400" />
        <span>On order</span>
      </div>
    </div>
  );
}
