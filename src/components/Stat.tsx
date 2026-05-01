import clsx from "clsx";

export function Stat({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "default" | "good" | "warn" | "bad";
}) {
  const toneCls = {
    default: "text-pickle-900",
    good: "text-pickle-700",
    warn: "text-amber-700",
    bad: "text-red-700",
  }[tone];
  return (
    <div className="card p-4">
      <div className="label">{label}</div>
      <div className={clsx("text-2xl font-bold mt-1", toneCls)}>{value}</div>
      {hint && <div className="text-xs text-pickle-700 mt-1">{hint}</div>}
    </div>
  );
}
