import type { LatLng, RouteResult, SlotKind, Transport, Venue } from "@/lib/engine/types";
import { decodePolyline } from "@/lib/engine/geo";
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

  async search(center: LatLng, radiusM: number, kind: SlotKind): Promise<Venue[]> {
    const res = await this.fetchFn("https://places.googleapis.com/v1/places:searchNearby", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "X-Goog-Api-Key": this.apiKey,
        "X-Goog-FieldMask":
          "places.id,places.displayName,places.location,places.rating,places.priceLevel,places.formattedAddress,places.regularOpeningHours",
      },
      body: JSON.stringify({
        includedTypes: PLACE_TYPES[kind],
        maxResultCount: 20,
        locationRestriction: {
          circle: { center: { latitude: center.lat, longitude: center.lng }, radius: Math.min(radiusM, 50_000) },
        },
      }),
    });
    if (!res.ok) throw new ProviderError(`google places HTTP ${res.status}`);
    const body = (await res.json()) as { places?: GPlace[] };

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

  async route(from: LatLng, to: LatLng, mode: Transport, departAt: Date): Promise<RouteResult> {
    const transit = mode === "public";
    const res = await this.fetchFn("https://routes.googleapis.com/directions/v2:computeRoutes", {
      method: "POST",
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
