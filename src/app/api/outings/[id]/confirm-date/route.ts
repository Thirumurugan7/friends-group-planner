import { z } from "zod";
import { prisma } from "@/lib/db";
import { route, ok, parseBody, requireUser, requireOutingMember, HttpError } from "@/lib/http";
import { requireOrganiser, requireStatus } from "@/lib/outings/permissions";
import { DATE_RE, datesInRange } from "@/lib/time";

const Body = z.object({ date: z.string().regex(DATE_RE) });

export const POST = route<{ id: string }>(async (req, { params }) => {
  const user = await requireUser();
  const { id } = await params;
  const { outing, membership } = await requireOutingMember(id, user.id);
  requireOrganiser(outing, user.id, membership.role);
  requireStatus(outing, "collecting");
  const { date } = await parseBody(req, Body);
  if (!datesInRange(outing.rangeStart, outing.rangeEnd).includes(date)) {
    throw new HttpError(400, "That date isn't in this outing's range.");
  }
  await prisma.outing.update({ where: { id }, data: { date } });
  return ok({ ok: true });
});
