import type { LineColor } from "./types";

/** Maps a member's line color to its CSS custom property. */
export const LINE_HEX: Record<LineColor, string> = {
  teal: "var(--color-line-teal)",
  coral: "var(--color-line-coral)",
  violet: "var(--color-line-violet)",
  lime: "var(--color-line-lime)",
  sky: "var(--color-line-sky)",
  rose: "var(--color-line-rose)",
};

/** Order in which lines are assigned as members join. */
export const LINE_ORDER: LineColor[] = [
  "teal",
  "coral",
  "violet",
  "lime",
  "sky",
  "rose",
];

export function lineFor(index: number): LineColor {
  return LINE_ORDER[index % LINE_ORDER.length];
}

/** Initials for an avatar, e.g. "Aisha Khan" -> "AK". */
export function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}
