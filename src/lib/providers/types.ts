import type { ZodType } from "zod";
import type { Film, LatLng, RouteResult, SlotKind, Transport, Venue } from "@/lib/engine/types";

export interface PlacesProvider {
  readonly name: string;
  search(center: LatLng, radiusM: number, kind: SlotKind): Promise<Venue[]>;
}
export interface RoutesProvider {
  readonly name: string;
  route(from: LatLng, to: LatLng, mode: Transport, departAt: Date): Promise<RouteResult>;
}
export interface MoviesProvider {
  nowPlaying(region: string): Promise<Film[]>;
}
export interface LlmRequest<T> {
  task: "sketch" | "narrate";
  system: string;
  user: string;
  schema: ZodType<T>;
}
export interface LlmProvider {
  json<T>(req: LlmRequest<T>): Promise<T>;
}
export interface Providers {
  places: PlacesProvider;
  routes: RoutesProvider;
  movies: MoviesProvider;
  llm: LlmProvider;
}
export class ProviderError extends Error {}
