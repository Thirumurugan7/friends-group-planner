import { describe, it, expect, beforeEach } from "vitest";
import { generateOption, recalculateOption, NoVenuesError } from "@/lib/engine/generate";
import { fakeProviders, FakePlaces, FakeRoutes, FakeLlm } from "@/lib/providers/fake";
import { SLOT_KINDS, type Attendee, type ProgressStep } from "@/lib/engine/types";
import { resetDb } from "../helpers/db";

const att = (id: string, lat: number, lng: number, o: Partial<Attendee> = {}): Attendee => ({
  id, name: id, home: { lat, lng }, homeLabel: id, transport: "public",
  interests: ["coffee", "movies"], openness: 4, deadline: null, ...o,
});
const group = [att("a", 12.90, 77.60), att("b", 13.00, 77.65)];
const date = "2026-10-18";

describe("generateOption", () => {
  beforeEach(resetDb);

  it("produces stops, routes, costs, home-by, and narrative with progress", async () => {
    const steps: ProgressStep[] = [];
    const r = await generateOption({ providers: fakeProviders(), attendees: group, date, theme: "relaxed", onProgress: (s) => void steps.push(s) });
    expect(r.stops.length).toBeGreaterThanOrEqual(2);
    expect(r.routes).toHaveLength(group.length * (r.stops.length + 1));
    expect(r.costs.map((c) => c.attendeeId)).toEqual(["a", "b"]);
    expect(r.homeByReport.every((h) => h.ok)).toBe(true);
    expect(r.narrative).not.toBeNull();
    expect(steps).toEqual(["sketching", "finding_venues", "routing", "checking_home", "costing", "writing"]);
    expect(new Set(r.stops.map((s) => s.venue.id)).size).toBe(r.stops.length);
  });

  it("substitutes a related kind when a kind has no venues", async () => {
    const providers = fakeProviders({ places: new FakePlaces({ emptyKinds: ["beach"] }) });
    const r = await generateOption({ providers, attendees: group, date, theme: "adventurous" });
    expect(r.stops[0].slot.kind).toBe("park");
  });

  it("throws NoVenuesError when nothing at all is found", async () => {
    const providers = fakeProviders({ places: new FakePlaces({ emptyKinds: [...SLOT_KINDS] }) });
    await expect(generateOption({ providers, attendees: group, date, theme: "relaxed" })).rejects.toBeInstanceOf(NoVenuesError);
  });

  it("repairs a plan that would get someone home late", async () => {
    const providers = fakeProviders({ routes: new FakeRoutes({ slowFactor: 4 }) });
    const attendees = [att("a", 12.90, 77.60, { deadline: "21:00" }), att("b", 13.00, 77.65)];
    const r = await generateOption({ providers, attendees, date, theme: "relaxed" });
    expect(r.stops.map((s) => s.slot.kind)).not.toContain("cinema");
    expect(r.homeByReport.every((h) => h.ok)).toBe(true);
  });

  it("keeps the option without a narrative when narration fails", async () => {
    const r = await generateOption({ providers: fakeProviders({ llm: new FakeLlm({ failNarrate: true }) }), attendees: group, date, theme: "foodie" });
    expect(r.narrative).toBeNull();
    expect(r.stops.length).toBeGreaterThan(0);
  });

  it("recalculates for a smaller group without changing stops", async () => {
    const first = await generateOption({ providers: fakeProviders(), attendees: group, date, theme: "relaxed" });
    const re = await recalculateOption({ providers: fakeProviders(), stops: first.stops, attendees: [group[0]], date, theme: "relaxed" });
    expect(new Set(re.routes.map((l) => l.attendeeId))).toEqual(new Set(["a"]));
    expect(re.costs).toHaveLength(1);
  });
});
