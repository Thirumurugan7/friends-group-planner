import { describe, it, expect } from "vitest";
import { applyShowtimes } from "@/lib/outings/showtimes";
import type { Stop } from "@/lib/engine/types";

const stop: Stop = {
  slot: { startTime: "17:30", durationMin: 150, kind: "cinema", vibe: "" },
  venue: { id: "c", name: "PVR", lat: 0, lng: 0, kind: "cinema", rating: null, priceLevel: null, opening: null, address: null, source: "fake" },
  film: null, startsAt: "2026-10-18T12:00:00.000Z", endsAt: "2026-10-18T14:30:00.000Z",
};

describe("applyShowtimes", () => {
  it("moves the stop to the entered show time", () => {
    const [s] = applyShowtimes([stop], [{ stopIndex: 0, startsAt: new Date("2026-10-18T13:15:00.000Z") }]);
    expect(s.startsAt).toBe("2026-10-18T13:15:00.000Z");
    expect(s.endsAt).toBe("2026-10-18T15:45:00.000Z");
    expect(s.slot.startTime).toBe("18:45");
  });
  it("ignores overrides for missing stops", () => {
    expect(applyShowtimes([stop], [{ stopIndex: 5, startsAt: new Date() }])).toEqual([stop]);
  });
});
