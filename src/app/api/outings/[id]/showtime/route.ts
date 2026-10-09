import { z } from "zod";
import { prisma } from "@/lib/db";
import { route, ok, parseBody, requireUser, requireOutingMember, HttpError } from "@/lib/http";
import { requireStatus } from "@/lib/outings/permissions";
import { runRecalc } from "@/lib/outings/run";
import { runInBackground } from "@/lib/background";
import { HHMM_RE, atLocal } from "@/lib/time";
import type { Stop } from "@/lib/engine/types";

const Body = z.object({ stopIndex: z.number().int().min(0), time: z.string().regex(HHMM_RE, "Use HH:MM") });

export const POST = route<{ id: string }>(async (req, { params }) => {
  const user = await requireUser();
  const { id } = await params;
  const { outing, membership } = await requireOutingMember(id, user.id);
  requireStatus(outing, "locked");
  const b = await parseBody(req, Body);

  const rsvp = await prisma.rsvp.findUnique({ where: { outingId_userId: { outingId: id, userId: user.id } } });
  const manager = outing.createdById === user.id || membership.role === "admin";
  if (!manager && rsvp?.status !== "going") throw new HttpError(403, "Only people going can set the show time.");

  const option = await prisma.itineraryOption.findUniqueOrThrow({ where: { id: outing.lockedOptionId! } });
  const stops = option.stops as unknown as Stop[];
  if (stops[b.stopIndex]?.slot.kind !== "cinema") throw new HttpError(400, "That stop isn't a movie.");

  await prisma.showtimeOverride.upsert({
    where: { optionId_stopIndex: { optionId: option.id, stopIndex: b.stopIndex } },
    create: { optionId: option.id, stopIndex: b.stopIndex, startsAt: atLocal(outing.date!, b.time), enteredById: user.id },
    update: { startsAt: atLocal(outing.date!, b.time), enteredById: user.id },
  });
  await runInBackground(() => runRecalc(option.id));
  return ok({ ok: true });
});
