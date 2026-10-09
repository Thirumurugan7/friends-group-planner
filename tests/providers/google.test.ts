import { describe, it, expect, vi } from "vitest";
import places from "./fixtures/google-places-cafe.json";
import drive from "./fixtures/google-routes-drive.json";
import empty from "./fixtures/google-routes-transit-empty.json";
import { placesContract, routesContract } from "./contract";
import { GooglePlaces, GoogleRoutes } from "@/lib/providers/google";

const jsonFetch = (body: unknown, status = 200) =>
  vi.fn<typeof fetch>(async () => new Response(JSON.stringify(body), { status }));

describe("GooglePlaces", () => {
  placesContract(() => new GooglePlaces("k", jsonFetch(places)));

  it("maps price level, rating, opening", async () => {
    const v = await new GooglePlaces("k", jsonFetch(places)).search({ lat: 12.97, lng: 77.64 }, 3000, "cafe");
    expect(v[0]).toMatchObject({ id: "google-ChIJ1", priceLevel: 2, rating: 4.3, opening: { open: "08:00", close: "23:00" }, source: "google" });
    expect(v[1].priceLevel).toBeNull();
  });

  it("sends the key and field mask", async () => {
    const f = jsonFetch(places);
    await new GooglePlaces("secret", f).search({ lat: 1, lng: 1 }, 1000, "cinema");
    const init = f.mock.calls[0][1] as { headers: Record<string, string>; body: string };
    expect(init.headers["X-Goog-Api-Key"]).toBe("secret");
    expect(JSON.parse(init.body).includedTypes).toEqual(["movie_theater"]);
  });
});

describe("GoogleRoutes", () => {
  routesContract(() => new GoogleRoutes("k", jsonFetch(drive)), { transitApproximate: false });

  it("parses duration and polyline", async () => {
    const r = await new GoogleRoutes("k", jsonFetch(drive)).route({ lat: 1, lng: 1 }, { lat: 2, lng: 2 }, "own", new Date());
    expect(r).toMatchObject({ distanceM: 5480, durationS: 1260, approximate: false, noService: false });
    expect(r.geometry?.[0]).toEqual([38.5, -120.2]);
  });

  it("reports noService when transit has no route", async () => {
    const r = await new GoogleRoutes("k", jsonFetch(empty)).route({ lat: 1, lng: 1 }, { lat: 2, lng: 2 }, "public", new Date());
    expect(r.noService).toBe(true);
  });

  it("throws when driving has no route", async () => {
    await expect(new GoogleRoutes("k", jsonFetch(empty)).route({ lat: 1, lng: 1 }, { lat: 2, lng: 2 }, "own", new Date())).rejects.toThrow(/google/i);
  });
});
