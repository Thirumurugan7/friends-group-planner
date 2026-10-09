// src/app/(app)/outings/page.tsx
"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import StatusChip from "@/components/shell/StatusChip";
import { api, type OutingListItem } from "@/lib/api";
import { prettyDate } from "@/components/outing/labels";

const ACTIVE = ["collecting", "voting", "locked"];

export default function OutingsPage() {
  const [items, setItems] = useState<OutingListItem[] | null>(null);
  useEffect(() => { api.outings().then((r) => setItems(r.outings)).catch(() => setItems([])); }, []);

  const section = (title: string, list: OutingListItem[]) =>
    list.length > 0 && (
      <section className="mb-8">
        <h2 className="mb-3 font-mono text-xs uppercase tracking-widest text-cream-faint">{title}</h2>
        <ul className="space-y-2">
          {list.map((o) => (
            <li key={o.id}>
              <Link href={`/outings/${o.id}`} className="flex min-h-16 items-center justify-between gap-3 rounded-[var(--radius-card)] border border-line bg-surface px-4">
                <span className="min-w-0">
                  <span className="block truncate font-display">{o.title}</span>
                  <span className="text-xs text-cream-faint">{o.groupName} · {o.date ? prettyDate(o.date) : `${prettyDate(o.rangeStart)} – ${prettyDate(o.rangeEnd)}`}</span>
                </span>
                <StatusChip status={o.status} />
              </Link>
            </li>
          ))}
        </ul>
      </section>
    );

  return (
    <>
      <h1 className="mb-6 font-display text-2xl">Outings</h1>
      {items === null && <div className="h-20 animate-pulse rounded-[var(--radius-card)] bg-surface" />}
      {items?.length === 0 && <p className="text-cream-dim">No outings yet — start one from a group.</p>}
      {items && section("Coming up", items.filter((o) => ACTIVE.includes(o.status)))}
      {items && section("Past", items.filter((o) => !ACTIVE.includes(o.status)))}
    </>
  );
}
