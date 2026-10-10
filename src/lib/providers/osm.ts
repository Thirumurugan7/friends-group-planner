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

// Overpass allows ~2 concurrent requests per IP and answers 429/504 when busy.
const BUSY = new Set([429, 504]);
const BACKOFF_MS = [2_000, 5_000, 10_000];
const CACHE_TTL_MS = 30 * 60_000;

export class OverpassPlaces implements PlacesProvider {
  readonly name = "osm";
  // One generate run searches the same area and kinds for every option: share those results.
  private cache = new Map<string, { at: number; result: Promise<Venue[]> }>();
  // Requests run one at a time so a burst of slots doesn't trip the rate limit.
  private queue: Promise<unknown> = Promise.resolve();
  private sleep: (ms: number) => Promise<void>;

  constructor(
    private fetchFn: typeof fetch = fetch,
    private url = process.env.OVERPASS_URL ?? "https://overpass-api.de/api/interpreter",
    opts: { sleep?: (ms: number) => Promise<void> } = {}
  ) {
    this.sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  }

  search(center: LatLng, radiusM: number, kind: SlotKind): Promise<Venue[]> {
    const key = [center.lat.toFixed(4), center.lng.toFixed(4), Math.round(radiusM), kind].join(":");
    const hit = this.cache.get(key);
    if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.result;

    const result = this.queue.then(() => this.fetchWithBackoff(center, radiusM, kind));
    this.queue = result.catch(() => {});
    this.cache.set(key, { at: Date.now(), result });
    result.catch(() => this.cache.delete(key));
    return result;
  }

  private async fetchWithBackoff(center: LatLng, radiusM: number, kind: SlotKind): Promise<Venue[]> {
    for (let attempt = 0; ; attempt++) {
      try {
        return await this.fetchOnce(center, radiusM, kind);
      } catch (err) {
        const busy = err instanceof ProviderError && BUSY.has(Number(err.message.split(" ").pop()));
        if (!busy || attempt >= BACKOFF_MS.length) throw err;
        await this.sleep(BACKOFF_MS[attempt]);
      }
    }
  }

  private async fetchOnce(center: LatLng, radiusM: number, kind: SlotKind): Promise<Venue[]> {
    const around = `(around:${Math.round(radiusM)},${center.lat},${center.lng})`;
    const parts = OSM_TAGS[kind].map((t) => {
      const [k, v] = t.split("=");
      return `nwr["${k}"="${v}"]${around};`;
    });
    const query = `[out:json][timeout:20];(${parts.join("")});out center tags 40;`;
    const res = await this.fetchFn(this.url, {
      method: "POST",
      // Outlast the server-side [timeout:20] so slow queries return data or a 504, not an abort.
      signal: AbortSignal.timeout(25_000),
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        accept: "application/json",
        // Overpass rejects anonymous clients (HTTP 406); identify ourselves.
        "user-agent": `Waypoint/1.0 (${process.env.NOMINATIM_CONTACT ?? "contact-unset"})`,
      },
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
