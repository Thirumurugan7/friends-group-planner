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

// Shared across requests so throttling and quota backoff apply to the whole server, not one call.
let overpass: OverpassPlaces | null = null;
let google: { key: string; places: GooglePlaces; routes: GoogleRoutes } | null = null;

export function getProviders(): Providers {
  if (fakesEnabled()) return fakeProviders();

  const osm = (overpass ??= new OverpassPlaces());
  const osrm = new OsrmRoutes();
  const key = process.env.GOOGLE_MAPS_API_KEY;

  if (key && google?.key !== key) google = { key, places: new GooglePlaces(key), routes: new GoogleRoutes(key) };

  const places = key && google ? placesWithFallback(google.places, osm) : placesWithFallback(osm, null);
  const routes = key && google ? routesWithFallback(google.routes, osrm) : routesWithFallback(osrm, null);

  return {
    places,
    routes: cachedRoutes(routes),
    movies: new TmdbMovies(process.env.TMDB_API_KEY ?? ""),
    llm: new GroqLlm(),
  };
}
