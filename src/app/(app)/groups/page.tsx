"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/Button";
import BottomSheet from "@/components/shell/BottomSheet";
import { api } from "@/lib/api";

type G = Awaited<ReturnType<typeof api.groups>>["groups"][number];

export default function GroupsPage() {
  const router = useRouter();
  const [groups, setGroups] = useState<G[] | null>(null);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { api.groups().then((r) => setGroups(r.groups)).catch(() => setGroups([])); }, []);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    try {
      const r = await api.createGroup(name);
      router.push(`/groups/${r.group.id}`);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <>
      <header className="mb-6 flex items-center justify-between">
        <h1 className="font-display text-2xl">Your groups</h1>
        <Button size="sm" onClick={() => setOpen(true)}>New group</Button>
      </header>

      {groups === null && <div className="h-20 animate-pulse rounded-[var(--radius-card)] bg-surface" />}
      {groups?.length === 0 && (
        <div className="rounded-[var(--radius-card)] border border-dashed border-line p-6 text-center text-cream-dim">
          No groups yet. Start one and share the link with your friends.
        </div>
      )}
      <ul className="space-y-3">
        {groups?.map((g) => (
          <li key={g.id}>
            <Link href={`/groups/${g.id}`} className="flex min-h-16 items-center justify-between rounded-[var(--radius-card)] border border-line bg-surface px-4">
              <span className="font-display">{g.name}</span>
              <span className="font-mono text-xs text-cream-faint">{g.memberCount} · {g.role}</span>
            </Link>
          </li>
        ))}
      </ul>

      <BottomSheet open={open} onClose={() => setOpen(false)} title="New group">
        <form onSubmit={create} className="space-y-3">
          <label className="block">
            <span className="mb-2 block font-mono text-xs uppercase tracking-widest text-cream-faint">Group name</span>
            <input aria-label="Group name" className="min-h-12 w-full rounded-2xl border border-line bg-canvas px-4 outline-none focus:border-amber" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </label>
          {error && <p role="alert" className="text-sm text-line-coral">{error}</p>}
          <Button type="submit" size="lg" className="w-full" disabled={!name.trim()}>Create group</Button>
        </form>
      </BottomSheet>
    </>
  );
}
