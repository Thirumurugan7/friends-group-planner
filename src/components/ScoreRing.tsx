interface Props {
  /** 0–100 */
  value: number;
  size?: number;
  label?: string;
  color?: string;
}

/** Circular gauge for a compatibility / fairness score. */
export default function ScoreRing({
  value,
  size = 64,
  label,
  color = "var(--color-amber)",
}: Props) {
  const stroke = 5;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - Math.max(0, Math.min(100, value)) / 100);

  return (
    <div className="inline-flex flex-col items-center gap-1">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke="var(--color-line)"
            strokeWidth={stroke}
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={color}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={offset}
            style={{ transition: "stroke-dashoffset 0.9s ease" }}
          />
        </svg>
        <span
          className="absolute inset-0 flex items-center justify-center font-mono font-bold"
          style={{ fontSize: size * 0.28 }}
        >
          {Math.round(value)}
        </span>
      </div>
      {label && (
        <span className="text-[11px] uppercase tracking-wider text-cream-faint">
          {label}
        </span>
      )}
    </div>
  );
}
