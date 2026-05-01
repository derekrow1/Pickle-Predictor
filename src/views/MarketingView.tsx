import { useMemo, useState } from "react";
import { useStore } from "../store/store";
import { fmtMoney, fmtDate, fmtDateShort, ISO, eachWeekStart, weekStart, uid, parseAnyDate } from "../lib/util";
import { PageHeader } from "../components/Layout";
import { EVENT_TYPES, PLATFORM_OPTIONS } from "../lib/constants";

export function MarketingView() {
  const state = useStore();
  const upsertAd = useStore((s) => s.upsertAdSpend);
  const removeAd = useStore((s) => s.removeAdSpend);
  const upsertEvent = useStore((s) => s.upsertEvent);
  const removeEvent = useStore((s) => s.removeEvent);

  const startDate = useMemo(() => weekStart(new Date()), []);
  const weeks = useMemo(() => eachWeekStart(new Date(startDate.getFullYear(), startDate.getMonth() - 1, 1), 16), [startDate]);
  const platforms = useMemo(() => {
    const set = new Set<string>(PLATFORM_OPTIONS);
    for (const a of state.adSpend) set.add(a.platform);
    return [...set];
  }, [state.adSpend]);

  const [newPlatform, setNewPlatform] = useState("");

  return (
    <>
      <PageHeader title="Marketing Calendar" subtitle="Ad spend and demand-impact events" />

      <div className="card p-4 mb-6">
        <div className="flex justify-between items-center mb-2">
          <div className="text-sm font-semibold">Weekly ad spend by platform</div>
          <div className="flex gap-2 items-center">
            <input
              className="input"
              placeholder="Add platform (e.g. Google)"
              value={newPlatform}
              onChange={(e) => setNewPlatform(e.target.value)}
            />
            <button
              className="btn-secondary"
              onClick={() => {
                if (!newPlatform.trim()) return;
                // Add a 0-amount entry to register the platform
                upsertAd({ weekStart: ISO(weeks[0]), platform: newPlatform.trim(), amount: 0 });
                setNewPlatform("");
              }}
            >
              Add Platform
            </button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="text-sm">
            <thead>
              <tr>
                <th className="bg-pickle-50">Platform</th>
                {weeks.map((w) => (
                  <th key={ISO(w)} className="bg-pickle-50 text-right text-[10px]">
                    {fmtDateShort(ISO(w))}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {platforms.map((p) => (
                <tr key={p}>
                  <td className="font-semibold whitespace-nowrap">{p}</td>
                  {weeks.map((w) => {
                    const iso = ISO(w);
                    const entry = state.adSpend.find(
                      (x) => x.weekStart === iso && x.platform === p,
                    );
                    return (
                      <td key={iso} className="px-1 py-1">
                        <input
                          type="number"
                          className="input text-right w-20"
                          value={entry?.amount ?? ""}
                          placeholder="0"
                          onChange={(e) => {
                            const val = e.target.value === "" ? 0 : parseFloat(e.target.value);
                            upsertAd({ weekStart: iso, platform: p, amount: val });
                          }}
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
              <tr className="font-semibold bg-pickle-50/50">
                <td>Total</td>
                {weeks.map((w) => {
                  const iso = ISO(w);
                  const total = state.adSpend
                    .filter((x) => x.weekStart === iso)
                    .reduce((a, b) => a + b.amount, 0);
                  return (
                    <td key={iso} className="text-right">
                      {total > 0 ? fmtMoney(total) : "—"}
                    </td>
                  );
                })}
              </tr>
            </tbody>
          </table>
        </div>
        <div className="text-xs text-pickle-700 mt-2">
          Demand uplift: ${state.settings.adBaselineWeekly.toLocaleString()} weekly baseline · {(state.settings.adElasticity * 100).toFixed(1)}% extra demand per $1k above baseline.
        </div>
      </div>

      <EventEditor
        events={state.events}
        skus={state.skus}
        upsert={upsertEvent}
        remove={removeEvent}
      />
    </>
  );
}

function EventEditor({ events, skus, upsert, remove }: any) {
  const [draft, setDraft] = useState({
    date: ISO(new Date()),
    type: "Influencer",
    label: "",
    multiplier: 1.3,
    affectedSkuIds: [] as string[],
    notes: "",
  });
  return (
    <div className="card p-4">
      <div className="text-sm font-semibold mb-3">Calendar events (influencer drops, launches, promos)</div>
      <div className="grid grid-cols-6 gap-2 mb-3">
        <input
          type="date"
          className="input"
          value={draft.date}
          onChange={(e) => setDraft({ ...draft, date: e.target.value })}
        />
        <select
          className="input"
          value={draft.type}
          onChange={(e) => setDraft({ ...draft, type: e.target.value })}
        >
          {EVENT_TYPES.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
        <input
          className="input col-span-2"
          placeholder="Label (e.g. Joe Rogan post)"
          value={draft.label}
          onChange={(e) => setDraft({ ...draft, label: e.target.value })}
        />
        <input
          type="number"
          step="0.05"
          className="input"
          placeholder="Multiplier"
          value={draft.multiplier}
          onChange={(e) => setDraft({ ...draft, multiplier: parseFloat(e.target.value) || 1 })}
        />
        <button
          className="btn-primary"
          onClick={() => {
            if (!draft.label) return;
            upsert({
              id: uid("evt"),
              ...draft,
            });
            setDraft({ ...draft, label: "", multiplier: 1.3 });
          }}
        >
          Add
        </button>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr>
            <th>Date</th><th>Type</th><th>Label</th><th className="text-right">×</th><th>SKUs</th><th></th>
          </tr>
        </thead>
        <tbody>
          {events.length === 0 && (
            <tr><td colSpan={6} className="text-center text-pickle-700 py-4">No events scheduled</td></tr>
          )}
          {events
            .slice()
            .sort((a: any, b: any) => a.date.localeCompare(b.date))
            .map((e: any) => (
              <tr key={e.id}>
                <td>{fmtDate(e.date)}</td>
                <td>{e.type}</td>
                <td>{e.label}</td>
                <td className="text-right">{e.multiplier.toFixed(2)}</td>
                <td>{e.affectedSkuIds?.length ? e.affectedSkuIds.join(", ") : "All"}</td>
                <td><button className="text-xs text-red-600" onClick={() => remove(e.id)}>delete</button></td>
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  );
}
