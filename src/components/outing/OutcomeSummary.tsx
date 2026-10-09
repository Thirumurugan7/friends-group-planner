// src/components/outing/OutcomeSummary.tsx
import type { OutingView } from "@/lib/api";
import StatusChip from "@/components/shell/StatusChip";

export default function OutcomeSummary({ view }: { view: OutingView }) {
  const { outing, members, checkIns, rsvps } = view;
  const name = (id: string) => members.find((m) => m.id === id)?.name ?? "Someone";
  const came = checkIns.filter((c) => c.attended).map((c) => name(c.userId));
  const dropped = rsvps.filter((r) => r.status === "cancelled");

  return (
    <section className="space-y-3 rounded-[var(--radius-card)] border border-line p-4">
      <StatusChip status={outing.status} />
      {outing.status === "cancelled" && outing.cancelReason && <p className="text-sm text-cream-dim">Reason: {outing.cancelReason}</p>}
      {came.length > 0 && <p className="text-sm">Came: {came.join(", ")}</p>}
      {dropped.length > 0 && (
        <ul className="text-sm text-cream-dim">
          {dropped.map((d) => (
            <li key={d.userId}>
              {name(d.userId)} dropped out{d.cancelledAt ? ` on ${new Date(d.cancelledAt).toLocaleDateString("en-IN")}` : ""}
              {d.cancelReason ? ` — ${d.cancelReason}` : ""}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
