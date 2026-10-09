import { describe, it, expect } from "vitest";
import { meetingArea } from "@/lib/engine/meetingArea";
import { estimateMinutes } from "@/lib/engine/geo";

describe("meetingArea", () => {
  it("returns the home for a single attendee", () => {
    expect(meetingArea([{ home: { lat: 12.9, lng: 77.6 }, transport: "own" }])).toEqual({ lat: 12.9, lng: 77.6 });
  });

  it("pulls toward the slower traveller instead of the plain midpoint", () => {
    const pub = { home: { lat: 12.90, lng: 77.60 }, transport: "public" as const };
    const own = { home: { lat: 13.00, lng: 77.70 }, transport: "own" as const };
    const c = meetingArea([pub, own]);
    const tPub = estimateMinutes(pub.home, c, "public");
    const tOwn = estimateMinutes(own.home, c, "own");
    expect(Math.abs(tPub - tOwn)).toBeLessThanOrEqual(6);
    expect(c.lat).toBeLessThan(12.95); // closer to the public-transport user
  });
});
