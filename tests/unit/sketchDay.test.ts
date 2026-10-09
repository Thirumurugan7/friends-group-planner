import { describe, it, expect } from "vitest";
import { sketchDay, sanitizeSlots } from "@/lib/engine/sketchDay";
import { FakeLlm } from "@/lib/providers/fake";
import type { Attendee, Slot } from "@/lib/engine/types";
import type { LlmProvider } from "@/lib/providers/types";

const att = (o: Partial<Attendee> = {}): Attendee => ({
  id: "a", name: "A", home: { lat: 12.97, lng: 77.64 }, homeLabel: "Indiranagar",
  transport: "public", interests: ["coffee"], openness: 3, deadline: null, ...o,
});
const s = (startTime: string, durationMin: number, kind: Slot["kind"] = "cafe"): Slot => ({ startTime, durationMin, kind, vibe: "x" });

describe("sanitizeSlots", () => {
  it("sorts, drops early starts and overlaps", () => {
    const out = sanitizeSlots([s("13:00", 60), s("06:00", 60), s("10:00", 120), s("11:30", 60)], null);
    expect(out.map((x) => x.startTime)).toEqual(["10:00", "13:00"]);
  });
  it("drops slots ending within an hour of the earliest deadline", () => {
    const out = sanitizeSlots([s("10:00", 60), s("20:00", 150)], "22:00");
    expect(out.map((x) => x.startTime)).toEqual(["10:00"]);
  });
});

describe("sketchDay", () => {
  it("uses the LLM sketch for the theme", async () => {
    const r = await sketchDay(new FakeLlm(), { theme: "foodie", date: "2026-10-18", attendees: [att()] });
    expect(r.usedTemplate).toBe(false);
    expect(r.slots[0].kind).toBe("cafe");
  });

  it("falls back to the template when the LLM fails", async () => {
    const r = await sketchDay(new FakeLlm({ failSketch: true }), { theme: "adventurous", date: "2026-10-18", attendees: [att()] });
    expect(r.usedTemplate).toBe(true);
    expect(r.slots[0].kind).toBe("beach");
  });

  it("falls back when fewer than 2 slots survive sanitizing", async () => {
    const llm: LlmProvider = {
      json: async (req) => req.schema.parse({ slots: [s("06:00", 60), s("06:30", 60), s("06:45", 60)] }),
    };
    const r = await sketchDay(llm, { theme: "relaxed", date: "2026-10-18", attendees: [att()] });
    expect(r.usedTemplate).toBe(true);
  });

  it("puts the theme and earliest deadline in the prompt", async () => {
    let seen = "";
    const llm: LlmProvider = { json: async (req) => { seen = req.user; throw new Error("x"); } };
    await sketchDay(llm, { theme: "relaxed", date: "2026-10-18", attendees: [att({ deadline: "22:30" })] });
    expect(seen).toContain("Theme: relaxed");
    expect(seen).toContain("22:30");
  });
});
