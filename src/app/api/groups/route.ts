import { z } from "zod";
import { prisma } from "@/lib/db";
import { route, ok, parseBody, requireUser, requireCompleteUser, HttpError } from "@/lib/http";
import { makeInviteCode } from "@/lib/auth";

export const GET = route(async () => {
  const user = await requireUser();
  const memberships = await prisma.membership.findMany({
    where: { userId: user.id },
    include: { group: { include: { _count: { select: { memberships: true } } } } },
    orderBy: { joinedAt: "desc" },
  });
  return ok({
    groups: memberships.map((m) => ({
      id: m.group.id,
      name: m.group.name,
      memberCount: m.group._count.memberships,
      role: m.role,
    })),
  });
});

const Create = z.object({ name: z.string().trim().min(1, "Name your group.").max(60) });

export const POST = route(async (req) => {
  const user = await requireCompleteUser();
  const { name } = await parseBody(req, Create);
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const group = await prisma.group.create({
        data: {
          name,
          inviteCode: makeInviteCode(),
          createdById: user.id,
          memberships: { create: { userId: user.id, role: "admin" } },
        },
      });
      return ok({ ok: true, group: { id: group.id } });
    } catch {
      // invite code collision — retry
    }
  }
  throw new HttpError(500, "Couldn't create the group. Try again.");
});
