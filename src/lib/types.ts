// Core domain types. These mirror the Prisma models in the design spec so the
// UI built against mock data will map cleanly onto the real API later.

export type TransportMode = "public" | "own";
export type Category = "cafe" | "restaurant" | "gaming";

/** The six metro-line colors, assigned per member in join order. */
export type LineColor =
  | "teal"
  | "coral"
  | "violet"
  | "lime"
  | "sky"
  | "rose";

export interface LatLng {
  lat: number;
  lng: number;
}

export interface Place extends LatLng {
  label: string;
}

export interface Member {
  id: string;
  name: string;
  age: number;
  line: LineColor;
  home: Place;
  work: Place;
  transport: TransportMode;
  interests: string[];
  opennessToNew: number; // 1–5
  /** Normalized schematic position (0–1) used by the convergence map. */
  point: LatLng;
  profileComplete: boolean;
}

export interface Group {
  id: string;
  name: string;
  inviteCode: string;
  members: Member[];
}

export interface RouteLeg {
  memberId: string;
  distanceKm: number;
  durationMin: number;
  transport: TransportMode;
}

export interface Swot {
  strengths: string[];
  weaknesses: string[];
  opportunities: string[];
  threats: string[];
}

export interface VenueResult {
  id: string;
  name: string;
  category: Category;
  area: string;
  rating: number; // 0–5
  priceLevel: number; // 1–4
  tags: string[];
  /** 0–100 group compatibility. */
  compatibility: number;
  /** 0–100 fairness — how evenly travel is spread. */
  fairness: number;
  legs: RouteLeg[];
  /** Schematic position on the convergence map (0–1). */
  point: LatLng;
  blurb: string;
  swot: Swot;
}
