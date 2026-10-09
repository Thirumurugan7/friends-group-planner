export const SLOT_KINDS = [
  "cafe", "restaurant", "gaming", "cinema", "beach",
  "park", "museum", "mall", "viewpoint", "street_food",
] as const;
export type SlotKind = (typeof SLOT_KINDS)[number];
export type Transport = "public" | "own";
export const THEMES = ["relaxed", "adventurous", "foodie"] as const;
export type Theme = (typeof THEMES)[number];

export interface LatLng { lat: number; lng: number }

export interface Attendee {
  id: string;
  name: string;
  home: LatLng;
  homeLabel: string;
  transport: Transport;
  interests: string[];
  openness: number; // 1–5
  deadline: string | null; // effective "HH:MM"
}

export interface Slot { startTime: string; durationMin: number; kind: SlotKind; vibe: string }
export interface OpeningWindow { open: string; close: string } // "HH:MM"

export interface Venue {
  id: string;
  name: string;
  lat: number;
  lng: number;
  kind: SlotKind;
  rating: number | null;      // 0–5
  priceLevel: 1 | 2 | 3 | 4 | null;
  opening: OpeningWindow | null;
  address: string | null;
  source: "osm" | "google" | "fake";
}

export interface Film { id: number; title: string; genres: string[]; rating: number; posterUrl: string | null }

export interface Stop { slot: Slot; venue: Venue; film: Film | null; startsAt: string; endsAt: string } // ISO

export interface RouteResult {
  distanceM: number;
  durationS: number;
  approximate: boolean;            // true when transit is estimated
  noService: boolean;              // true when transit has no route at that time
  geometry: [number, number][] | null; // [lat, lng]
}

export type LegEnd = "home" | number; // number = stop index
export interface Leg {
  attendeeId: string;
  from: LegEnd;
  to: LegEnd;
  mode: Transport;
  departAt: string; // ISO
  arriveAt: string; // ISO
  route: RouteResult;
}

export interface HomeByEntry {
  attendeeId: string;
  deadline: string | null;
  arriveHomeAt: string; // ISO
  ok: boolean;
  reason: "late" | "no_service" | null;
}

export interface CostLine { attendeeId: string; entry: number; food: number; travel: number; total: number } // paise

export interface Swot { strengths: string[]; weaknesses: string[]; opportunities: string[]; threats: string[] }
export interface Narrative { summary: string; swot: Swot }

export interface Evaluated {
  routes: Leg[];
  homeByReport: HomeByEntry[];
  costs: CostLine[];
  narrative: Narrative | null;
  approximateTransit: boolean;
}
export interface OptionResult extends Evaluated { theme: Theme; stops: Stop[] }

export type ProgressStep = "sketching" | "finding_venues" | "routing" | "checking_home" | "costing" | "writing";
