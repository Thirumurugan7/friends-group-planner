import { z } from "zod";
import { prisma } from "@/lib/db";
import { route, ok, parseBody, requireUser, requireOutingMember, HttpError } from "@/lib/http";
import { requireStatus } from "@/lib/outings/permissions";
import { runRecalc } from "@/lib/outings/run";
import { notifyGroup } from "@/lib/outings/notify";
import { runInBackground } from "@/lib/background";

const Body = z.object({
  status: z.enum(["going", "maybe", "no", "cancelled"]),
  reason: z.string().trim().max(200).optional(),
});

export const PUT = route<{ id: string }>(async (req, { params }) => {
  const user = await requireUser();
  const { id } = await params;
  const { outing } = await requireOutingMember(id, user.id);
  requireStatus(outing, "voting", "locked");
  const b = await parseBody(req, Body);

  const prev = await prisma.rsvp.findUnique({ where: { outingId_userId: { outingId: id, userId: user.id } } });
  if (b.status === "cancelled" && !(outing.status === "locked" && prev?.status === "going")) {
    throw new HttpError(400, "You can only cancel after the plan is locked and you said you're going.");
  }

  const cancelling = b.status === "cancelled";
  await prisma.rsvp.upsert({
    where: { outingId_userId: { outingId: id, userId: user.id } },
    create: { outingId: id, userId: user.id, status: b.status },
    update: {
      status: b.status,
      cancelledAt: cancelling ? new Date() : null,
      cancelReason: cancelling ? b.reason ?? null : null,
    },
  });

  const goingChanged = (prev?.status === "going") !== (b.status === "going");
  if (outing.status === "locked" && goingChanged && outing.lockedOptionId) {
    const optionId = outing.lockedOptionId;
    await runInBackground(async () => {
      await runRecalc(optionId);
      if (cancelling) {
        await notifyGroup(outing.groupId, user.id, {
          title: outing.title,
          body: `${user.name ?? "Someone"} can't make it. The plan has been updated.`,
          url: `/outings/${id}`,
        });
      }
    });
  }
  return ok({ ok: true });
});
