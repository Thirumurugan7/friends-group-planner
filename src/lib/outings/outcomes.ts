import { prisma } from "@/lib/db";
import { evaluateOutcome } from "@/lib/engine/outcome";
import { addMinutes, localDate } from "@/lib/time";
import { sendPush } from "@/lib/push";

async function goingIds(outingId: string, groupId: string) {
  const rows = await prisma.rsvp.findMany({
    where: { outingId, status: "going", user: { memberships: { some: { groupId } } } },
    select: { userId: true },
  });
  return rows.map((r) => r.userId);
}

export async function evaluateOuting(outingId: string, now = new Date()) {
  const outing = await prisma.outing.findUniqueOrThrow({ where: { id: outingId }, include: { checkIns: true } });
  if (outing.status !== "locked" || !outing.date) return null;
  const result = evaluateOutcome({
    date: outing.date,
    goingIds: await goingIds(outing.id, outing.groupId),
    checkIns: outing.checkIns,
    now,
  });
  if (result) await prisma.outing.update({ where: { id: outing.id }, data: { status: result } });
  return result;
}

export async function runDailyOutcomes(now = new Date()) {
  const today = localDate(now);
  const yesterday = localDate(addMinutes(now, -24 * 60));
  const due = await prisma.outing.findMany({ where: { status: "locked", date: { lt: today } } });

  let decided = 0;
  let reminded = 0;
  for (const o of due) {
    if (await evaluateOuting(o.id, now)) {
      decided++;
      continue;
    }
    if (o.date === yesterday) {
      const going = await goingIds(o.id, o.groupId);
      const answered = new Set(
        (await prisma.checkIn.findMany({ where: { outingId: o.id }, select: { userId: true } })).map((c) => c.userId)
      );
      reminded += await sendPush(going.filter((id) => !answered.has(id)), {
        title: o.title, body: "Did you go? Tap to check in.", url: `/outings/${o.id}`,
      });
    }
  }
  return { decided, reminded };
}
