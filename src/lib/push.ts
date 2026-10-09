import webpush from "web-push";
import { prisma } from "@/lib/db";

export interface PushPayload { title: string; body: string; url: string }

export function pushConfigured(): boolean {
  return Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

export async function sendPush(userIds: string[], payload: PushPayload): Promise<number> {
  if (!pushConfigured() || userIds.length === 0) return 0;
  try {
    webpush.setVapidDetails(
      process.env.VAPID_CONTACT ?? "mailto:admin@example.com",
      process.env.VAPID_PUBLIC_KEY!,
      process.env.VAPID_PRIVATE_KEY!
    );
    const subs = await prisma.pushSubscription.findMany({ where: { userId: { in: userIds } } });
    let sent = 0;
    await Promise.all(
      subs.map(async (s) => {
        try {
          await webpush.sendNotification(
            { endpoint: s.endpoint, keys: s.keys as { p256dh: string; auth: string } },
            JSON.stringify(payload)
          );
          sent++;
        } catch (err) {
          const code = (err as { statusCode?: number }).statusCode;
          if (code === 404 || code === 410) {
            await prisma.pushSubscription.delete({ where: { id: s.id } }).catch(() => {});
          } else {
            console.warn("[push] send failed", code);
          }
        }
      })
    );
    return sent;
  } catch (err) {
    console.error("[push] failed", err);
    return 0;
  }
}
