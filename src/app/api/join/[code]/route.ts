import { prisma } from "@/lib/db";
import { route, ok, requireUser, requireCompleteUser, HttpError } from "@/lib/http";

async function findByCode(code: string) {
  const group = await prisma.group.findUnique({
    where: { inviteCode: code.toUpperCase() },
    include: { _count: { select: { memberships: true } } },
  });
  if (!group) throw new HttpError(404, "Invite not found.");
  return group;
}

export const GET = route<{ code: string }>(async (_req, { params }) => {
  await requireUser();
  const group = await findByCode((await params).code);
  return ok({ group: { id: group.id, name: group.name, memberCount: group._count.memberships } });
});

export const POST = route<{ code: string }>(async (_req, { params }) => {
  const user = await requireCompleteUser();
  const group = await findByCode((await params).code);
  await prisma.membership.upsert({
    where: { userId_groupId: { userId: user.id, groupId: group.id } },
    create: { userId: user.id, groupId: group.id, role: "member" },
    update: {},
  });
  return ok({ ok: true, groupId: group.id });
});
