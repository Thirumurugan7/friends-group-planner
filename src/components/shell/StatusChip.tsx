const LABEL: Record<string, string> = {
  collecting: "Picking a date",
  voting: "Voting",
  locked: "Locked in",
  completed: "✅ Happened",
  failed: "❌ Didn't happen",
  cancelled: "🚫 Cancelled",
};
const TONE: Record<string, string> = {
  collecting: "border-line-sky text-line-sky",
  voting: "border-line-violet text-line-violet",
  locked: "border-amber text-amber",
  completed: "border-line-lime text-line-lime",
  failed: "border-line-coral text-line-coral",
  cancelled: "border-line text-cream-faint",
};

export default function StatusChip({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 font-mono text-[11px] ${TONE[status] ?? TONE.cancelled}`}>
      {LABEL[status] ?? status}
    </span>
  );
}
