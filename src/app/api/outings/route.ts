import { prisma } from "@/lib/db";
import { route, ok, requireUser } from "@/lib/http";

export const GET = route(async () => {
  const user = await requireUser();
  const outings = await prisma.outing.findMany({
    where: { group: { memberships: { some: { userId: user.id } } } },
    include: { group: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return ok({
    outings: outings.map((o) => ({
      id: o.id, title: o.title, status: o.status, date: o.date,
      rangeStart: o.rangeStart, rangeEnd: o.rangeEnd, groupId: o.groupId, groupName: o.group.name,
    })),
  });
});
