import { prisma } from "@/lib/db";
import { route, ok, requireUser, requireMember } from "@/lib/http";
import { publicMember } from "@/lib/serialize";

export const GET = route<{ id: string }>(async (_req, { params }) => {
  const user = await requireUser();
  const { id } = await params;
  const { group, membership } = await requireMember(id, user.id);

  const memberships = await prisma.membership.findMany({
    where: { groupId: id },
    include: { user: true },
    orderBy: { joinedAt: "asc" },
  });
  const outings = await prisma.outing.findMany({
    where: { groupId: id },
    orderBy: { createdAt: "desc" },
    include: { rsvps: { where: { status: "going" }, select: { id: true } } },
  });

  return ok({
    group: {
      id: group.id,
      name: group.name,
      inviteCode: group.inviteCode,
      myRole: membership.role,
      members: memberships.map((m) => publicMember(m.user, m.role)),
    },
    outings: outings.map((o) => ({
      id: o.id, title: o.title, status: o.status, date: o.date,
      rangeStart: o.rangeStart, rangeEnd: o.rangeEnd,
      goingCount: o.rsvps.length, createdAt: o.createdAt,
    })),
  });
});
