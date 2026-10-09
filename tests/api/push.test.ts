import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import webpush from "web-push";
import { resetDb } from "../helpers/db";
import { asUser, call } from "../helpers/http";
import { makeCompleteUser, makeGroup } from "../helpers/factories";
import { POST as subscribe, DELETE as unsubscribe } from "@/app/api/push/subscribe/route";
import { sendPush } from "@/lib/push";
import { notifyGroup } from "@/lib/outings/notify";
import { prisma } from "@/lib/db";

const sub = { endpoint: "https://fcm.googleapis.com/fcm/send/abc", keys: { p256dh: "p", auth: "a" } };

describe("push", () => {
  beforeEach(async () => {
    await resetDb();
    vi.stubEnv("VAPID_PUBLIC_KEY", "pub");
    vi.stubEnv("VAPID_PRIVATE_KEY", "priv");
    vi.mocked(webpush.sendNotification).mockClear();
  });
  afterEach(() => vi.unstubAllEnvs());

  it("stores a subscription for the signed-in user", async () => {
    const u = await makeCompleteUser();
    await asUser(u.id);
    expect((await call(subscribe, { method: "POST", body: sub })).status).toBe(200);
    expect(await prisma.pushSubscription.count({ where: { userId: u.id } })).toBe(1);
    expect((await call(unsubscribe, { method: "DELETE", body: { endpoint: sub.endpoint } })).status).toBe(200);
    expect(await prisma.pushSubscription.count()).toBe(0);
  });

  it("sends to group members except the actor", async () => {
    const a = await makeCompleteUser();
    const b = await makeCompleteUser();
    const g = await makeGroup(a.id, [b.id]);
    await prisma.pushSubscription.create({ data: { userId: a.id, endpoint: "https://p/a", keys: sub.keys } });
    await prisma.pushSubscription.create({ data: { userId: b.id, endpoint: "https://p/b", keys: sub.keys } });
    await notifyGroup(g.id, a.id, { title: "t", body: "b", url: "/x" });
    expect(webpush.sendNotification).toHaveBeenCalledTimes(1);
    expect(vi.mocked(webpush.sendNotification).mock.calls[0][0]).toMatchObject({ endpoint: "https://p/b" });
  });

  it("drops gone subscriptions", async () => {
    const a = await makeCompleteUser();
    await prisma.pushSubscription.create({ data: { userId: a.id, endpoint: "https://p/gone", keys: sub.keys } });
    vi.mocked(webpush.sendNotification).mockRejectedValueOnce({ statusCode: 410 });
    expect(await sendPush([a.id], { title: "t", body: "b", url: "/" })).toBe(0);
    expect(await prisma.pushSubscription.count()).toBe(0);
  });

  it("is a no-op without VAPID keys", async () => {
    vi.stubEnv("VAPID_PRIVATE_KEY", "");
    const a = await makeCompleteUser();
    await prisma.pushSubscription.create({ data: { userId: a.id, endpoint: "https://p/a", keys: sub.keys } });
    expect(await sendPush([a.id], { title: "t", body: "b", url: "/" })).toBe(0);
    expect(webpush.sendNotification).not.toHaveBeenCalled();
  });

  it("accepts known push services only", async () => {
    const u = await makeCompleteUser();
    await asUser(u.id);
    for (const endpoint of [
      "https://updates.push.services.mozilla.com/wpush/v2/x",
      "https://web.push.apple.com/x",
      "https://wns2-par02p.notify.windows.com/w/?token=x",
    ]) {
      expect((await call(subscribe, { method: "POST", body: { ...sub, endpoint } })).status).toBe(200);
    }
    for (const endpoint of [
      "http://127.0.0.1/x",
      "https://169.254.169.254/latest/meta-data",
      "http://fcm.googleapis.com/fcm/send/abc",
      "https://fcm.googleapis.com.evil.com/x",
      "https://evilpush.apple.com.attacker.io/x",
    ]) {
      const res = await call(subscribe, { method: "POST", body: { ...sub, endpoint } });
      expect(res.status).toBe(400);
      expect(res.json.error).toBe("Unsupported push service.");
    }
    expect(await prisma.pushSubscription.count()).toBe(3);
  });
});
