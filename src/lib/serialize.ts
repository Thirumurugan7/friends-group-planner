import type { Role, User } from "@prisma/client";
import { isProfileComplete } from "@/lib/profile";

export function roundArea(lat: number | null, lng: number | null) {
  if (lat == null || lng == null) return null;
  return { lat: Math.round(lat * 100) / 100, lng: Math.round(lng * 100) / 100 };
}

export interface PublicMember {
  id: string;
  name: string;
  homeLabel: string | null;
  workLabel: string | null;
  homeArea: { lat: number; lng: number } | null;
  transport: "public" | "own";
  interests: string[];
  profileComplete: boolean;
  role?: Role;
}

/** What other group members may see. Never exact coordinates. */
export function publicMember(u: User, role?: Role): PublicMember {
  return {
    id: u.id,
    name: u.name ?? "New friend",
    homeLabel: u.homeLabel,
    workLabel: u.workLabel,
    homeArea: roundArea(u.homeLat, u.homeLng),
    transport: u.transport,
    interests: u.interests,
    profileComplete: isProfileComplete(u),
    ...(role ? { role } : {}),
  };
}

/** The viewer's own profile — the only place exact coordinates are returned. */
export function selfProfile(u: User) {
  return {
    id: u.id,
    phone: u.phone,
    email: u.email,
    googleLinked: Boolean(u.googleId),
    name: u.name,
    age: u.age,
    gender: u.gender,
    homeBy: u.homeBy,
    home: u.homeLat != null ? { lat: u.homeLat, lng: u.homeLng!, label: u.homeLabel ?? "" } : null,
    work: u.workLat != null ? { lat: u.workLat, lng: u.workLng!, label: u.workLabel ?? "" } : null,
    transport: u.transport,
    interests: u.interests,
    openness: u.openness,
    profileComplete: isProfileComplete(u),
  };
}
