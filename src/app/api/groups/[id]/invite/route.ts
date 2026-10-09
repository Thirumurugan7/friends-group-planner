import { prisma } from "@/lib/db";
import { route, ok, requireUser, requireAdmin, HttpError } from "@/lib/http";
import { makeInviteCode } from "@/lib/auth";

export const POST = route<{ id: string }>(async (_req, { params }) => {
  const user = await requireUser();
  const { id } = await params;
  await requireAdmin(id, user.id);
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const g = await prisma.group.update({ where: { id }, data: { inviteCode: makeInviteCode() } });
      return ok({ inviteCode: g.inviteCode });
    } catch {
      // collision — retry
    }
  }
  throw new HttpError(500, "Couldn't make a new link. Try again.");
});
