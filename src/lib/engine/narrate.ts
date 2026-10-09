import { z } from "zod";
import type { LlmProvider } from "@/lib/providers/types";
import { localHHMM } from "@/lib/time";
import type { Attendee, CostLine, HomeByEntry, Narrative, Stop, Theme } from "./types";

const bullets = z.array(z.string().min(1).max(140)).min(1).max(3);
export const NarrativeSchema = z.object({
  summary: z.string().min(1).max(500),
  swot: z.object({ strengths: bullets, weaknesses: bullets, opportunities: bullets, threats: bullets }),
});

const SYSTEM = `You write a short, friendly summary and SWOT for a group day-out plan.
Use only the facts given. Do not invent venues, prices, times, or distances.
Return ONLY JSON: {"summary": string, "swot": {"strengths": [..], "weaknesses": [..], "opportunities": [..], "threats": [..]}}
Each list has 1-3 short bullets.`;

export async function narrate(
  llm: LlmProvider,
  facts: { theme: Theme; stops: Stop[]; attendees: Attendee[]; homeByReport: HomeByEntry[]; costs: CostLine[] }
): Promise<Narrative | null> {
  const name = (id: string) => facts.attendees.find((a) => a.id === id)?.name.split(" ")[0] ?? "someone";
  const lines = [
    `Theme: ${facts.theme}`,
    "Stops:",
    ...facts.stops.map(
      (s) =>
        `- ${localHHMM(new Date(s.startsAt))}–${localHHMM(new Date(s.endsAt))} ${s.venue.name} (${s.slot.kind}` +
        `${s.venue.rating ? `, rated ${s.venue.rating}` : ""}${s.film ? `, film: ${s.film.title}` : ""})`
    ),
    "Home-by:",
    ...facts.homeByReport.map(
      (h) => `- ${name(h.attendeeId)}: home ${localHHMM(new Date(h.arriveHomeAt))}${h.deadline ? ` (needs ${h.deadline})` : ""}${h.ok ? "" : ` PROBLEM: ${h.reason}`}`
    ),
    `Average cost per person: ₹${Math.round(facts.costs.reduce((s, c) => s + c.total, 0) / Math.max(1, facts.costs.length) / 100)}`,
  ];
  try {
    return await llm.json({ task: "narrate", system: SYSTEM, user: lines.join("\n"), schema: NarrativeSchema });
  } catch (err) {
    console.warn("[engine] narrate failed", err);
    return null;
  }
}
