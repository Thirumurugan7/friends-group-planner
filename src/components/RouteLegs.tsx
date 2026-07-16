"use client";

import Avatar from "@/components/Avatar";
import { formatDistance, formatDuration } from "@/lib/format";
import type { Member, RouteLeg } from "@/lib/types";

interface Props {
  members: Member[];
  legs: RouteLeg[];
  activeMemberId?: string | null;
  onHover?: (id: string | null) => void;
}

/** Per-person travel breakdown, each row keyed to the member's line color. */
export default function RouteLegs({ members, legs, activeMemberId, onHover }: Props) {
  const byId = new Map(members.map((m) => [m.id, m]));
  const longest = Math.max(...legs.map((l) => l.durationMin));

  return (
    <ul className="space-y-1.5">
      {legs.map((leg) => {
        const m = byId.get(leg.memberId);
        if (!m) return null;
        const dim = activeMemberId && activeMemberId !== m.id;
        const worst = leg.durationMin === longest;
        return (
          <li
            key={leg.memberId}
            onMouseEnter={() => onHover?.(m.id)}
            onMouseLeave={() => onHover?.(null)}
            className="flex items-center gap-3 rounded-xl px-2 py-1.5 transition-opacity"
            style={{ opacity: dim ? 0.4 : 1 }}
          >
            <Avatar name={m.name} line={m.line} size={30} />
            <span className="w-24 shrink-0 truncate text-sm text-cream">
              {m.name.split(" ")[0]}
            </span>
            {/* travel bar */}
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-line">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${(leg.durationMin / longest) * 100}%`,
                  background: `var(--color-line-${m.line})`,
                }}
              />
            </div>
            <span
              className="w-28 shrink-0 text-right font-mono text-xs"
              style={{ color: worst ? "var(--color-line-coral)" : "var(--color-cream-dim)" }}
            >
              {formatDuration(leg.durationMin)} · {formatDistance(leg.distanceKm)}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
