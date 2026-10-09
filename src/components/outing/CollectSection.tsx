"use client";

import { useState } from "react";
import { Button } from "@/components/Button";
import { api, type OutingView } from "@/lib/api";
import type { Act } from "./OutingScreen";
import { prettyDate } from "./labels";

export default function CollectSection({ view, act }: { view: OutingView; act: Act }) {
  const { outing, me, dates, members } = view;
  const [free, setFree] = useState<string[]>(me.freeDates);
  const [saved, setSaved] = useState(false);
  const byDate = [...dates].sort((a, b) => a.date.localeCompare(b.date));
  const name = (id: string) => members.find((m) => m.id === id)?.name.split(" ")[0] ?? "?";

  return (
    <div className="space-y-8">
      <section>
        <h2 className="mb-3 font-display text-lg">When are you free?</h2>
        <div className="grid grid-cols-3 gap-2">
          {byDate.map((d) => {
            const on = free.includes(d.date);
            return (
              <button key={d.date} type="button" aria-label={`Free on ${d.date}`} aria-pressed={on}
                onClick={() => { setSaved(false); setFree(on ? free.filter((x) => x !== d.date) : [...free, d.date]); }}
                className={`min-h-14 rounded-2xl border text-sm ${on ? "border-amber bg-amber/15 text-amber" : "border-line text-cream-dim"}`}>
                {prettyDate(d.date)}
              </button>
            );
          })}
        </div>
        <Button className="mt-3 w-full" onClick={async () => { if (await act(() => api.setAvailability(outing.id, free))) setSaved(true); }}>
          Save my dates
        </Button>
        {saved && <p role="status" className="mt-2 text-sm text-line-lime">Saved.</p>}
      </section>

      <section>
        <h2 className="mb-3 font-display text-lg">Best days so far</h2>
        <ul className="space-y-2">
          {dates.filter((d) => d.freeCount > 0).slice(0, 5).map((d) => (
            <li key={d.date} className="flex min-h-14 items-center justify-between gap-3 rounded-2xl bg-surface px-4">
              <span>
                <span className="block">{prettyDate(d.date)}</span>
                <span className="text-xs text-cream-faint">{d.freeCount} free · {d.freeUserIds.map(name).join(", ")}</span>
              </span>
              {me.canManage && (
                <Button size="sm" variant={outing.date === d.date ? "primary" : "outline"} aria-label={`Pick ${d.date}`}
                  onClick={() => act(() => api.confirmDate(outing.id, d.date))}>
                  {outing.date === d.date ? "Picked" : "Pick"}
                </Button>
              )}
            </li>
          ))}
        </ul>
        {dates.every((d) => d.freeCount === 0) && <p className="text-sm text-cream-dim">Nobody has marked dates yet.</p>}
      </section>

      {outing.date && (
        <section className="rounded-[var(--radius-card)] border border-amber/40 p-4">
          <p className="mb-3">Going with <strong>{prettyDate(outing.date)}</strong>.</p>
          {me.canManage ? (
            <Button size="lg" className="w-full" onClick={() => act(() => api.generate(outing.id))}>Generate plans</Button>
          ) : (
            <p className="text-sm text-cream-dim">Waiting for the organiser to generate plans.</p>
          )}
        </section>
      )}
    </div>
  );
}
