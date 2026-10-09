"use client";

import { useState } from "react";
import Link from "next/link";
import ConvergenceMap from "@/components/ConvergenceMap";
import Avatar from "@/components/Avatar";
import Wordmark from "@/components/Wordmark";
import { MEETING_POINT, type DisplayMember } from "@/lib/display";
import { transportLabel } from "@/lib/format";

interface GroupView {
  id: string;
  name: string;
  inviteCode: string;
  members: DisplayMember[];
}

export default function GroupHome({ group }: { group: GroupView }) {
  const [activeMember, setActiveMember] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const incomplete = group.members.filter((m) => !m.profileComplete);

  function copyInvite() {
    const url = `waypoint.app/join/${group.inviteCode}`;
    navigator.clipboard?.writeText(url).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  return (
    <main className="flex flex-1 flex-col">
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-6 py-6">
        <Wordmark href="/groups" />
        <Link
          href="/groups"
          className="font-mono text-xs text-cream-dim hover:text-cream"
        >
          ← All groups
        </Link>
      </header>

      <div className="mx-auto w-full max-w-5xl px-6 pb-24">
        <div className="grid gap-8 lg:grid-cols-[1fr_1.1fr]">
          {/* Left: identity + map */}
          <div>
            <p className="font-mono text-xs uppercase tracking-widest text-amber">
              {group.members.length} members
            </p>
            <h1 className="mt-2 font-display text-4xl font-bold tracking-tight">
              {group.name}
            </h1>

            <div className="mt-6 rounded-[calc(var(--radius-card)+6px)] border border-line bg-surface/50 p-2">
              <ConvergenceMap
                members={group.members}
                target={MEETING_POINT}
                activeMemberId={activeMember}
                className="aspect-[4/3] bg-canvas-deep"
              />
            </div>

            {/* Invite */}
            <div className="mt-4 flex items-center justify-between gap-3 rounded-2xl border border-line bg-surface px-4 py-3">
              <div className="min-w-0">
                <p className="font-mono text-xs text-cream-faint">Invite link</p>
                <p className="truncate font-mono text-sm text-cream">
                  waypoint.app/join/{group.inviteCode}
                </p>
              </div>
              <button
                onClick={copyInvite}
                className="shrink-0 rounded-full bg-amber px-4 py-2 font-display text-sm font-medium text-canvas-deep transition-colors hover:bg-amber-deep"
              >
                {copied ? "Copied ✓" : "Copy"}
              </button>
            </div>
          </div>

          {/* Right: roster + plan */}
          <div>
            {incomplete.length > 0 && (
              <div className="mb-5 flex items-start gap-3 rounded-2xl border border-line-coral/40 bg-line-coral/10 px-4 py-3">
                <span>⏳</span>
                <p className="text-sm text-cream-dim">
                  <span className="font-medium text-cream">
                    {incomplete.map((m) => m.name.split(" ")[0]).join(", ")}
                  </span>{" "}
                  {incomplete.length === 1 ? "hasn't" : "haven't"} finished their
                  profile. Routes for them are estimated until they do.
                </p>
              </div>
            )}

            <div className="space-y-2">
              {group.members.map((m) => (
                <div
                  key={m.id}
                  onMouseEnter={() => setActiveMember(m.id)}
                  onMouseLeave={() => setActiveMember(null)}
                  className="flex items-center gap-3 rounded-2xl border border-line bg-surface/40 px-3 py-3 transition-colors hover:border-cream-faint"
                >
                  <Avatar name={m.name} line={m.line} size={42} dimmed={!m.profileComplete} />
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 font-display font-medium">
                      {m.name}
                      {!m.profileComplete && (
                        <span className="rounded-full bg-line-coral/20 px-2 py-0.5 font-mono text-[10px] uppercase text-line-coral">
                          incomplete
                        </span>
                      )}
                    </p>
                    <p className="truncate text-xs text-cream-faint">
                      {m.homeLabel} · {transportLabel(m.transport)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
