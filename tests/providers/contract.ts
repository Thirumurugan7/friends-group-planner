import { it, expect } from "vitest";
import type { PlacesProvider, RoutesProvider } from "@/lib/providers/types";

export function placesContract(make: () => PlacesProvider) {
  it("returns named venues of the requested kind with coordinates", async () => {
    const venues = await make().search({ lat: 12.97, lng: 77.64 }, 3000, "cafe");
    expect(venues.length).toBeGreaterThan(0);
    for (const v of venues) {
      expect(v.name.length).toBeGreaterThan(0);
      expect(v.kind).toBe("cafe");
      expect(Number.isFinite(v.lat) && Number.isFinite(v.lng)).toBe(true);
      expect(v.rating === null || (v.rating >= 0 && v.rating <= 5)).toBe(true);
      expect([null, 1, 2, 3, 4]).toContain(v.priceLevel);
    }
  });
}

export function routesContract(make: () => RoutesProvider, opts: { transitApproximate: boolean }) {
  const from = { lat: 12.9719, lng: 77.6412 };
  const to = { lat: 12.9352, lng: 77.6245 };
  const at = new Date("2026-10-18T05:00:00Z");

  it("returns positive distance and duration for own vehicle", async () => {
    const r = await make().route(from, to, "own", at);
    expect(r.distanceM).toBeGreaterThan(0);
    expect(r.durationS).toBeGreaterThan(0);
    expect(r.noService).toBe(false);
  });

  it(`marks public transport approximate=${opts.transitApproximate}`, async () => {
    const r = await make().route(from, to, "public", at);
    expect(r.approximate).toBe(opts.transitApproximate);
    expect(r.durationS).toBeGreaterThan(0);
  });
}
