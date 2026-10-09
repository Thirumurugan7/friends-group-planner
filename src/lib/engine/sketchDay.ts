import { z } from "zod";
import type { LlmProvider } from "@/lib/providers/types";
import { HHMM_RE, dayOrderMinutes } from "@/lib/time";
import { templateDay } from "./templates";
import { SLOT_KINDS, type Attendee, type Slot, type Theme } from "./types";

export const SketchSchema = z.object({
  slots: z
    .array(
      z.object({
        startTime: z.string().regex(HHMM_RE),
        durationMin: z.number().int().min(30).max(240),
        kind: z.enum(SLOT_KINDS),
        vibe: z.string().max(140),
      })
    )
    .min(3)
    .max(5),
});

export interface SketchContext {
  theme: Theme;
  date: string;
  attendees: Attendee[];
}

const EARLIEST_START = dayOrderMinutes("07:00");

export function sanitizeSlots(slots: Slot[], earliestDeadline: string | null): Slot[] {
  const latestEnd = earliestDeadline ? dayOrderMinutes(earliestDeadline) - 60 : Infinity;
  const sorted = [...slots].sort((a, b) => dayOrderMinutes(a.startTime) - dayOrderMinutes(b.startTime));
  const out: Slot[] = [];
  let prevEnd = -Infinity;
  for (const slot of sorted) {
    const start = dayOrderMinutes(slot.startTime);
    const end = start + slot.durationMin;
    if (start < EARLIEST_START || start < prevEnd || end > latestEnd) continue;
    out.push(slot);
    prevEnd = end;
  }
  return out;
}

function earliest(attendees: Attendee[]): string | null {
  const ds = attendees.map((a) => a.deadline).filter((d): d is string => !!d);
  if (ds.length === 0) return null;
  return ds.reduce((a, b) => (dayOrderMinutes(b) < dayOrderMinutes(a) ? b : a));
}

const SYSTEM = `You plan a day out for a group of friends in one Indian city.
Return ONLY JSON: {"slots":[{"startTime":"HH:MM","durationMin":number,"kind":string,"vibe":string}]}
- 3 to 5 slots, in time order, no overlaps, leave 30+ minutes between slots for travel.
- kind must be one of: ${SLOT_KINDS.join(", ")}.
- vibe is one short phrase (max 12 words).
- The last slot must end at least 90 minutes before the earliest home-by time, if one is given.`;

export async function sketchDay(
  llm: LlmProvider,
  ctx: SketchContext
): Promise<{ slots: Slot[]; usedTemplate: boolean }> {
  const deadline = earliest(ctx.attendees);
  const interests = [...new Set(ctx.attendees.flatMap((a) => a.interests))];
  const openness = ctx.attendees.reduce((s, a) => s + a.openness, 0) / ctx.attendees.length;
  const user = [
    `Theme: ${ctx.theme}`,
    `Date: ${ctx.date}`,
    `Group size: ${ctx.attendees.length}`,
    `Shared interests: ${interests.join(", ") || "none listed"}`,
    `Average openness to new places (1-5): ${openness.toFixed(1)}`,
    `Public transport users: ${ctx.attendees.filter((a) => a.transport === "public").length}`,
    `Earliest home-by time: ${deadline ?? "none"}`,
  ].join("\n");

  try {
    const res = await llm.json({ task: "sketch", system: SYSTEM, user, schema: SketchSchema });
    const slots = sanitizeSlots(res.slots, deadline);
    if (slots.length >= 2) return { slots, usedTemplate: false };
  } catch (err) {
    console.warn("[engine] sketch failed, using template", err);
  }
  return { slots: sanitizeSlots(templateDay(ctx.theme), deadline), usedTemplate: true };
}
