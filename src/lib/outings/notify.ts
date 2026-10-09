import { prisma } from "@/lib/db";
import { sendPush, type PushPayload } from "@/lib/push";

export async function notifyGroup(groupId: string, exceptUserId: string | null, payload: PushPayload) {
  try {
    const members = await prisma.membership.findMany({ where: { groupId }, select: { userId: true } });
    await sendPush(members.map((m) => m.userId).filter((id) => id !== exceptUserId), payload);
  } catch (err) {
    console.error("[notify] failed", err);
  }
}
