"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import Avatar from "@/components/Avatar";
import { Button, ButtonLink } from "@/components/Button";
import BottomSheet from "@/components/shell/BottomSheet";
import StatusChip from "@/components/shell/StatusChip";
import AreaMap from "./AreaMap";
import { api, ApiError, type GroupDetail } from "@/lib/api";
import { lineFor } from "@/lib/lines";

export default function GroupHome({ groupId }: { groupId: string }) {
  const [data, setData] = useState<GroupDetail | null>(null);
  const [missing, setMissing] = useState(false);
  const [removing, setRemoving] = useState<{ id: string; name: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(() => {
    api.group(groupId).then(setData).catch((err) => {
      if (err instanceof ApiError && err.status === 404) setMissing(true);
    });
  }, [groupId]);
  useEffect(load, [load]);

  if (missing) return <p className="mt-10 text-center text-cream-dim">Group not found.</p>;
  if (!data) return <div className="h-40 animate-pulse rounded-[var(--radius-card)] bg-surface" />;

  const { group, outings } = data;
  const isAdmin = group.myRole === "admin";
  const path = `/join/${group.inviteCode}`;
  const points = group.members.flatMap((m, i) =>
    m.homeArea ? [{ id: m.id, name: m.name, lat: m.homeArea.lat, lng: m.homeArea.lng, line: lineFor(i) }] : []
  );

  async function share() {
    const url = `${window.location.origin}${path}`;
    if (navigator.share) {
      await navigator.share({ title: `Join ${group.name} on Waypoint`, url }).catch(() => {});
    } else {
      await navigator.clipboard?.writeText(url).catch(() => {});
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    }
  }

  return (
    <>
      <header className="mb-4">
        <Link href="/groups" className="text-sm text-cream-faint">← Groups</Link>
        <h1 className="mt-2 font-display text-2xl">{group.name}</h1>
      </header>

      {points.length > 0 && <AreaMap points={points} />}

      <section className="mt-4 flex gap-2" data-testid="invite-link" data-path={path}>
        <Button variant="outline" size="sm" onClick={share}>{copied ? "Link copied" : "Share invite"}</Button>
        {isAdmin && (
          <Button variant="ghost" size="sm" onClick={async () => { await api.rotateInvite(group.id); load(); }}>New invite link</Button>
        )}
      </section>

      <section className="mt-6">
        <h2 className="mb-3 font-mono text-xs uppercase tracking-widest text-cream-faint">Members · {group.members.length}</h2>
        <ul className="space-y-2">
          {group.members.map((m, i) => (
            <li key={m.id} className="flex min-h-14 items-center gap-3 rounded-2xl bg-surface px-3">
              <Avatar name={m.name} line={lineFor(i)} size={36} />
              <div className="min-w-0 flex-1">
                <p className="truncate">{m.name}{m.role === "admin" && <span className="ml-2 font-mono text-[11px] text-amber">admin</span>}</p>
                <p className="truncate text-xs text-cream-faint">
                  {m.profileComplete ? `${m.homeLabel} · ${m.transport === "public" ? "public transport" : "own vehicle"}` : "Missing details"}
                </p>
              </div>
              {isAdmin && m.role !== "admin" && (
                <button className="min-h-11 px-2 text-xs text-line-coral" aria-label={`Remove ${m.name}`} onClick={() => setRemoving({ id: m.id, name: m.name })}>
                  Remove
                </button>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-8">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-mono text-xs uppercase tracking-widest text-cream-faint">Outings</h2>
          <ButtonLink href={`/outings/new?group=${group.id}`} size="sm">Plan an outing</ButtonLink>
        </div>
        {outings.length === 0 && <p className="text-sm text-cream-dim">No outings yet.</p>}
        <ul className="space-y-2">
          {outings.map((o) => (
            <li key={o.id}>
              <Link href={`/outings/${o.id}`} className="flex min-h-14 items-center justify-between gap-3 rounded-2xl border border-line px-3">
                <span className="min-w-0">
                  <span className="block truncate">{o.title}</span>
                  <span className="text-xs text-cream-faint">{o.date ?? `${o.rangeStart} → ${o.rangeEnd}`}</span>
                </span>
                <StatusChip status={o.status} />
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <BottomSheet open={!!removing} onClose={() => setRemoving(null)} title={`Remove ${removing?.name ?? ""}?`}>
        <p className="mb-4 text-sm text-cream-dim">They lose access to this group and its outings straight away.</p>
        <Button className="w-full" onClick={async () => { await api.removeMember(group.id, removing!.id); setRemoving(null); load(); }}>Remove</Button>
      </BottomSheet>
    </>
  );
}
