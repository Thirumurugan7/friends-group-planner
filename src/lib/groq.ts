import Groq from "groq-sdk";
import type { Category } from "./types";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const MODEL = "llama-3.3-70b-versatile";

export interface AiMemberInput {
  name: string;
  homeArea: string;
  workArea: string;
  transport: "public" | "own";
  interests: string[];
  openness: number; // 1–5
}

export interface AiSwot {
  strengths: string[];
  weaknesses: string[];
  opportunities: string[];
  threats: string[];
}

export interface AiVenue {
  name: string;
  area: string;
  why: string;
  compatibility: number; // 0–100
  fairness: number; // 0–100
  swot: AiSwot;
}

export interface AiPlan {
  meetingArea: string;
  venues: AiVenue[];
}

const SYSTEM = `You are Waypoint's planner. A group of friends live and work in
different parts of the same city and want to meet somewhere fair for everyone.
Given each member's home area, work area, how they travel, their interests, and
how open they are to new places, recommend a central meeting area and three
specific venues of the requested category.

Weigh travel fairness heavily — nobody should get a badly lopsided commute.
Factor in transport mode (public transit vs own vehicle) and shared interests.

Respond ONLY with JSON matching exactly this shape:
{
  "meetingArea": string,
  "venues": [
    {
      "name": string,
      "area": string,
      "why": string,                 // one sentence, plain language
      "compatibility": number,       // 0-100, group fit
      "fairness": number,            // 0-100, how evenly travel is spread
      "swot": {
        "strengths": string[],       // 2-3 short bullets
        "weaknesses": string[],      // 1-2 short bullets
        "opportunities": string[],   // 1-2 short bullets
        "threats": string[]          // 1-2 short bullets
      }
    }
  ]
}
Return exactly 3 venues, ranked best first. No prose outside the JSON.`;

export async function generatePlan(
  members: AiMemberInput[],
  category: Category,
  city = "Bengaluru"
): Promise<AiPlan> {
  const completion = await groq.chat.completions.create({
    model: MODEL,
    temperature: 0.6,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: SYSTEM },
      {
        role: "user",
        content: JSON.stringify({ city, category, members }),
      },
    ],
  });

  const raw = completion.choices[0]?.message?.content ?? "{}";
  const parsed = JSON.parse(raw) as AiPlan;

  // Defensive clamps so a bad model response can't break the UI.
  parsed.venues = (parsed.venues ?? []).slice(0, 3).map((v) => ({
    ...v,
    compatibility: clamp(v.compatibility),
    fairness: clamp(v.fairness),
    swot: {
      strengths: v.swot?.strengths ?? [],
      weaknesses: v.swot?.weaknesses ?? [],
      opportunities: v.swot?.opportunities ?? [],
      threats: v.swot?.threats ?? [],
    },
  }));
  return parsed;
}

function clamp(n: number): number {
  if (typeof n !== "number" || Number.isNaN(n)) return 70;
  return Math.max(0, Math.min(100, Math.round(n)));
}
