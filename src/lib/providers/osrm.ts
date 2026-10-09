import type { LatLng, RouteResult, Transport } from "@/lib/engine/types";
import { ProviderError, type RoutesProvider } from "./types";

export const TRANSIT_FACTOR = 1.6;
export const TRANSIT_EXTRA_S = 900;

export class OsrmRoutes implements RoutesProvider {
  readonly name = "osrm";
  constructor(
    private fetchFn: typeof fetch = fetch,
    private base = process.env.OSRM_URL ?? "https://router.project-osrm.org"
  ) {}

  // OSRM is time-independent; departAt is accepted to satisfy the RoutesProvider interface.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async route(from: LatLng, to: LatLng, mode: Transport, _departAt?: Date): Promise<RouteResult> {
    const coords = `${from.lng},${from.lat};${to.lng},${to.lat}`;
    const res = await this.fetchFn(`${this.base}/route/v1/driving/${coords}?overview=simplified&geometries=geojson`);
    if (!res.ok) throw new ProviderError(`osrm HTTP ${res.status}`);
    const body = (await res.json()) as {
      code: string;
      routes?: { distance: number; duration: number; geometry: { coordinates: [number, number][] } }[];
    };
    const r = body.routes?.[0];
    if (body.code !== "Ok" || !r) throw new ProviderError(`osrm ${body.code}`);

    const transit = mode === "public";
    return {
      distanceM: Math.round(r.distance),
      durationS: transit ? Math.round(r.duration * TRANSIT_FACTOR + TRANSIT_EXTRA_S) : Math.round(r.duration),
      approximate: transit,
      noService: false,
      geometry: r.geometry.coordinates.map(([lng, lat]) => [lat, lng]),
    };
  }
}
