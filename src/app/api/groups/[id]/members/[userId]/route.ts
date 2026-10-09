import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { route, ok, requireUser, requireAdmin, HttpError } from "@/lib/http";
import { makeInviteCode } from "@/lib/auth";

const ACTIVE = ["collecting", "voting", "locked"] as const;

export const DELETE = route<{ id: string; userId: string }>(async (_req, { params }) => {
  const user = await requireUser();
  const { id, userId } = await params;
  await requireAdmin(id, user.id);
  if (userId === user.id) throw new HttpError(400, "You can't remove yourself.");

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await prisma.$transaction(async (tx) => {
        const res = await tx.membership.deleteMany({ where: { groupId: id, userId } });
        if (res.count === 0) throw new HttpError(404, "Not found.");
        // Rotate the invite so the removed member can't simply rejoin with the old link.
        await tx.group.update({ where: { id }, data: { inviteCode: makeInviteCode() } });
        const active = { groupId: id, status: { in: [...ACTIVE] } };
        await tx.vote.deleteMany({ where: { userId, outing: active } });
        await tx.rsvp.deleteMany({ where: { userId, outing: active } });
      });
      return ok({ ok: true });
    } catch (err) {
      const collision = err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
      if (!collision) throw err;
    }
  }
  throw new HttpError(500, "Couldn't remove that member. Try again.");
});
