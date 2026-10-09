// src/components/outing/LockedSection.tsx
"use client";

import { useState } from "react";
import { Button } from "@/components/Button";
import BottomSheet from "@/components/shell/BottomSheet";
import { api, type OutingView } from "@/lib/api";
import { formatRupees } from "@/lib/money";
import { localDate } from "@/lib/time";
import type { Act } from "./OutingScreen";
import Timeline from "./Timeline";
import HomeByList from "./HomeByList";
import RouteMap from "./RouteMap";
import CheckInCard from "./CheckInCard";
import { THEME_LABEL } from "./labels";

const field = "min-h-12 w-full rounded-2xl border border-line bg-canvas px-4 outline-none focus:border-amber";

export default function LockedSection({ view, act }: { view: OutingView; act: Act }) {
  const { outing, me, members } = view;
  const option = view.options.find((o) => o.id === outing.lockedOptionId);
  const [showtimeFor, setShowtimeFor] = useState<number | null>(null);
  const [time, setTime] = useState("18:00");
  const [leaving, setLeaving] = useState(false);
  const [reason, setReason] = useState("");
  if (!option) return null;

  const myLegs = option.routes.filter((l) => l.attendeeId === me.id);
  const legs = myLegs.length > 0 ? myLegs : option.routes.filter((l) => l.from !== "home" && l.to !== "home");
  const mine = option.costs.find((c) => c.attendeeId === me.id);
  const dayReached = outing.date !== null && localDate(new Date()) >= outing.date;
  const dropouts = view.rsvps.filter((r) => r.status === "cancelled");
  const nameOf = (id: string) => members.find((m) => m.id === id)?.name.split(" ")[0] ?? "Someone";

  return (
    <div className="space-y-6">
      <h2 className="font-display text-xl">Locked in</h2>
      <p className="-mt-4 text-sm text-cream-dim">{THEME_LABEL[option.theme]}</p>

      {me.rsvp === "going" && dayReached && <CheckInCard view={view} act={act} />}

      <RouteMap stops={option.stops} legs={legs} />
      <Timeline stops={option.stops} onShowtime={me.rsvp === "going" || me.canManage ? (i) => setShowtimeFor(i) : undefined} />

      <section>
        <h3 className="mb-2 font-mono text-xs uppercase tracking-widest text-cream-faint">Getting home</h3>
        <HomeByList report={option.homeByReport} members={members} />
      </section>

      {mine && (
        <section className="rounded-2xl bg-surface p-4 text-sm">
          <h3 className="mb-2 font-mono text-xs uppercase tracking-widest text-cream-faint">Your estimate</h3>
          <p>Tickets {formatRupees(mine.entry)} · Food {formatRupees(mine.food)} · Travel {formatRupees(mine.travel)}</p>
          <p className="mt-1 font-display text-lg">{formatRupees(mine.total)}</p>
        </section>
      )}

      {dropouts.length > 0 && (
        <ul className="space-y-1 text-sm text-cream-dim">
          {dropouts.map((d) => <li key={d.userId}>{nameOf(d.userId)} dropped out{d.cancelReason ? ` — ${d.cancelReason}` : ""}</li>)}
        </ul>
      )}

      {me.rsvp === "going" && !dayReached && (
        <Button variant="ghost" onClick={() => setLeaving(true)}>I can&apos;t make it</Button>
      )}

      <BottomSheet open={showtimeFor !== null} onClose={() => setShowtimeFor(null)} title="When's the show?">
        <label className="mb-3 block">
          <span className="mb-2 block text-sm text-cream-dim">Show time</span>
          <input aria-label="Show time" type="time" className={field} value={time} onChange={(e) => setTime(e.target.value)} />
        </label>
        <Button className="w-full" onClick={async () => { if (await act(() => api.showtime(outing.id, showtimeFor!, time))) setShowtimeFor(null); }}>
          Save show time
        </Button>
      </BottomSheet>

      <BottomSheet open={leaving} onClose={() => setLeaving(false)} title="Can't make it?">
        <label className="mb-3 block">
          <span className="mb-2 block text-sm text-cream-dim">Reason (optional)</span>
          <input aria-label="Reason (optional)" className={field} value={reason} onChange={(e) => setReason(e.target.value)} />
        </label>
        <Button className="w-full" onClick={async () => { if (await act(() => api.rsvp(outing.id, "cancelled", reason || undefined))) setLeaving(false); }}>
          Cancel my spot
        </Button>
      </BottomSheet>
    </div>
  );
}
