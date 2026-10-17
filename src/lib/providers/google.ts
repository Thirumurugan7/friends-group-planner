import type { LatLng, RouteResult, SlotKind, Transport, Venue } from "@/lib/engine/types";
import { decodePolyline, haversineM } from "@/lib/engine/geo";
import { ProviderError, type PlacesProvider, type RoutesProvider } from "./types";

const PLACE_TYPES: Record<SlotKind, string[]> = {
  cafe: ["cafe"],
  restaurant: ["restaurant"],
  gaming: ["amusement_center", "bowling_alley"],
  cinema: ["movie_theater"],
  beach: ["beach"],
  park: ["park"],
  museum: ["museum"],
  mall: ["shopping_mall"],
  viewpoint: ["tourist_attraction"],
  street_food: ["fast_food_restaurant", "food_court"],
};

// Text Search has its own daily quota, so it stands in when Nearby Search is exhausted.
const TEXT_QUERY: Record<SlotKind, string> = {
  cafe: "cafe",
  restaurant: "restaurant",
  gaming: "gaming arcade bowling",
  cinema: "movie theater",
  beach: "beach",
  park: "park",
  museum: "museum",
  mall: "shopping mall",
  viewpoint: "tourist attraction",
  street_food: "street food",
};

// How long to stop calling an endpoint after Google says its daily quota is exhausted.
const QUOTA_BACKOFF_MS = 10 * 60_000;

const PRICE: Record<string, 1 | 2 | 3 | 4> = {
  PRICE_LEVEL_FREE: 1,
  PRICE_LEVEL_INEXPENSIVE: 1,
  PRICE_LEVEL_MODERATE: 2,
  PRICE_LEVEL_EXPENSIVE: 3,
  PRICE_LEVEL_VERY_EXPENSIVE: 4,
};

const hhmm = (h: number, m: number) => `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;

interface GPlace {
  id: string;
  displayName?: { text: string };
  location?: { latitude: number; longitude: number };
  rating?: number;
  priceLevel?: string;
  formattedAddress?: string;
  regularOpeningHours?: { periods?: { open: { hour: number; minute: number }; close?: { hour: number; minute: number } }[] };
}

export class GooglePlaces implements PlacesProvider {
  readonly name = "google";
  constructor(private apiKey: string, private fetchFn: typeof fetch = fetch) {}

  private nearbyExhaustedUntil = 0;

  async search(center: LatLng, radiusM: number, kind: SlotKind): Promise<Venue[]> {
    const radius = Math.min(radiusM, 50_000);
    const circle = { center: { latitude: center.lat, longitude: center.lng }, radius };
    if (Date.now() >= this.nearbyExhaustedUntil) {
      const res = await this.post("searchNearby", { includedTypes: PLACE_TYPES[kind], maxResultCount: 20, locationRestriction: { circle } });
      if (res.ok) return this.toVenues((await res.json()) as { places?: GPlace[] }, kind);
      if (res.status !== 429) throw new ProviderError(`google places HTTP ${res.status}`);
      this.nearbyExhaustedUntil = Date.now() + QUOTA_BACKOFF_MS;
    }
    const res = await this.post("searchText", {
      textQuery: TEXT_QUERY[kind],
      includedType: PLACE_TYPES[kind][0],
      pageSize: 20,
      locationBias: { circle },
    });
    if (!res.ok) throw new ProviderError(`google places text search HTTP ${res.status}`);
    // locationBias only prefers nearby results; drop the ones outside the radius.
    return this.toVenues((await res.json()) as { places?: GPlace[] }, kind).filter((v) => haversineM(center, v) <= radius);
  }

  private post(method: "searchNearby" | "searchText", body: object) {
    return this.fetchFn(`https://places.googleapis.com/v1/places:${method}`, {
      method: "POST",
      signal: AbortSignal.timeout(15_000),
      headers: {
        "content-type": "application/json",
        "X-Goog-Api-Key": this.apiKey,
        "X-Goog-FieldMask":
          "places.id,places.displayName,places.location,places.rating,places.priceLevel,places.formattedAddress,places.regularOpeningHours",
      },
      body: JSON.stringify(body),
    });
  }

  private toVenues(body: { places?: GPlace[] }, kind: SlotKind): Venue[] {
    return (body.places ?? []).flatMap((p): Venue[] => {
      if (!p.displayName?.text || !p.location) return [];
      const period = p.regularOpeningHours?.periods?.[0];
      return [{
        id: `google-${p.id}`,
        name: p.displayName.text,
        lat: p.location.latitude,
        lng: p.location.longitude,
        kind,
        rating: p.rating ?? null,
        priceLevel: p.priceLevel ? PRICE[p.priceLevel] ?? null : null,
        opening: period?.close
          ? { open: hhmm(period.open.hour, period.open.minute), close: hhmm(period.close.hour, period.close.minute) }
          : null,
        address: p.formattedAddress ?? null,
        source: "google",
      }];
    });
  }
}

export class GoogleRoutes implements RoutesProvider {
  readonly name = "google";
  constructor(private apiKey: string, private fetchFn: typeof fetch = fetch) {}

  private exhaustedUntil = 0;

  async route(from: LatLng, to: LatLng, mode: Transport, departAt: Date): Promise<RouteResult> {
    if (Date.now() < this.exhaustedUntil) throw new ProviderError("google routes: daily quota exhausted");
    const transit = mode === "public";
    const res = await this.fetchFn("https://routes.googleapis.com/directions/v2:computeRoutes", {
      method: "POST",
      signal: AbortSignal.timeout(15_000),
      headers: {
        "content-type": "application/json",
        "X-Goog-Api-Key": this.apiKey,
        "X-Goog-FieldMask": "routes.distanceMeters,routes.duration,routes.polyline.encodedPolyline",
      },
      body: JSON.stringify({
        origin: { location: { latLng: { latitude: from.lat, longitude: from.lng } } },
        destination: { location: { latLng: { latitude: to.lat, longitude: to.lng } } },
        travelMode: transit ? "TRANSIT" : "DRIVE",
        ...(transit ? {} : { routingPreference: "TRAFFIC_AWARE" }),
        departureTime: departAt.toISOString(),
      }),
    });
    if (res.status === 429) this.exhaustedUntil = Date.now() + QUOTA_BACKOFF_MS;
    if (!res.ok) throw new ProviderError(`google routes HTTP ${res.status}`);
    const body = (await res.json()) as {
      routes?: { distanceMeters?: number; duration?: string; polyline?: { encodedPolyline?: string } }[];
    };
    const r = body.routes?.[0];
    if (!r) {
      if (transit) return { distanceM: 0, durationS: 0, approximate: false, noService: true, geometry: null };
      throw new ProviderError("google routes: no route");
    }
    return {
      distanceM: r.distanceMeters ?? 0,
      durationS: Number.parseInt(r.duration ?? "0", 10),
      approximate: false,
      noService: false,
      geometry: r.polyline?.encodedPolyline ? decodePolyline(r.polyline.encodedPolyline) : null,
    };
  }
}
