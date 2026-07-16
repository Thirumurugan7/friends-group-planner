import type { Swot } from "@/lib/types";

const QUADRANTS: {
  key: keyof Swot;
  label: string;
  color: string;
  sign: string;
}[] = [
  { key: "strengths", label: "Strengths", color: "var(--color-line-teal)", sign: "+" },
  { key: "weaknesses", label: "Weaknesses", color: "var(--color-line-coral)", sign: "−" },
  { key: "opportunities", label: "Opportunities", color: "var(--color-amber)", sign: "↗" },
  { key: "threats", label: "Watch out", color: "var(--color-line-violet)", sign: "!" },
];

/** The Groq-written group compatibility breakdown. */
export default function SwotPanel({ swot }: { swot: Swot }) {
  return (
    <div className="grid gap-px overflow-hidden rounded-[var(--radius-card)] border border-line bg-line sm:grid-cols-2">
      {QUADRANTS.map((q) => (
        <div key={q.key} className="bg-canvas p-5">
          <p
            className="mb-3 font-mono text-xs uppercase tracking-widest"
            style={{ color: q.color }}
          >
            {q.label}
          </p>
          <ul className="space-y-2">
            {swot[q.key].map((item, i) => (
              <li key={i} className="flex gap-2 text-sm leading-relaxed text-cream-dim">
                <span style={{ color: q.color }} className="font-mono">
                  {q.sign}
                </span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
