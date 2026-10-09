import { describe, it, expect } from "vitest";
import { routeAll } from "@/lib/engine/routeAll";
import { FakeRoutes } from "@/lib/providers/fake";
import type { Attendee, Stop } from "@/lib/engine/types";

const att = (id: string): Attendee => ({
  id, name: id, home: { lat: 12.9, lng: 77.6 }, homeLabel: id, transport: "own",
  interests: [], openness: 3, deadline: null,
});
const stop = (start: string, end: string, lat: number): Stop => ({
  slot: { startTime: "10:00", durationMin: 60, kind: "cafe", vibe: "" },
  venue: { id: `v${lat}`, name: "V", lat, lng: 77.62, kind: "cafe", rating: null, priceLevel: null, opening: null, address: null, source: "fake" },
  film: null, startsAt: start, endsAt: end,
});

describe("routeAll", () => {
  it("builds home→stops→home legs per attendee with correct timing", async () => {
    const stops = [
      stop("2026-10-18T04:30:00.000Z", "2026-10-18T06:00:00.000Z", 12.95),
      stop("2026-10-18T07:00:00.000Z", "2026-10-18T08:30:00.000Z", 12.96),
    ];
    const legs = await routeAll({ routes: new FakeRoutes(), stops, attendees: [att("a"), att("b")] });
    expect(legs).toHaveLength(6);
    const a = legs.filter((l) => l.attendeeId === "a");
    expect(a.map((l) => [l.from, l.to])).toEqual([["home", 0], [0, 1], [1, "home"]]);
    expect(a[0].arriveAt).toBe("2026-10-18T04:30:00.000Z");
    expect(new Date(a[0].departAt) < new Date(a[0].arriveAt)).toBe(true);
    expect(a[1].departAt).toBe("2026-10-18T06:00:00.000Z");
    expect(a[2].departAt).toBe("2026-10-18T08:30:00.000Z");
  });
});
