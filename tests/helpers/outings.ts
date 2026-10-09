import { prisma } from "@/lib/db";
import { addMinutes, localDate } from "@/lib/time";
import { makeCompleteUser, makeGroup } from "./factories";

export const dayFromNow = (n: number) => localDate(addMinutes(new Date(), n * 24 * 60));

/** Admin + 2 members, a collecting outing over the next week, all free on day +3. */
export async function outingFixture(opts: { confirm?: boolean } = {}) {
  const admin = await makeCompleteUser({ name: "Admin Person", homeLat: 12.90123, homeLng: 77.60123 });
  const b = await makeCompleteUser({ name: "Bea", gender: "female", homeLat: 13.00456, homeLng: 77.65456 });
  const c = await makeCompleteUser({ name: "Cy", transport: "own", homeLat: 12.95789, homeLng: 77.70789 });
  const group = await makeGroup(admin.id, [b.id, c.id]);
  const date = dayFromNow(3);
  const outing = await prisma.outing.create({
    data: {
      groupId: group.id, createdById: admin.id, title: "Weekend",
      rangeStart: dayFromNow(1), rangeEnd: dayFromNow(7),
      date: opts.confirm ? date : null,
    },
  });
  await prisma.availability.createMany({
    data: [admin, b, c].map((u) => ({ outingId: outing.id, userId: u.id, date, free: true })),
  });
  return { admin, b, c, group, outing, date };
}
