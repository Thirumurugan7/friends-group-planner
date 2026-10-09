import type { LatLng, OpeningWindow, SlotKind, Venue } from "@/lib/engine/types";
import { HHMM_RE } from "@/lib/time";
import { ProviderError, type PlacesProvider } from "./types";

const OSM_TAGS: Record<SlotKind, string[]> = {
  cafe: ["amenity=cafe"],
  restaurant: ["amenity=restaurant"],
  gaming: ["leisure=amusement_arcade", "leisure=bowling_alley", "amenity=internet_cafe"],
  cinema: ["amenity=cinema"],
  beach: ["natural=beach"],
  park: ["leisure=park"],
  museum: ["tourism=museum"],
  mall: ["shop=mall"],
  viewpoint: ["tourism=viewpoint"],
  street_food: ["amenity=fast_food", "amenity=food_court"],
};

/** Only "HH:MM-HH:MM" or "Mo-Su HH:MM-HH:MM"; anything richer is "unknown". */
export function parseOpeningHours(raw: string | undefined): OpeningWindow | null {
  if (!raw) return null;
  const m = raw.trim().match(/^(?:Mo-Su\s+)?(\d{2}:\d{2})-(\d{2}:\d{2})$/);
  if (!m || !HHMM_RE.test(m[1]) || !HHMM_RE.test(m[2])) return null;
  return { open: m[1], close: m[2] };
}

interface OverpassElement {
  type: string;
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

export class OverpassPlaces implements PlacesProvider {
  readonly name = "osm";
  constructor(
    private fetchFn: typeof fetch = fetch,
    private url = process.env.OVERPASS_URL ?? "https://overpass-api.de/api/interpreter"
  ) {}

  async search(center: LatLng, radiusM: number, kind: SlotKind): Promise<Venue[]> {
    const around = `(around:${Math.round(radiusM)},${center.lat},${center.lng})`;
    const parts = OSM_TAGS[kind].map((t) => {
      const [k, v] = t.split("=");
      return `nwr["${k}"="${v}"]${around};`;
    });
    const query = `[out:json][timeout:20];(${parts.join("")});out center tags 40;`;
    const res = await this.fetchFn(this.url, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: `data=${encodeURIComponent(query)}`,
    });
    if (!res.ok) throw new ProviderError(`overpass HTTP ${res.status}`);
    const body = (await res.json()) as { elements?: OverpassElement[] };

    return (body.elements ?? []).flatMap((el): Venue[] => {
      const name = el.tags?.name;
      const lat = el.lat ?? el.center?.lat;
      const lng = el.lon ?? el.center?.lon;
      if (!name || lat == null || lng == null) return [];
      return [{
        id: `osm-${el.type}-${el.id}`,
        name,
        lat,
        lng,
        kind,
        rating: null,
        priceLevel: null,
        opening: parseOpeningHours(el.tags?.opening_hours),
        address: el.tags?.["addr:street"] ?? null,
        source: "osm",
      }];
    });
  }
}
