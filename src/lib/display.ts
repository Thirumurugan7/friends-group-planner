import type { LatLng, LineColor, TransportMode } from "./types";
import { lineFor } from "./lines";

/** A member shaped for the UI (map diagram, roster, avatars). */
export interface DisplayMember {
  id: string;
  name: string;
  line: LineColor;
  point: LatLng;
  transport: TransportMode;
  homeLabel: string;
  interests: string[];
  profileComplete: boolean;
}

/** Raw member as returned from the API (Prisma user via membership). */
export interface RawMember {
  id: string;
  name: string | null;
  transport: TransportMode;
  homeLabel: string | null;
  interests: string[];
}

/**
 * Schematic position on a ring around the centre. Until real coordinates and
 * the Google Maps key are wired, the convergence map is a diagram, not a
 * geographic map — this keeps it legible and evenly spread.
 */
export function ringPoint(index: number, total: number): LatLng {
  const angle = (index / Math.max(1, total)) * Math.PI * 2 - Math.PI / 2;
  const radius = 0.36;
  return {
    lat: 0.5 + radius * Math.sin(angle),
    lng: 0.5 + radius * Math.cos(angle),
  };
}

export function toDisplayMembers(members: RawMember[]): DisplayMember[] {
  return members.map((m, i) => ({
    id: m.id,
    name: m.name ?? "New friend",
    line: lineFor(i),
    point: ringPoint(i, members.length),
    transport: m.transport,
    homeLabel: m.homeLabel ?? "Location pending",
    interests: m.interests,
    profileComplete: Boolean(m.name && m.homeLabel),
  }));
}

export const MEETING_POINT: LatLng = { lat: 0.5, lng: 0.5 };
