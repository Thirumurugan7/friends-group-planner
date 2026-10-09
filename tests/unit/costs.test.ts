import { describe, it, expect } from "vitest";
import { estimateCosts } from "@/lib/engine/costs";
import type { Attendee, Leg, Stop } from "@/lib/engine/types";

const att = (id: string, transport: "public" | "own"): Attendee => ({
  id, name: id, home: { lat: 0, lng: 0 }, homeLabel: id, transport, interests: [], openness: 3, deadline: null,
});
const stop = (kind: Stop["slot"]["kind"], priceLevel: 1 | 2 | 3 | 4 | null): Stop => ({
  slot: { startTime: "10:00", durationMin: 60, kind, vibe: "" },
  venue: { id: kind, name: kind, lat: 0, lng: 0, kind, rating: null, priceLevel, opening: null, address: null, source: "fake" },
  film: null, startsAt: "", endsAt: "",
});
const leg = (attendeeId: string, km: number): Leg => ({
  attendeeId, from: "home", to: 0, mode: "public", departAt: "", arriveAt: "",
  route: { distanceM: km * 1000, durationS: 1, approximate: false, noService: false, geometry: null },
});

describe("estimateCosts", () => {
  it("adds entry, food, and travel per person in paise", () => {
    const stops = [stop("cafe", 2), stop("cinema", null)];
    const legs = [leg("a", 5), leg("a", 5), leg("a", 5), leg("b", 5), leg("b", 5), leg("b", 5)];
    const [a, b] = estimateCosts({ stops, legs, attendees: [att("a", "public"), att("b", "own")] });
    expect(a).toEqual({ attendeeId: "a", entry: 25000, food: 17500, travel: 5300, total: 47800 });
    expect(b.travel).toBe(10500);
    expect(b.total).toBe(25000 + 17500 + 10500);
  });

  it("defaults street food to the cheapest level", () => {
    const [a] = estimateCosts({ stops: [stop("street_food", null)], legs: [], attendees: [att("a", "public")] });
    expect(a.food).toBe(15000);
  });
});
