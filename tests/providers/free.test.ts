import { describe, it, expect } from "vitest";
import overpass from "./fixtures/overpass-cafe.json";
import osrm from "./fixtures/osrm-route.json";
import tmdb from "./fixtures/tmdb-now-playing.json";
import { placesContract, routesContract } from "./contract";
import { OverpassPlaces, parseOpeningHours } from "@/lib/providers/osm";
import { OsrmRoutes } from "@/lib/providers/osrm";
import { TmdbMovies } from "@/lib/providers/tmdb";

const jsonFetch = (body: unknown, status = 200) =>
  (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;

describe("OverpassPlaces", () => {
  placesContract(() => new OverpassPlaces(jsonFetch(overpass)));

  it("skips unnamed elements and reads way centres", async () => {
    const v = await new OverpassPlaces(jsonFetch(overpass)).search({ lat: 12.97, lng: 77.64 }, 3000, "cafe");
    expect(v.map((x) => x.name)).toEqual(["Third Wave Coffee", "Dyu Art Cafe"]);
    expect(v[1].lat).toBe(12.9701);
    expect(v[0].id).toBe("osm-node-101");
  });

  it("throws ProviderError on HTTP errors", async () => {
    await expect(new OverpassPlaces(jsonFetch({}, 504)).search({ lat: 1, lng: 1 }, 1000, "cafe")).rejects.toThrow(/overpass/i);
  });

  it("parses simple opening hours only", () => {
    expect(parseOpeningHours("Mo-Su 08:00-23:00")).toEqual({ open: "08:00", close: "23:00" });
    expect(parseOpeningHours("10:00-22:30")).toEqual({ open: "10:00", close: "22:30" });
    expect(parseOpeningHours("Tu-Su 10:00-22:30; Mo off")).toBeNull();
    expect(parseOpeningHours(undefined)).toBeNull();
  });
});

describe("OsrmRoutes", () => {
  routesContract(() => new OsrmRoutes(jsonFetch(osrm)), { transitApproximate: true });

  it("estimates transit as driving x1.6 + 15 min", async () => {
    const r = await new OsrmRoutes(jsonFetch(osrm)).route({ lat: 1, lng: 1 }, { lat: 2, lng: 2 }, "public", new Date());
    expect(r.durationS).toBe(Math.round(812.7 * 1.6 + 900));
    expect(r.geometry?.[0]).toEqual([12.9719, 77.6412]);
  });

  it("throws on code != Ok", async () => {
    await expect(new OsrmRoutes(jsonFetch({ code: "NoRoute" })).route({ lat: 1, lng: 1 }, { lat: 2, lng: 2 }, "own", new Date())).rejects.toThrow(/osrm/i);
  });
});

describe("TmdbMovies", () => {
  it("maps genres and posters", async () => {
    const films = await new TmdbMovies("k", jsonFetch(tmdb)).nowPlaying("IN");
    expect(films[0]).toEqual({
      id: 9001, title: "Monsoon Heist", genres: ["Action", "Thriller"], rating: 7.4,
      posterUrl: "https://image.tmdb.org/t/p/w342/abc.jpg",
    });
    expect(films[1].posterUrl).toBeNull();
  });
});
