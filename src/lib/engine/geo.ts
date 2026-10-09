import type { LatLng, Transport } from "./types";

const R = 6_371_000;
const rad = (d: number) => (d * Math.PI) / 180;

export function haversineM(a: LatLng, b: LatLng): number {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export const SPEED_KMH: Record<Transport, number> = { public: 18, own: 25 };
const OVERHEAD_MIN: Record<Transport, number> = { public: 10, own: 5 };
const DETOUR = 1.3; // roads are not straight lines

/** Cheap, network-free travel estimate used for scoring candidates. */
export function estimateMinutes(a: LatLng, b: LatLng, mode: Transport): number {
  const km = (haversineM(a, b) / 1000) * DETOUR;
  return Math.round((km / SPEED_KMH[mode]) * 60 + OVERHEAD_MIN[mode]);
}

export function decodePolyline(encoded: string): [number, number][] {
  const points: [number, number][] = [];
  let index = 0, lat = 0, lng = 0;
  while (index < encoded.length) {
    for (const which of [0, 1]) {
      let result = 0, shift = 0, b: number;
      do {
        b = encoded.charCodeAt(index++) - 63;
        result |= (b & 0x1f) << shift;
        shift += 5;
      } while (b >= 0x20);
      const delta = result & 1 ? ~(result >> 1) : result >> 1;
      if (which === 0) lat += delta; else lng += delta;
    }
    points.push([lat / 1e5, lng / 1e5]);
  }
  return points;
}
