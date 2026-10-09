import { prisma } from "@/lib/db";
import { route, ok, requireUser, requireOutingMember, HttpError } from "@/lib/http";

export const DELETE = route<{ id: string; expenseId: string }>(async (_req, { params }) => {
  const user = await requireUser();
  const { id, expenseId } = await params;
  const { membership } = await requireOutingMember(id, user.id);
  const expense = await prisma.expense.findUnique({ where: { id: expenseId } });
  if (!expense || expense.outingId !== id) throw new HttpError(404, "Not found.");
  if (expense.paidById !== user.id && membership.role !== "admin") {
    throw new HttpError(403, "Only the person who paid or the admin can remove this.");
  }
  await prisma.expense.delete({ where: { id: expenseId } });
  return ok({ ok: true });
});
