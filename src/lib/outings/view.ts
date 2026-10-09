import { prisma } from "@/lib/db";
import { datesInRange } from "@/lib/time";
import { pickDate } from "@/lib/engine/pickDate";
import { settle } from "@/lib/engine/settle";
import { isProfileComplete } from "@/lib/profile";
import { publicMember } from "@/lib/serialize";
import type { CostLine, HomeByEntry, Leg, Narrative, Stop } from "@/lib/engine/types";

export function redactRoutes(routes: Leg[], viewerId: string): Leg[] {
  return routes.map((l) =>
    l.attendeeId !== viewerId && (l.from === "home" || l.to === "home")
      ? { ...l, route: { ...l.route, geometry: null } }
      : l
  );
}

export async function outingView(outingId: string, viewerId: string) {
  const o = await prisma.outing.findUniqueOrThrow({
    where: { id: outingId },
    include: {
      group: { include: { memberships: { include: { user: true }, orderBy: { joinedAt: "asc" } } } },
      availability: true,
      rsvps: true,
      votes: true,
      checkIns: true,
      expenses: { orderBy: { createdAt: "asc" } },
      options: { orderBy: { createdAt: "asc" }, include: { showtimes: true } },
    },
  });
  const memberships = o.group.memberships;
  const mine = memberships.find((m) => m.userId === viewerId)!;
  const memberIds = memberships.map((m) => m.userId);
  const ranked = pickDate({
    dates: datesInRange(o.rangeStart, o.rangeEnd),
    availability: o.availability,
    memberIds,
    incompleteIds: memberships.filter((m) => !isProfileComplete(m.user)).map((m) => m.userId),
  });

  return {
    outing: {
      id: o.id, title: o.title, status: o.status, rangeStart: o.rangeStart, rangeEnd: o.rangeEnd,
      date: o.date, groupHomeBy: o.groupHomeBy, cancelReason: o.cancelReason,
      lockedOptionId: o.lockedOptionId, createdById: o.createdById, groupId: o.groupId, groupName: o.group.name,
    },
    me: {
      id: viewerId,
      role: mine.role,
      isOrganiser: o.createdById === viewerId,
      canManage: o.createdById === viewerId || mine.role === "admin",
      rsvp: o.rsvps.find((r) => r.userId === viewerId)?.status ?? null,
      voteOptionId: o.votes.find((v) => v.userId === viewerId)?.optionId ?? null,
      checkIn: o.checkIns.find((c) => c.userId === viewerId)?.attended ?? null,
      freeDates: o.availability.filter((a) => a.userId === viewerId && a.free).map((a) => a.date),
    },
    members: memberships.map((m) => publicMember(m.user, m.role)),
    dates: ranked.map(({ date, freeUserIds, freeCount }) => ({ date, freeUserIds, freeCount })),
    options: o.options.map((opt) => ({
      id: opt.id, theme: opt.theme, status: opt.status, progress: opt.progress, error: opt.error,
      stops: opt.stops as unknown as Stop[],
      routes: redactRoutes(opt.routes as unknown as Leg[], viewerId),
      costs: opt.costs as unknown as CostLine[],
      homeByReport: opt.homeByReport as unknown as HomeByEntry[],
      narrative: opt.narrative as unknown as Narrative | null,
      approximateTransit: opt.approximateTransit,
      voteCount: o.votes.filter((v) => v.optionId === opt.id).length,
      showtimes: opt.showtimes.map((s) => ({ stopIndex: s.stopIndex, startsAt: s.startsAt.toISOString() })),
    })),
    rsvps: o.rsvps
      .filter((r) => memberIds.includes(r.userId))
      .map((r) => ({ userId: r.userId, status: r.status, cancelledAt: r.cancelledAt, cancelReason: r.cancelReason })),
    checkIns: o.checkIns.map((c) => ({ userId: c.userId, attended: c.attended })),
    expenses: o.expenses.map((e) => ({
      id: e.id, paidById: e.paidById, amount: e.amount, note: e.note,
      stopIndex: e.stopIndex, splitAmong: e.splitAmong, createdAt: e.createdAt,
    })),
    transfers: settle(o.expenses),
  };
}

export type OutingView = Awaited<ReturnType<typeof outingView>>;
