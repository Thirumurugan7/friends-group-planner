"use client";

import { useState } from "react";
import { Button } from "@/components/Button";
import LocationPicker, { type Place } from "./LocationPicker";
import { api, type SelfProfile } from "@/lib/api";

const INTERESTS = [
  "coffee", "brunch", "street food", "fine dining", "craft beer", "board games", "gaming",
  "movies", "live music", "art", "history", "photography", "nature", "sports", "shopping", "reading",
];
const GENDERS = [
  { value: "male", label: "Male" },
  { value: "female", label: "Female" },
  { value: "non_binary", label: "Non-binary" },
  { value: "prefer_not_to_say", label: "Prefer not to say" },
] as const;
type Gender = (typeof GENDERS)[number]["value"];

const input = "min-h-12 w-full rounded-2xl border border-line bg-surface px-4 outline-none placeholder:text-cream-faint focus:border-amber";
const chip = "min-h-11 rounded-full border px-4 text-sm transition-colors";

function Label({ children }: { children: React.ReactNode }) {
  return <span className="mb-2 block font-mono text-xs uppercase tracking-widest text-cream-faint">{children}</span>;
}

export default function ProfileForm({
  initial, submitLabel = "Save profile", onSaved, barClassName,
}: { initial: SelfProfile | null; submitLabel?: string; onSaved: (p: SelfProfile) => void; barClassName?: string }) {
  const [name, setName] = useState(initial?.name ?? "");
  const [email, setEmail] = useState(initial?.email ?? "");
  const [age, setAge] = useState(initial?.age ? String(initial.age) : "");
  const [gender, setGender] = useState<Gender | null>((initial?.gender as Gender) ?? null);
  const [home, setHome] = useState<Place | null>(initial?.home ?? null);
  const [work, setWork] = useState<Place | null>(initial?.work ?? null);
  const [transport, setTransport] = useState<"public" | "own">(initial?.transport ?? "public");
  const [interests, setInterests] = useState<string[]>(initial?.interests ?? []);
  const [openness, setOpenness] = useState(initial?.openness ?? 3);
  const [noHomeBy, setNoHomeBy] = useState(!initial?.homeBy);
  const [homeBy, setHomeBy] = useState(initial?.homeBy ?? "22:30");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!gender) return setError("Pick a gender option.");
    if (!home || !work) return setError("Set both your home and work areas.");
    setBusy(true);
    try {
      const { profile } = await api.saveProfile({
        name, email, age: Number(age), gender, home, work, transport, interests, openness,
        homeBy: noHomeBy ? null : homeBy,
      });
      onSaved(profile);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-6 pb-28" noValidate>
      <label className="block"><Label>Name</Label>
        <input aria-label="Name" className={input} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
      </label>
      <label className="block"><Label>Email</Label>
        <input aria-label="Email" type="email" inputMode="email" className={input} value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
      </label>
      <label className="block"><Label>Age</Label>
        <input aria-label="Age" inputMode="numeric" className={input} value={age} onChange={(e) => setAge(e.target.value.replace(/\D/g, "").slice(0, 3))} />
      </label>

      <fieldset>
        <legend className="mb-2 font-mono text-xs uppercase tracking-widest text-cream-faint">Gender</legend>
        <div className="flex flex-wrap gap-2">
          {GENDERS.map((g) => (
            <label key={g.value} className={`${chip} flex items-center ${gender === g.value ? "border-amber bg-amber text-canvas-deep" : "border-line text-cream-dim"}`}>
              <input type="radio" name="gender" className="sr-only" aria-label={g.label} checked={gender === g.value} onChange={() => setGender(g.value)} />
              {g.label}
            </label>
          ))}
        </div>
      </fieldset>

      <div><Label>Home</Label><LocationPicker which="Home" value={home} onChange={setHome} /></div>
      <div><Label>Work</Label><LocationPicker which="Work" value={work} onChange={setWork} /></div>

      <fieldset>
        <legend className="mb-2 font-mono text-xs uppercase tracking-widest text-cream-faint">How you get around</legend>
        <div className="grid grid-cols-2 gap-2">
          {([["public", "Public transport"], ["own", "Own vehicle"]] as const).map(([v, l]) => (
            <label key={v} className={`${chip} flex items-center justify-center ${transport === v ? "border-amber text-amber" : "border-line text-cream-dim"}`}>
              <input type="radio" name="transport" className="sr-only" aria-label={l} checked={transport === v} onChange={() => setTransport(v)} />
              {l}
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="mb-2 font-mono text-xs uppercase tracking-widest text-cream-faint">Interests</legend>
        <div className="flex flex-wrap gap-2">
          {INTERESTS.map((t) => {
            const on = interests.includes(t);
            return (
              <button type="button" key={t} aria-pressed={on}
                className={`${chip} ${on ? "border-amber text-amber" : "border-line text-cream-dim"}`}
                onClick={() => setInterests(on ? interests.filter((x) => x !== t) : [...interests, t])}>
                {t}
              </button>
            );
          })}
        </div>
      </fieldset>

      <label className="block"><Label>Open to new places ({openness}/5)</Label>
        <input aria-label="Openness" type="range" min={1} max={5} value={openness} onChange={(e) => setOpenness(Number(e.target.value))} className="w-full accent-amber" />
      </label>

      <div className="space-y-2">
        <Label>Home by</Label>
        <label className="flex min-h-11 items-center gap-3 text-sm text-cream-dim">
          <input type="checkbox" aria-label="No fixed home-by time" checked={noHomeBy} onChange={(e) => setNoHomeBy(e.target.checked)} className="size-5 accent-amber" />
          No fixed home-by time
        </label>
        {!noHomeBy && (
          <input aria-label="Home by" type="time" className={input} value={homeBy} onChange={(e) => setHomeBy(e.target.value)} />
        )}
        {gender === "female" && noHomeBy && (
          <p className="text-xs text-cream-faint">Plans will get you home by 23:00 unless you set your own time.</p>
        )}
      </div>

      {error && <p role="alert" className="text-sm text-line-coral">{error}</p>}

      <div className={`fixed inset-x-0 ${barClassName ?? "bottom-0"} z-20 border-t border-line bg-canvas/95 px-4 pt-3 ${barClassName ? "pb-3" : "pb-[max(0.75rem,env(safe-area-inset-bottom))]"} backdrop-blur`}>
        <Button type="submit" size="lg" className="mx-auto w-full max-w-md" disabled={busy}>{busy ? "Saving…" : submitLabel}</Button>
      </div>
    </form>
  );
}
