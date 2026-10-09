import { z } from "zod";
import { prisma } from "@/lib/db";
import { route, ok, parseBody, requireUser, requireOutingMember, HttpError } from "@/lib/http";
import { requireStatus } from "@/lib/outings/permissions";
import { DATE_RE, datesInRange } from "@/lib/time";

const Body = z.object({ free: z.array(z.string().regex(DATE_RE)).max(14) });

export const PUT = route<{ id: string }>(async (req, { params }) => {
  const user = await requireUser();
  const { id } = await params;
  const { outing } = await requireOutingMember(id, user.id);
  requireStatus(outing, "collecting");
  const { free } = await parseBody(req, Body);

  const range = datesInRange(outing.rangeStart, outing.rangeEnd);
  if (free.some((d) => !range.includes(d))) throw new HttpError(400, "That date isn't in this outing's range.");

  await prisma.$transaction([
    prisma.availability.deleteMany({ where: { outingId: id, userId: user.id } }),
    prisma.availability.createMany({
      data: range.map((date) => ({ outingId: id, userId: user.id, date, free: free.includes(date) })),
    }),
  ]);
  return ok({ ok: true });
});
