import { describe, it, expect, beforeEach, vi } from "vitest";
import webpush from "web-push";
import { resetDb } from "../helpers/db";
import { asUser, call } from "../helpers/http";
import { outingFixture, dayFromNow } from "../helpers/outings";
import { POST as checkin } from "@/app/api/outings/[id]/checkin/route";
import { evaluateOuting, runDailyOutcomes } from "@/lib/outings/outcomes";
import { prisma } from "@/lib/db";

async function lockedInPast(daysAgo: number) {
  const f = await outingFixture({ confirm: true });
  await prisma.outing.update({ where: { id: f.outing.id }, data: { status: "locked", date: dayFromNow(-daysAgo) } });
  for (const u of [f.admin, f.b, f.c]) {
    await prisma.rsvp.create({ data: { outingId: f.outing.id, userId: u.id, status: "going" } });
  }
  return f;
}

describe("check-in and outcomes", () => {
  beforeEach(resetDb);

  it("refuses check-in before the day", async () => {
    const f = await outingFixture({ confirm: true });
    await prisma.outing.update({ where: { id: f.outing.id }, data: { status: "locked" } });
    await prisma.rsvp.create({ data: { outingId: f.outing.id, userId: f.b.id, status: "going" } });
    await asUser(f.b.id);
    expect((await call(checkin, { method: "POST", params: { id: f.outing.id }, body: { attended: true } })).status).toBe(409);
  });

  it("only people going can check in", async () => {
    const f = await lockedInPast(1);
    await prisma.rsvp.update({ where: { outingId_userId: { outingId: f.outing.id, userId: f.c.id } }, data: { status: "cancelled" } });
    await asUser(f.c.id);
    expect((await call(checkin, { method: "POST", params: { id: f.outing.id }, body: { attended: true } })).status).toBe(403);
  });

  it("completes once half of the going people confirm", async () => {
    const f = await lockedInPast(2);
    await asUser(f.admin.id);
    const first = await call(checkin, { method: "POST", params: { id: f.outing.id }, body: { attended: true } });
    expect(first.json.status).toBe("locked"); // 1 of 3
    await asUser(f.b.id);
    const second = await call(checkin, { method: "POST", params: { id: f.outing.id }, body: { attended: true } });
    expect(second.json.status).toBe("completed");
  });

  it("fails when everyone says no", async () => {
    const f = await lockedInPast(2);
    for (const u of [f.admin, f.b, f.c]) {
      await asUser(u.id);
      await call(checkin, { method: "POST", params: { id: f.outing.id }, body: { attended: false } });
    }
    expect((await prisma.outing.findUniqueOrThrow({ where: { id: f.outing.id } })).status).toBe("failed");
  });

  it("daily job fails silent outings after 3 days and reminds yesterday's", async () => {
    vi.stubEnv("VAPID_PUBLIC_KEY", "pub");
    vi.stubEnv("VAPID_PRIVATE_KEY", "priv");
    vi.mocked(webpush.sendNotification).mockClear();
    const old = await lockedInPast(5);
    const recent = await lockedInPast(1);
    await prisma.pushSubscription.create({ data: { userId: recent.b.id, endpoint: "https://p/b", keys: { p256dh: "p", auth: "a" } } });

    const res = await runDailyOutcomes();
    expect(res.decided).toBe(1);
    expect((await prisma.outing.findUniqueOrThrow({ where: { id: old.outing.id } })).status).toBe("failed");
    expect((await prisma.outing.findUniqueOrThrow({ where: { id: recent.outing.id } })).status).toBe("locked");
    expect(res.reminded).toBe(1);
    vi.unstubAllEnvs();
  });

  it("evaluateOuting ignores non-locked outings", async () => {
    const f = await outingFixture({ confirm: true });
    expect(await evaluateOuting(f.outing.id)).toBeNull();
  });
});
