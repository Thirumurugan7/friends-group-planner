"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/Button";
import Wordmark from "@/components/Wordmark";
import { saveProfile } from "@/lib/api";
import type { TransportMode } from "@/lib/types";

const INTERESTS = [
  "coffee",
  "brunch",
  "craft beer",
  "board games",
  "gaming",
  "live music",
  "street food",
  "fine dining",
  "reading",
  "art",
  "photography",
  "sports",
];

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-2 flex items-baseline justify-between">
        <span className="font-mono text-xs uppercase tracking-widest text-cream-faint">
          {label}
        </span>
        {hint && <span className="text-xs text-cream-faint">{hint}</span>}
      </span>
      {children}
    </label>
  );
}

const inputCls =
  "h-13 w-full rounded-2xl border border-line bg-surface px-4 py-3 outline-none placeholder:text-cream-faint focus:border-amber";

export default function Onboarding() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [age, setAge] = useState("");
  const [homeLabel, setHomeLabel] = useState("");
  const [workLabel, setWorkLabel] = useState("");
  const [interests, setInterests] = useState<string[]>(["coffee", "board games"]);
  const [transport, setTransport] = useState<TransportMode>("public");
  const [openness, setOpenness] = useState(4);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSave = name.trim().length > 0 && homeLabel.trim().length > 0;

  function toggle(tag: string) {
    setInterests((s) =>
      s.includes(tag) ? s.filter((t) => t !== tag) : [...s, tag]
    );
  }

  async function save() {
    if (busy || !canSave) return;
    setBusy(true);
    setError(null);
    try {
      await saveProfile({
        name: name.trim(),
        age: age ? Number(age) : undefined,
        home: { label: homeLabel.trim() },
        work: { label: workLabel.trim() },
        transport,
        interests,
        openness,
      });
      router.push("/groups");
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <main className="flex flex-1 flex-col">
      <header className="mx-auto w-full max-w-2xl px-6 py-6">
        <Wordmark />
      </header>

      <div className="mx-auto w-full max-w-2xl px-6 pb-24">
        <p className="font-mono text-xs uppercase tracking-widest text-amber">
          Your profile
        </p>
        <h1 className="mt-2 font-display text-3xl font-bold tracking-tight">
          Tell us where you&apos;re coming from
        </h1>
        <p className="mt-2 text-cream-dim">
          This is how Waypoint keeps meetups fair. You only do it once — it
          follows you into every group.
        </p>

        <div className="mt-10 space-y-6">
          <div className="grid gap-6 sm:grid-cols-[2fr_1fr]">
            <Field label="Name">
              <input
                className={inputCls}
                placeholder="Aisha Khan"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </Field>
            <Field label="Age">
              <input
                className={inputCls}
                inputMode="numeric"
                placeholder="27"
                value={age}
                onChange={(e) => setAge(e.target.value.replace(/\D/g, ""))}
              />
            </Field>
          </div>

          <Field label="Home" hint="Drop a pin later">
            <div className={`${inputCls} flex items-center gap-3`}>
              <span className="text-amber">📍</span>
              <input
                className="flex-1 bg-transparent outline-none placeholder:text-cream-faint"
                placeholder="Search your neighborhood"
                value={homeLabel}
                onChange={(e) => setHomeLabel(e.target.value)}
              />
              <span className="font-mono text-xs text-cream-faint">Map</span>
            </div>
          </Field>

          <Field label="Work" hint="Where you commute from on weekdays">
            <div className={`${inputCls} flex items-center gap-3`}>
              <span className="text-line-sky">💼</span>
              <input
                className="flex-1 bg-transparent outline-none placeholder:text-cream-faint"
                placeholder="Search your office area"
                value={workLabel}
                onChange={(e) => setWorkLabel(e.target.value)}
              />
              <span className="font-mono text-xs text-cream-faint">Map</span>
            </div>
          </Field>

          <Field label="How you get around">
            <div className="grid grid-cols-2 gap-3">
              {(["public", "own"] as TransportMode[]).map((mode) => {
                const active = transport === mode;
                return (
                  <button
                    key={mode}
                    onClick={() => setTransport(mode)}
                    className={`flex h-16 items-center gap-3 rounded-2xl border px-4 text-left transition-colors ${
                      active
                        ? "border-amber bg-amber/10"
                        : "border-line bg-surface hover:border-cream-faint"
                    }`}
                  >
                    <span className="text-2xl">
                      {mode === "public" ? "🚇" : "🚗"}
                    </span>
                    <span>
                      <span className="block font-display font-medium">
                        {mode === "public" ? "Public transit" : "Own vehicle"}
                      </span>
                      <span className="text-xs text-cream-faint">
                        {mode === "public" ? "Metro, bus, auto" : "Car or bike"}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </Field>

          <Field label="Interests" hint={`${interests.length} selected`}>
            <div className="flex flex-wrap gap-2">
              {INTERESTS.map((tag) => {
                const active = interests.includes(tag);
                return (
                  <button
                    key={tag}
                    onClick={() => toggle(tag)}
                    className={`rounded-full border px-4 py-2 text-sm transition-colors ${
                      active
                        ? "border-amber bg-amber text-canvas-deep"
                        : "border-line text-cream-dim hover:border-cream-faint"
                    }`}
                  >
                    {tag}
                  </button>
                );
              })}
            </div>
          </Field>

          <Field label="Open to new places?" hint={`${openness} / 5`}>
            <input
              type="range"
              min={1}
              max={5}
              value={openness}
              onChange={(e) => setOpenness(Number(e.target.value))}
              className="w-full accent-[var(--color-amber)]"
            />
            <div className="mt-1 flex justify-between font-mono text-xs text-cream-faint">
              <span>Stick to favorites</span>
              <span>Try anything</span>
            </div>
          </Field>
        </div>

        {error && <p className="mt-6 text-sm text-line-coral">{error}</p>}
        <Button
          onClick={save}
          disabled={!canSave || busy}
          size="lg"
          className="mt-6 w-full"
        >
          {busy ? "Saving…" : "Save profile"}
        </Button>
        {!canSave && (
          <p className="mt-3 text-center text-xs text-cream-faint">
            Name and home are needed to keep meetups fair.
          </p>
        )}
      </div>
    </main>
  );
}
