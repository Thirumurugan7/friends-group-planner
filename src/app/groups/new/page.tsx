"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/Button";
import Wordmark from "@/components/Wordmark";
import { api } from "@/lib/api";

export default function NewGroup() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    if (busy || !name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const { group } = await api.createGroup(name.trim());
      router.push(`/groups/${group.id}`);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <main className="flex flex-1 flex-col">
      <header className="mx-auto w-full max-w-md px-6 py-6">
        <Wordmark href="/groups" />
      </header>

      <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-6 pb-24">
        <p className="font-mono text-xs uppercase tracking-widest text-amber">
          New group
        </p>
        <h1 className="mt-2 font-display text-3xl font-bold tracking-tight">
          Name your crew
        </h1>
        <p className="mt-2 text-cream-dim">
          You&apos;ll get a link to share. Friends join, add their spot on the
          map, and you&apos;re ready to plan.
        </p>

        <label className="mt-8 block">
          <span className="mb-2 block font-mono text-xs uppercase tracking-widest text-cream-faint">
            Group name
          </span>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && create()}
            placeholder="The Usual Suspects"
            className="h-14 w-full rounded-2xl border border-line bg-surface px-4 text-lg outline-none placeholder:text-cream-faint focus:border-amber"
          />
        </label>

        {error && <p className="mt-4 text-sm text-line-coral">{error}</p>}
        <Button
          onClick={create}
          disabled={!name.trim() || busy}
          size="lg"
          className="mt-6 w-full"
        >
          {busy ? "Creating…" : "Create & get invite link"}
        </Button>
      </div>
    </main>
  );
}
