import { describe, it, expect } from "vitest";
import { checkHomeBy, repair } from "@/lib/engine/homeBy";
import type { Attendee, Leg, Stop } from "@/lib/engine/types";

const att = (id: string, deadline: string | null): Attendee => ({
  id, name: id, home: { lat: 0, lng: 0 }, homeLabel: id, transport: "public",
  interests: [], openness: 3, deadline,
});
const homeLeg = (id: string, arriveAt: string, noService = false): Leg => ({
  attendeeId: id, from: 0, to: "home", mode: "public", departAt: arriveAt, arriveAt,
  route: { distanceM: 1, durationS: 1, approximate: false, noService, geometry: null },
});
const stop = (mins: number): Stop => ({
  slot: { startTime: "10:00", durationMin: mins, kind: "cafe", vibe: "" },
  venue: { id: "v", name: "V", lat: 0, lng: 0, kind: "cafe", rating: null, priceLevel: null, opening: null, address: null, source: "fake" },
  film: null, startsAt: "2026-10-18T04:30:00.000Z",
  endsAt: new Date(Date.parse("2026-10-18T04:30:00.000Z") + mins * 60_000).toISOString(),
});

describe("checkHomeBy", () => {
  it("flags late arrivals against the city-local deadline", () => {
    // 23:00 IST on 2026-10-18 = 17:30Z
    const r = checkHomeBy({
      date: "2026-10-18",
      attendees: [att("a", "23:00"), att("b", "23:00"), att("c", null)],
      legs: [homeLeg("a", "2026-10-18T17:29:00.000Z"), homeLeg("b", "2026-10-18T17:31:00.000Z"), homeLeg("c", "2026-10-18T20:00:00.000Z")],
    });
    expect(r.map((e) => [e.attendeeId, e.ok, e.reason])).toEqual([["a", true, null], ["b", false, "late"], ["c", true, null]]);
  });

  it("handles after-midnight deadlines as next day", () => {
    const r = checkHomeBy({
      date: "2026-10-18", attendees: [att("a", "00:30")],
      legs: [homeLeg("a", "2026-10-18T18:45:00.000Z")], // 00:15 IST next day
    });
    expect(r[0].ok).toBe(true);
  });

  it("fails when there is no transit service home", () => {
    const r = checkHomeBy({ date: "2026-10-18", attendees: [att("a", null)], legs: [homeLeg("a", "2026-10-18T10:00:00.000Z", true)] });
    expect(r[0]).toMatchObject({ ok: false, reason: "no_service" });
  });
});

describe("repair", () => {
  it("drops the last stop when there are several", () => {
    expect(repair([stop(60), stop(60), stop(60)])).toHaveLength(2);
  });
  it("shortens a lone long stop by 30 minutes", () => {
    const r = repair([stop(120)])!;
    expect(r[0].slot.durationMin).toBe(90);
    expect(r[0].endsAt).toBe("2026-10-18T06:00:00.000Z");
  });
  it("gives up on a lone short stop", () => {
    expect(repair([stop(60)])).toBeNull();
  });
});
