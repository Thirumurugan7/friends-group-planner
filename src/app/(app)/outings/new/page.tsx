// src/app/(app)/outings/new/page.tsx
"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/Button";
import { api } from "@/lib/api";
import { localDate } from "@/lib/time";

const input = "min-h-12 w-full rounded-2xl border border-line bg-surface px-4 outline-none focus:border-amber";
const label = "mb-2 block font-mono text-xs uppercase tracking-widest text-cream-faint";

function NewOuting() {
  const router = useRouter();
  const groupId = useSearchParams().get("group") ?? "";
  const today = localDate(new Date());
  const [title, setTitle] = useState("");
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [useHomeBy, setUseHomeBy] = useState(false);
  const [homeBy, setHomeBy] = useState("22:30");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await api.createOuting(groupId, { title, rangeStart: from, rangeEnd: to, groupHomeBy: useHomeBy ? homeBy : null });
      router.replace(`/outings/${r.outing.id}`);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <h1 className="font-display text-2xl">Plan an outing</h1>
      <label className="block"><span className={label}>Outing name</span>
        <input aria-label="Outing name" className={input} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Beach day" />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="block"><span className={label}>From</span>
          <input aria-label="From" type="date" min={today} className={input} value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label className="block"><span className={label}>To</span>
          <input aria-label="To" type="date" min={from} className={input} value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
      </div>
      <p className="text-xs text-cream-faint">Up to 14 days. Everyone marks which of these days they&apos;re free.</p>
      <label className="flex min-h-11 items-center gap-3 text-sm text-cream-dim">
        <input type="checkbox" aria-label="Set a group home-by time" checked={useHomeBy} onChange={(e) => setUseHomeBy(e.target.checked)} className="size-5 accent-amber" />
        Set a group home-by time
      </label>
      {useHomeBy && (
        <label className="block"><span className={label}>Group home by</span>
          <input aria-label="Group home by" type="time" className={input} value={homeBy} onChange={(e) => setHomeBy(e.target.value)} />
        </label>
      )}
      {error && <p role="alert" className="text-sm text-line-coral">{error}</p>}
      <Button type="submit" size="lg" className="w-full" disabled={busy || !title.trim() || !groupId}>Create outing</Button>
    </form>
  );
}

export default function NewOutingPage() {
  return <Suspense><NewOuting /></Suspense>;
}
