// src/components/outing/VotingSection.tsx
"use client";

import { useState } from "react";
import { Button } from "@/components/Button";
import BottomSheet from "@/components/shell/BottomSheet";
import { api, ApiError, type OutingView } from "@/lib/api";
import type { Act } from "./OutingScreen";
import OptionCard from "./OptionCard";
import { THEME_LABEL } from "./labels";

const RSVP = [["going", "Going"], ["maybe", "Maybe"], ["no", "Can't go"]] as const;

export default function VotingSection({ view, act }: { view: OutingView; act: Act }) {
  const { outing, me, options, members } = view;
  const [tied, setTied] = useState<string[] | null>(null);
  const going = view.rsvps.filter((r) => r.status === "going").length;

  async function lock(optionId?: string) {
    try {
      await api.lock(outing.id, optionId);
      setTied(null);
      await act(async () => {});
    } catch (err) {
      if (err instanceof ApiError && err.status === 409 && err.data?.tiedOptionIds) setTied(err.data.tiedOptionIds);
      else await act(() => Promise.reject(err));
    }
  }

  return (
    <div className="space-y-6">
      <div className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2">
        {options.map((o) => (
          <div key={o.id} className="w-[86%] shrink-0 snap-center">
            <OptionCard option={o} members={members} myVote={me.voteOptionId === o.id}
              onVote={o.status === "ready" ? () => act(() => api.vote(outing.id, o.id)) : undefined} />
          </div>
        ))}
      </div>

      <section>
        <h2 className="mb-2 font-display text-lg">Are you in? <span className="text-sm text-cream-faint">({going} going)</span></h2>
        <div className="grid grid-cols-3 gap-2">
          {RSVP.map(([v, l]) => (
            <Button key={v} variant={me.rsvp === v ? "primary" : "outline"} aria-pressed={me.rsvp === v} onClick={() => act(() => api.rsvp(outing.id, v))}>
              {l}
            </Button>
          ))}
        </div>
      </section>

      {me.canManage && (
        <section className="flex gap-2">
          <Button className="flex-1" onClick={() => lock()}>Lock plan</Button>
          <Button variant="ghost" onClick={() => act(() => api.generate(outing.id))}>Regenerate</Button>
        </section>
      )}

      <BottomSheet open={!!tied} onClose={() => setTied(null)} title="It's a tie — pick one">
        <div className="space-y-2">
          {tied?.map((id) => {
            const label = THEME_LABEL[options.find((o) => o.id === id)?.theme ?? ""] ?? "Option";
            return <Button key={id} className="w-full" variant="outline" onClick={() => lock(id)}>Lock {label}</Button>;
          })}
        </div>
      </BottomSheet>
    </div>
  );
}
