// src/components/outing/OptionCard.tsx
"use client";

import SwotPanel from "@/components/SwotPanel";
import { Button } from "@/components/Button";
import type { OutingView } from "@/lib/api";
import { formatRupees } from "@/lib/money";
import Timeline from "./Timeline";
import HomeByList from "./HomeByList";
import { PROGRESS_LABEL, THEME_LABEL } from "./labels";

type Option = OutingView["options"][number];

export default function OptionCard({
  option, members, myVote, onVote,
}: { option: Option; members: OutingView["members"]; myVote: boolean; onVote?: () => void }) {
  const label = THEME_LABEL[option.theme] ?? option.theme;
  if (option.status === "generating") {
    return (
      <article className="rounded-[var(--radius-card)] border border-line bg-surface p-4">
        <h3 className="font-display text-lg">{label}</h3>
        <p className="mt-3 animate-pulse text-sm text-cream-dim">{PROGRESS_LABEL[option.progress ?? "sketching"]}</p>
      </article>
    );
  }
  if (option.status === "failed") {
    return (
      <article className="rounded-[var(--radius-card)] border border-line-coral/50 bg-surface p-4">
        <h3 className="font-display text-lg">{label}</h3>
        <p className="mt-2 text-sm text-line-coral">{option.error}</p>
      </article>
    );
  }
  const avg = option.costs.reduce((s, c) => s + c.total, 0) / Math.max(1, option.costs.length);
  const problems = option.homeByReport.filter((h) => !h.ok).length;

  return (
    <article className={`rounded-[var(--radius-card)] border bg-surface p-4 ${myVote ? "border-amber" : "border-line"}`}>
      <header className="mb-3 flex items-start justify-between gap-2">
        <h3 className="font-display text-lg">{label}</h3>
        <span className="font-mono text-xs text-cream-faint">{option.voteCount} vote{option.voteCount === 1 ? "" : "s"}</span>
      </header>
      {option.narrative && <p className="mb-4 text-sm text-cream-dim">{option.narrative.summary}</p>}
      <Timeline stops={option.stops} />
      <dl className="mt-4 grid grid-cols-2 gap-2 text-sm">
        <div className="rounded-2xl bg-canvas p-3"><dt className="text-xs text-cream-faint">Per person</dt><dd>~{formatRupees(avg)}</dd></div>
        <div className="rounded-2xl bg-canvas p-3"><dt className="text-xs text-cream-faint">Home on time</dt><dd>{problems === 0 ? "Everyone" : `${problems} at risk`}</dd></div>
      </dl>
      {option.approximateTransit && <p className="mt-2 text-xs text-cream-faint">Public transport times are estimates.</p>}
      <details className="mt-3">
        <summary className="min-h-11 cursor-pointer py-2 text-sm text-amber">Who gets home when</summary>
        <HomeByList report={option.homeByReport} members={members} />
      </details>
      {option.narrative && (
        <details className="mt-1">
          <summary className="min-h-11 cursor-pointer py-2 text-sm text-amber">Pros and cons</summary>
          <SwotPanel swot={option.narrative.swot} />
        </details>
      )}
      {onVote && (
        <Button className="mt-4 w-full" variant={myVote ? "primary" : "outline"} aria-label={`Vote for ${label}`} aria-pressed={myVote} onClick={onVote}>
          {myVote ? "Your vote" : "Vote for this"}
        </Button>
      )}
    </article>
  );
}
