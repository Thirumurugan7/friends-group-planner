import type { Outing, User } from "@prisma/client";
import { prisma } from "@/lib/db";
import { effectiveDeadline } from "@/lib/deadline";
import { isProfileComplete } from "@/lib/profile";
import type { Attendee } from "@/lib/engine/types";

export function toAttendee(u: User, groupHomeBy: string | null): Attendee {
  return {
    id: u.id,
    name: u.name ?? "Friend",
    home: { lat: u.homeLat!, lng: u.homeLng! },
    homeLabel: u.homeLabel ?? "",
    transport: u.transport,
    interests: u.interests,
    openness: u.openness,
    deadline: effectiveDeadline(u, groupHomeBy),
  };
}

export async function loadAttendees(outing: Outing, mode: "free" | "going"): Promise<Attendee[]> {
  const members = await prisma.membership.findMany({
    where: { groupId: outing.groupId },
    include: { user: true },
    orderBy: { joinedAt: "asc" },
  });
  let ids: Set<string>;
  if (mode === "free") {
    const rows = outing.date
      ? await prisma.availability.findMany({ where: { outingId: outing.id, date: outing.date, free: true } })
      : [];
    ids = new Set(rows.map((r) => r.userId));
  } else {
    const rows = await prisma.rsvp.findMany({ where: { outingId: outing.id, status: "going" } });
    ids = new Set(rows.map((r) => r.userId));
  }
  return members
    .map((m) => m.user)
    .filter((u) => ids.has(u.id) && isProfileComplete(u))
    .map((u) => toAttendee(u, outing.groupHomeBy));
}
