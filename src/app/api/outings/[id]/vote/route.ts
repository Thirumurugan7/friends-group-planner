import { z } from "zod";
import { prisma } from "@/lib/db";
import { route, ok, parseBody, requireUser, requireOutingMember, HttpError } from "@/lib/http";
import { requireStatus } from "@/lib/outings/permissions";

export const PUT = route<{ id: string }>(async (req, { params }) => {
  const user = await requireUser();
  const { id } = await params;
  const { outing } = await requireOutingMember(id, user.id);
  requireStatus(outing, "voting");
  const { optionId } = await parseBody(req, z.object({ optionId: z.string() }));
  const option = await prisma.itineraryOption.findUnique({ where: { id: optionId } });
  if (!option || option.outingId !== id || option.status !== "ready") throw new HttpError(400, "Pick one of this outing's options.");
  await prisma.vote.upsert({
    where: { outingId_userId: { outingId: id, userId: user.id } },
    create: { outingId: id, userId: user.id, optionId },
    update: { optionId },
  });
  return ok({ ok: true });
});
