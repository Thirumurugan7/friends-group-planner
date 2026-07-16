import { LINE_HEX, initials } from "@/lib/lines";
import type { LineColor } from "@/lib/types";

interface Props {
  name: string;
  line: LineColor;
  size?: number;
  dimmed?: boolean;
}

/** A member's line-colored avatar. The ring color is their identity everywhere. */
export default function Avatar({ name, line, size = 40, dimmed }: Props) {
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full font-display font-medium"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.36,
        color: LINE_HEX[line],
        background: "var(--color-surface-2)",
        boxShadow: `inset 0 0 0 2px ${LINE_HEX[line]}`,
        opacity: dimmed ? 0.4 : 1,
      }}
      aria-hidden
    >
      {initials(name)}
    </span>
  );
}
