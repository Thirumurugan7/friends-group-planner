// src/components/outing/CheckInCard.tsx
"use client";

import { Button } from "@/components/Button";
import { api, type OutingView } from "@/lib/api";
import type { Act } from "./OutingScreen";

export default function CheckInCard({ view, act }: { view: OutingView; act: Act }) {
  if (view.me.checkIn !== null) {
    return <p className="rounded-2xl bg-surface px-4 py-3 text-sm text-cream-dim">Thanks — you said you {view.me.checkIn ? "went" : "didn't go"}.</p>;
  }
  return (
    <section className="rounded-[var(--radius-card)] border border-amber/50 p-4">
      <h2 className="mb-3 font-display text-lg">Did you go?</h2>
      <div className="grid grid-cols-2 gap-2">
        <Button onClick={() => act(() => api.checkin(view.outing.id, true))}>Yes, I went</Button>
        <Button variant="outline" onClick={() => act(() => api.checkin(view.outing.id, false))}>No, I didn&apos;t</Button>
      </div>
    </section>
  );
}
