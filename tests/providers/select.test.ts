import { describe, it, expect, afterEach, vi } from "vitest";
import { getProviders } from "@/lib/providers";

describe("getProviders", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("uses fakes under WAYPOINT_FAKES", () => {
    expect(getProviders().places.name).toBe("fake");
  });
  it("uses OSM/OSRM without a Google key", () => {
    vi.stubEnv("WAYPOINT_FAKES", "");
    vi.stubEnv("GOOGLE_MAPS_API_KEY", "");
    const p = getProviders();
    expect(p.places.name).toBe("osm");
    expect(p.routes.name).toBe("osrm");
  });
  it("prefers Google with free fallback when keyed", () => {
    vi.stubEnv("WAYPOINT_FAKES", "");
    vi.stubEnv("GOOGLE_MAPS_API_KEY", "abc");
    const p = getProviders();
    expect(p.places.name).toBe("google+osm");
    expect(p.routes.name).toBe("google+osrm");
  });
});
