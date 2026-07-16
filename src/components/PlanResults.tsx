"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import ConvergenceMap from "@/components/ConvergenceMap";
import ScoreRing from "@/components/ScoreRing";
import SwotPanel from "@/components/SwotPanel";
import Avatar from "@/components/Avatar";
import Wordmark from "@/components/Wordmark";
import { Button } from "@/components/Button";
import { CATEGORIES } from "@/lib/mock";
import { MEETING_POINT, type DisplayMember } from "@/lib/display";
import { generatePlan } from "@/lib/api";
import type { Category } from "@/lib/types";
import type { AiPlan } from "@/lib/groq";

interface Props {
  groupId: string;
  groupName: string;
  category: Category;
  members: DisplayMember[];
}

export default function PlanResults({ groupId, groupName, category, members }: Props) {
  const [plan, setPlan] = useState<AiPlan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState(0);
  const started = useRef(false);

  const cat = CATEGORIES.find((c) => c.id === category)!;

  useEffect(() => {
    if (started.current) return; // guard against double-invoke in dev
    started.current = true;
    generatePlan(groupId, category)
      .then((d) => setPlan(d as AiPlan))
      .catch((e) => setError((e as Error).message));
  }, [groupId, category]);

  return (
    <main className="flex flex-1 flex-col">
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-6 py-6">
        <Wordmark href="/groups" />
        <Link
          href={`/groups/${groupId}`}
          className="font-mono text-xs text-cream-dim hover:text-cream"
        >
          ← {groupName}
        </Link>
      </header>

      <AnimatePresence mode="wait">
        {error ? (
          <ErrorState key="err" groupId={groupId} message={error} />
        ) : !plan ? (
          <GeneratingState key="loading" cat={cat.label} members={members} />
        ) : (
          <Results
            key="results"
            plan={plan}
            cat={cat}
            groupName={groupName}
            members={members}
            selected={selected}
            onSelect={setSelected}
          />
        )}
      </AnimatePresence>
    </main>
  );
}

function Results({
  plan,
  cat,
  groupName,
  members,
  selected,
  onSelect,
}: {
  plan: AiPlan;
  cat: { label: string; emoji: string };
  groupName: string;
  members: DisplayMember[];
  selected: number;
  onSelect: (i: number) => void;
}) {
  const venue = plan.venues[selected] ?? plan.venues[0];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="mx-auto w-full max-w-5xl px-6 pb-24"
    >
      <p className="font-mono text-xs uppercase tracking-widest text-amber">
        {cat.emoji} {cat.label} · meet around {plan.meetingArea}
      </p>
      <h1 className="mt-2 font-display text-3xl font-bold tracking-tight">
        The fairest picks for {groupName}
      </h1>

      <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_1.15fr]">
        {/* Ranked list */}
        <div className="space-y-3">
          {plan.venues.map((v, i) => {
            const active = i === selected;
            return (
              <button
                key={`${v.name}-${i}`}
                onClick={() => onSelect(i)}
                className={`w-full rounded-[var(--radius-card)] border p-4 text-left transition-all ${
                  active
                    ? "border-amber bg-surface"
                    : "border-line bg-surface/40 hover:border-cream-faint"
                }`}
              >
                <div className="flex items-center gap-4">
                  <span className="font-display text-2xl font-bold text-cream-faint">
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-display font-semibold">{v.name}</p>
                    <p className="truncate font-mono text-xs text-cream-faint">
                      {v.area}
                    </p>
                  </div>
                  <ScoreRing value={v.compatibility} size={48} />
                </div>
              </button>
            );
          })}
        </div>

        {/* Selected detail */}
        <AnimatePresence mode="wait">
          <motion.div
            key={selected}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
          >
            <div className="rounded-[calc(var(--radius-card)+6px)] border border-line bg-surface/50 p-2">
              <ConvergenceMap
                members={members}
                target={MEETING_POINT}
                className="aspect-[16/10] bg-canvas-deep"
              />
            </div>

            <div className="mt-5 flex items-start justify-between gap-4">
              <div>
                <h2 className="font-display text-2xl font-bold">{venue.name}</h2>
                <p className="mt-1 font-mono text-xs text-cream-faint">
                  {venue.area}
                </p>
                <p className="mt-2 text-sm text-cream-dim">{venue.why}</p>
              </div>
              <div className="flex shrink-0 gap-2">
                <ScoreRing value={venue.compatibility} label="Match" />
                <ScoreRing
                  value={venue.fairness}
                  label="Fair"
                  color="var(--color-line-teal)"
                />
              </div>
            </div>

            {/* Members — travel times land with the Maps key */}
            <div className="mt-6">
              <p className="mb-3 font-mono text-xs uppercase tracking-widest text-cream-faint">
                Coming from
              </p>
              <div className="flex flex-wrap gap-3">
                {members.map((m) => (
                  <span key={m.id} className="inline-flex items-center gap-2">
                    <Avatar name={m.name} line={m.line} size={28} />
                    <span className="text-sm text-cream-dim">
                      {m.name.split(" ")[0]}
                      <span className="text-cream-faint"> · {m.homeLabel}</span>
                    </span>
                  </span>
                ))}
              </div>
              <p className="mt-3 font-mono text-[11px] text-cream-faint">
                Per-person routes & travel times unlock once the Google Maps key
                is added.
              </p>
            </div>

            <div className="mt-8">
              <p className="mb-3 font-mono text-xs uppercase tracking-widest text-cream-faint">
                The breakdown
              </p>
              <SwotPanel swot={venue.swot} />
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

function ErrorState({ groupId, message }: { groupId: string; message: string }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center px-6 pb-24 text-center"
    >
      <p className="text-4xl">🧭</p>
      <h1 className="mt-4 font-display text-2xl font-bold">
        The planner hit a snag
      </h1>
      <p className="mt-2 text-cream-dim">{message}</p>
      <Link
        href={`/groups/${groupId}`}
        className="mt-6 rounded-full bg-amber px-6 py-3 font-display text-sm font-medium text-canvas-deep"
      >
        Back to the group
      </Link>
    </motion.div>
  );
}

function GeneratingState({
  cat,
  members,
}: {
  cat: string;
  members: DisplayMember[];
}) {
  const steps = [
    "Finding a fair meeting area",
    `Searching ${cat.toLowerCase()} spots`,
    "Weighing everyone's travel",
    "Scoring for the whole group",
  ];
  const [step, setStep] = useState(0);
  useEffect(() => {
    const t = setInterval(
      () => setStep((s) => (s + 1) % steps.length),
      700
    );
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <motion.div
      exit={{ opacity: 0 }}
      className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center px-6 pb-24 text-center"
    >
      <div className="w-full max-w-xs">
        <ConvergenceMap
          members={members}
          target={MEETING_POINT}
          className="aspect-square bg-canvas-deep"
        />
      </div>
      <div className="mt-8 space-y-2">
        {steps.map((s, i) => (
          <p
            key={s}
            className="flex items-center justify-center gap-2 font-mono text-sm"
            style={{
              color: i === step ? "var(--color-cream)" : "var(--color-cream-faint)",
            }}
          >
            <span className="text-amber">{i === step ? "•" : "·"}</span>
            {s}
          </p>
        ))}
      </div>
      <p className="mt-6 font-mono text-xs text-cream-faint">
        Asking the planner…
      </p>
    </motion.div>
  );
}
