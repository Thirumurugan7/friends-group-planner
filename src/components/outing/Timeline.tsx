// src/components/outing/Timeline.tsx
import type { Stop } from "@/lib/engine/types";
import { localHHMM } from "@/lib/time";
import { KIND_ICON } from "./labels";

export default function Timeline({ stops, onShowtime }: { stops: Stop[]; onShowtime?: (index: number) => void }) {
  return (
    <ol className="space-y-3">
      {stops.map((s, i) => (
        <li key={`${s.venue.id}-${i}`} className="flex gap-3">
          <span className="w-12 shrink-0 pt-0.5 font-mono text-sm text-amber">{localHHMM(new Date(s.startsAt))}</span>
          <span className="min-w-0 flex-1">
            <span className="block truncate">{KIND_ICON[s.slot.kind]} {s.venue.name}</span>
            <span className="block text-xs text-cream-faint">
              {s.slot.vibe}{s.venue.rating ? ` · ★ ${s.venue.rating.toFixed(1)}` : ""} · until {localHHMM(new Date(s.endsAt))}
            </span>
            {s.film && <span className="block text-xs text-cream-dim">🎞 {s.film.title} ({s.film.genres.slice(0, 2).join(", ")})</span>}
            {s.slot.kind === "cinema" && onShowtime && (
              <button className="mt-1 min-h-11 text-xs text-amber" onClick={() => onShowtime(i)}>Set show time</button>
            )}
          </span>
        </li>
      ))}
    </ol>
  );
}
