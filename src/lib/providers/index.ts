import { fakesEnabled } from "@/lib/fakes";
import { fakeProviders } from "./fake";
import { OverpassPlaces } from "./osm";
import { OsrmRoutes } from "./osrm";
import { TmdbMovies } from "./tmdb";
import { GooglePlaces, GoogleRoutes } from "./google";
import { GroqLlm } from "./groq";
import { cachedRoutes } from "./cache";
import { placesWithFallback, routesWithFallback } from "./fallback";
import type { Providers } from "./types";

export type { Providers } from "./types";

// Shared across requests so its queue and cache throttle the whole server, not one call.
let overpass: OverpassPlaces | null = null;

export function getProviders(): Providers {
  if (fakesEnabled()) return fakeProviders();

  const osm = (overpass ??= new OverpassPlaces());
  const osrm = new OsrmRoutes();
  const key = process.env.GOOGLE_MAPS_API_KEY;

  const places = key ? placesWithFallback(new GooglePlaces(key), osm) : placesWithFallback(osm, null);
  const routes = key ? routesWithFallback(new GoogleRoutes(key), osrm) : routesWithFallback(osrm, null);

  return {
    places,
    routes: cachedRoutes(routes),
    movies: new TmdbMovies(process.env.TMDB_API_KEY ?? ""),
    llm: new GroqLlm(),
  };
}
