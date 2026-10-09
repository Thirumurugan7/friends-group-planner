// src/components/outing/HomeByList.tsx
import type { HomeByEntry } from "@/lib/engine/types";
import type { PublicMember } from "@/lib/serialize";
import { localHHMM } from "@/lib/time";

export default function HomeByList({ report, members }: { report: HomeByEntry[]; members: PublicMember[] }) {
  return (
    <ul className="space-y-1.5">
      {report.map((h) => {
        const name = members.find((m) => m.id === h.attendeeId)?.name ?? "Someone";
        return (
          <li key={h.attendeeId} className="flex items-center justify-between text-sm">
            <span>{h.ok ? "✅" : "⚠️"} {name}</span>
            <span className={h.ok ? "text-cream-dim" : "text-line-coral"}>
              home {localHHMM(new Date(h.arriveHomeAt))}
              {h.deadline && ` / needs ${h.deadline}`}
              {h.reason === "no_service" && " · no transit then"}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
