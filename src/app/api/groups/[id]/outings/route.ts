import { z } from "zod";
import { prisma } from "@/lib/db";
import { route, ok, parseBody, requireCompleteUser, requireMember, HttpError } from "@/lib/http";
import { DATE_RE, HHMM_RE, datesInRange, localDate } from "@/lib/time";

const Body = z.object({
  title: z.string().trim().min(1, "Give the outing a name.").max(60),
  rangeStart: z.string().regex(DATE_RE),
  rangeEnd: z.string().regex(DATE_RE),
  groupHomeBy: z.string().regex(HHMM_RE).nullable(),
});

export const POST = route<{ id: string }>(async (req, { params }) => {
  const user = await requireCompleteUser();
  const { id } = await params;
  await requireMember(id, user.id);
  const b = await parseBody(req, Body);

  if (b.rangeStart < localDate(new Date())) throw new HttpError(400, "Pick dates from today onward.");
  if (b.rangeEnd < b.rangeStart) throw new HttpError(400, "The end date is before the start date.");
  if (datesInRange(b.rangeStart, b.rangeEnd).length > 14) throw new HttpError(400, "Pick a range of 14 days or fewer.");

  const outing = await prisma.outing.create({
    data: { groupId: id, createdById: user.id, ...b },
  });
  return ok({ outing: { id: outing.id } }, 201);
});
