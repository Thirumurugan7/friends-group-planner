import { describe, it, expect } from "vitest";
import { fillSlot, scoreVenue, isOpenDuring, pickFilm } from "@/lib/engine/fillSlot";
import { FakePlaces, FakeMovies } from "@/lib/providers/fake";
import type { Attendee, Venue } from "@/lib/engine/types";

const att = (id: string, lat: number, lng: number, o: Partial<Attendee> = {}): Attendee => ({
  id, name: id, home: { lat, lng }, homeLabel: id, transport: "public",
  interests: ["coffee"], openness: 3, deadline: null, ...o,
});
const venue = (o: Partial<Venue>): Venue => ({
  id: "v", name: "V", lat: 12.95, lng: 77.62, kind: "cafe", rating: 4, priceLevel: 2,
  opening: null, address: null, source: "fake", ...o,
});
const group = [att("a", 12.90, 77.60), att("b", 13.00, 77.65)];

describe("fillSlot helpers", () => {
  it("treats unknown hours as open and respects known hours", () => {
    expect(isOpenDuring(null, "10:00", 60)).toBe(true);
    expect(isOpenDuring({ open: "11:00", close: "22:00" }, "10:00", 60)).toBe(false);
    expect(isOpenDuring({ open: "08:00", close: "00:30" }, "22:00", 120)).toBe(true);
  });

  it("scores a fair, central venue above a lopsided one", () => {
    const central = venue({ lat: 12.95, lng: 77.625 });
    const lopsided = venue({ lat: 12.90, lng: 77.60 });
    expect(scoreVenue(central, group)).toBeGreaterThan(scoreVenue(lopsided, group));
  });

  it("rewards interest match", () => {
    const coffee = scoreVenue(venue({ kind: "cafe" }), group);
    const museum = scoreVenue(venue({ kind: "museum" }), group);
    expect(coffee).toBeGreaterThan(museum);
  });

  it("picks the film matching interests", async () => {
    const films = await new FakeMovies().nowPlaying();
    expect(pickFilm(films, [att("a", 0, 0, { interests: ["photography"] })])?.title).toBe("Deep Field");
    expect(pickFilm([], group)).toBeNull();
  });
});

describe("fillSlot", () => {
  it("returns a stop with timings and skips used venues", async () => {
    const used = new Set(["fake-cafe-3"]);
    const stop = await fillSlot({
      places: new FakePlaces(), slot: { startTime: "10:00", durationMin: 90, kind: "cafe", vibe: "x" },
      date: "2026-10-18", area: { lat: 12.95, lng: 77.62 }, attendees: group, usedIds: used, films: [],
    });
    expect(stop).not.toBeNull();
    expect(stop!.venue.id).not.toBe("fake-cafe-3");
    expect(stop!.startsAt).toBe("2026-10-18T04:30:00.000Z");
    expect(stop!.endsAt).toBe("2026-10-18T06:00:00.000Z");
    expect(stop!.film).toBeNull();
  });

  it("pairs a film with cinema slots", async () => {
    const stop = await fillSlot({
      places: new FakePlaces(), slot: { startTime: "18:00", durationMin: 150, kind: "cinema", vibe: "x" },
      date: "2026-10-18", area: { lat: 12.95, lng: 77.62 }, attendees: group, usedIds: new Set(),
      films: await new FakeMovies().nowPlaying(),
    });
    expect(stop!.film).not.toBeNull();
  });

  it("returns null when nothing is found", async () => {
    const stop = await fillSlot({
      places: new FakePlaces({ emptyKinds: ["beach"] }), slot: { startTime: "09:00", durationMin: 120, kind: "beach", vibe: "x" },
      date: "2026-10-18", area: { lat: 12.95, lng: 77.62 }, attendees: group, usedIds: new Set(), films: [],
    });
    expect(stop).toBeNull();
  });
});
