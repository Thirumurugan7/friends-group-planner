import { describe, it, expect, beforeEach, vi } from "vitest";
import { resetDb } from "../helpers/db";
import { cachedRoutes } from "@/lib/providers/cache";
import { placesWithFallback, routesWithFallback } from "@/lib/providers/fallback";
import { FakePlaces, FakeRoutes } from "@/lib/providers/fake";
import { templateDay } from "@/lib/engine/templates";
import type { PlacesProvider, RoutesProvider } from "@/lib/providers/types";

const a = { lat: 12.97, lng: 77.64 };
const b = { lat: 12.93, lng: 77.62 };
const when = new Date("2026-10-18T05:00:00Z");

describe("provider plumbing", () => {
  beforeEach(resetDb);

  it("caches routes for 24h", async () => {
    const inner = new FakeRoutes();
    const cached = cachedRoutes(inner);
    await cached.route(a, b, "own", when);
    await cached.route(a, b, "own", when);
    expect(inner.calls).toBe(1);
  });

  it("retries once, then falls back", async () => {
    const broken: PlacesProvider = { name: "broken", search: vi.fn(async () => { throw new Error("down"); }) };
    const p = placesWithFallback(broken, new FakePlaces());
    const res = await p.search(a, 5000, "cafe");
    expect(res.length).toBeGreaterThan(0);
    expect(broken.search).toHaveBeenCalledTimes(2);
  });

  it("throws when there is no fallback", async () => {
    const broken: RoutesProvider = { name: "broken", route: async () => { throw new Error("down"); } };
    await expect(routesWithFallback(broken, null).route(a, b, "own", when)).rejects.toThrow("down");
  });

  it("templates exist for every theme and are copies", () => {
    const t = templateDay("relaxed");
    t[0].kind = "beach";
    expect(templateDay("relaxed")[0].kind).toBe("cafe");
    expect(templateDay("adventurous").length).toBeGreaterThanOrEqual(3);
  });
});
