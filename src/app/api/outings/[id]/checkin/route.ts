import { z } from "zod";
import { prisma } from "@/lib/db";
import { route, ok, parseBody, requireUser, requireOutingMember, HttpError } from "@/lib/http";
import { requireStatus } from "@/lib/outings/permissions";
import { evaluateOuting } from "@/lib/outings/outcomes";
import { checkInOpensAt } from "@/lib/engine/outcome";

export const POST = route<{ id: string }>(async (req, { params }) => {
  const user = await requireUser();
  const { id } = await params;
  const { outing } = await requireOutingMember(id, user.id);
  requireStatus(outing, "locked");
  const { attended } = await parseBody(req, z.object({ attended: z.boolean() }));

  if (!outing.date || new Date() < checkInOpensAt(outing.date)) throw new HttpError(409, "Check-in opens on the day.");
  const rsvp = await prisma.rsvp.findUnique({ where: { outingId_userId: { outingId: id, userId: user.id } } });
  if (rsvp?.status !== "going") throw new HttpError(403, "Only people who were going can check in.");

  await prisma.checkIn.upsert({
    where: { outingId_userId: { outingId: id, userId: user.id } },
    create: { outingId: id, userId: user.id, attended },
    update: { attended },
  });
  const decided = await evaluateOuting(id);
  return ok({ ok: true, status: decided ?? "locked" });
});
