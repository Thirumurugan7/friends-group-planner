import type { Film, LatLng, Narrative, RouteResult, SlotKind, Theme, Transport, Venue } from "@/lib/engine/types";
import { THEMES } from "@/lib/engine/types";
import { estimateMinutes, haversineM } from "@/lib/engine/geo";
import { templateDay } from "@/lib/engine/templates";
import type { LlmProvider, LlmRequest, MoviesProvider, PlacesProvider, Providers, RoutesProvider } from "./types";

// Deterministic stand-ins for tests and E2E. No network.

export class FakePlaces implements PlacesProvider {
  readonly name = "fake";
  constructor(private opts: { emptyKinds?: SlotKind[] } = {}) {}
  async search(center: LatLng, _radiusM: number, kind: SlotKind): Promise<Venue[]> {
    if (this.opts.emptyKinds?.includes(kind)) return [];
    return [0, 1, 2, 3].map((i) => ({
      id: `fake-${kind}-${i}`,
      name: `${kind.replace("_", " ")} spot ${i + 1}`,
      lat: center.lat + (i - 1.5) * 0.004,
      lng: center.lng + (i % 2 ? 0.003 : -0.003),
      kind,
      rating: 3.8 + i * 0.3,
      priceLevel: ((i % 3) + 1) as 1 | 2 | 3,
      opening: { open: "08:00", close: "23:30" },
      address: `${i + 1} Fake Street`,
      source: "fake" as const,
    }));
  }
}

export class FakeRoutes implements RoutesProvider {
  readonly name = "fake";
  calls = 0;
  constructor(private opts: { slowFactor?: number; noServiceAfter?: Date } = {}) {}
  async route(from: LatLng, to: LatLng, mode: Transport, departAt: Date): Promise<RouteResult> {
    this.calls++;
    const noService = mode === "public" && !!this.opts.noServiceAfter && departAt >= this.opts.noServiceAfter;
    return {
      distanceM: Math.round(haversineM(from, to) * 1.3),
      durationS: estimateMinutes(from, to, mode) * 60 * (this.opts.slowFactor ?? 1),
      approximate: false,
      noService,
      geometry: [[from.lat, from.lng], [to.lat, to.lng]],
    };
  }
}

export class FakeMovies implements MoviesProvider {
  async nowPlaying(): Promise<Film[]> {
    return [
      { id: 1, title: "Monsoon Heist", genres: ["Action", "Thriller"], rating: 7.4, posterUrl: null },
      { id: 2, title: "Chai & Chaos", genres: ["Comedy"], rating: 6.9, posterUrl: null },
      { id: 3, title: "Deep Field", genres: ["Documentary"], rating: 8.1, posterUrl: null },
    ];
  }
}

export class FakeLlm implements LlmProvider {
  constructor(private opts: { failSketch?: boolean; failNarrate?: boolean } = {}) {}
  async json<T>(req: LlmRequest<T>): Promise<T> {
    if (req.task === "sketch") {
      if (this.opts.failSketch) throw new Error("fake sketch failure");
      const theme = (THEMES.find((t) => req.user.includes(`Theme: ${t}`)) ?? "relaxed") as Theme;
      return req.schema.parse({ slots: templateDay(theme) });
    }
    if (this.opts.failNarrate) throw new Error("fake narrate failure");
    const n: Narrative = {
      summary: "A fair day out with short trips for everyone.",
      swot: {
        strengths: ["Everyone travels under an hour"],
        weaknesses: ["Busy on weekends"],
        opportunities: ["Try the new place nearby"],
        threats: ["Evening traffic"],
      },
    };
    return req.schema.parse(n);
  }
}

export function fakeProviders(overrides: Partial<Providers> = {}): Providers {
  return {
    places: new FakePlaces(),
    routes: new FakeRoutes(),
    movies: new FakeMovies(),
    llm: new FakeLlm(),
    ...overrides,
  };
}
