import { z } from "zod";
import { prisma } from "@/lib/db";
import { route, ok, parseBody, requireUser, requireOutingMember, HttpError } from "@/lib/http";
import { requireStatus } from "@/lib/outings/permissions";

const Body = z.object({
  amount: z.number().int("Amount must be in whole paise.").min(1, "Enter an amount.").max(10_000_000),
  note: z.string().trim().min(1, "What was it for?").max(80),
  stopIndex: z.number().int().min(0).nullable(),
  splitAmong: z.array(z.string()).min(1, "Split with at least one person."),
});

export const POST = route<{ id: string }>(async (req, { params }) => {
  const user = await requireUser();
  const { id } = await params;
  const { outing } = await requireOutingMember(id, user.id);
  requireStatus(outing, "locked", "completed", "failed");
  const b = await parseBody(req, Body);

  const members = new Set(
    (await prisma.membership.findMany({ where: { groupId: outing.groupId }, select: { userId: true } })).map((m) => m.userId)
  );
  if (b.splitAmong.some((uid) => !members.has(uid))) throw new HttpError(400, "Split only among group members.");

  const expense = await prisma.expense.create({
    data: { outingId: id, paidById: user.id, amount: b.amount, note: b.note, stopIndex: b.stopIndex, splitAmong: [...new Set(b.splitAmong)] },
  });
  return ok({ expense: { id: expense.id } }, 201);
});
