import { describe, it, expect } from "vitest";
import { narrate } from "@/lib/engine/narrate";
import { FakeLlm } from "@/lib/providers/fake";
import type { LlmProvider } from "@/lib/providers/types";
import type { Stop } from "@/lib/engine/types";

const stops: Stop[] = [{
  slot: { startTime: "10:00", durationMin: 60, kind: "cafe", vibe: "" },
  venue: { id: "v", name: "Third Wave Coffee", lat: 0, lng: 0, kind: "cafe", rating: 4.3, priceLevel: 2, opening: null, address: null, source: "fake" },
  film: null, startsAt: "2026-10-18T04:30:00.000Z", endsAt: "2026-10-18T05:30:00.000Z",
}];
const facts = { theme: "relaxed" as const, stops, attendees: [], homeByReport: [], costs: [] };

describe("narrate", () => {
  it("returns the validated narrative", async () => {
    expect((await narrate(new FakeLlm(), facts))?.swot.strengths.length).toBeGreaterThan(0);
  });
  it("returns null instead of throwing", async () => {
    expect(await narrate(new FakeLlm({ failNarrate: true }), facts)).toBeNull();
  });
  it("grounds the prompt in computed facts", async () => {
    let prompt = "";
    const llm: LlmProvider = { json: async (r) => { prompt = r.system + r.user; throw new Error("x"); } };
    await narrate(llm, facts);
    expect(prompt).toContain("Third Wave Coffee");
    expect(prompt).toContain("10:00");
    expect(prompt).toMatch(/only the facts/i);
  });
});
