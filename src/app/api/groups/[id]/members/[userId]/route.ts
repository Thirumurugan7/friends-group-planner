import { prisma } from "@/lib/db";
import { route, ok, requireUser, requireAdmin, HttpError } from "@/lib/http";

export const DELETE = route<{ id: string; userId: string }>(async (_req, { params }) => {
  const user = await requireUser();
  const { id, userId } = await params;
  await requireAdmin(id, user.id);
  if (userId === user.id) throw new HttpError(400, "You can't remove yourself.");
  const res = await prisma.membership.deleteMany({ where: { groupId: id, userId } });
  if (res.count === 0) throw new HttpError(404, "Not found.");
  return ok({ ok: true });
});
