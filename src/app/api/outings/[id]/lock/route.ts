import { z } from "zod";
import { prisma } from "@/lib/db";
import { route, ok, parseBody, requireUser, requireOutingMember, HttpError } from "@/lib/http";
import { requireOrganiser, requireStatus } from "@/lib/outings/permissions";
import { runRecalc } from "@/lib/outings/run";
import { notifyGroup } from "@/lib/outings/notify";
import { runInBackground } from "@/lib/background";

export const POST = route<{ id: string }>(async (req, { params }) => {
  const user = await requireUser();
  const { id } = await params;
  const { outing, membership } = await requireOutingMember(id, user.id);
  requireOrganiser(outing, user.id, membership.role);
  requireStatus(outing, "voting");
  const { optionId } = await parseBody(req, z.object({ optionId: z.string().optional() }));

  const ready = await prisma.itineraryOption.findMany({
    where: { outingId: id, status: "ready" },
    include: { _count: { select: { votes: true } } },
  });
  if (ready.length === 0) throw new HttpError(400, "There are no ready options to lock.");

  let chosen: string;
  if (optionId) {
    if (!ready.some((o) => o.id === optionId)) throw new HttpError(400, "Pick one of this outing's options.");
    chosen = optionId;
  } else {
    const top = Math.max(...ready.map((o) => o._count.votes));
    const tied = ready.filter((o) => o._count.votes === top);
    if (tied.length > 1) return ok({ error: "It's a tie — pick one.", tiedOptionIds: tied.map((o) => o.id) }, 409);
    chosen = tied[0].id;
  }

  const going = await prisma.rsvp.count({
    where: { outingId: id, status: "going", user: { memberships: { some: { groupId: outing.groupId } } } },
  });
  if (going < 2) throw new HttpError(400, "At least 2 people need to say they're going.");

  await prisma.outing.update({ where: { id }, data: { status: "locked", lockedOptionId: chosen } });
  await runInBackground(async () => {
    await runRecalc(chosen);
    await notifyGroup(outing.groupId, user.id, { title: outing.title, body: "The plan is locked in!", url: `/outings/${id}` });
  });
  return ok({ ok: true, optionId: chosen });
});
