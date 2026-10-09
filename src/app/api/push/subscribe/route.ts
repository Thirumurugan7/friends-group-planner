import { z } from "zod";
import { prisma } from "@/lib/db";
import { route, ok, parseBody, requireUser, HttpError } from "@/lib/http";

const PUSH_HOSTS = ["fcm.googleapis.com", "updates.push.services.mozilla.com"];
const PUSH_HOST_SUFFIXES = [".push.services.mozilla.com", ".push.apple.com", ".notify.windows.com"];

/** Only real browser push services — never let the server POST to arbitrary hosts. */
function isPushService(endpoint: string): boolean {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  if (url.protocol !== "https:") return false;
  const host = url.hostname.toLowerCase();
  return PUSH_HOSTS.includes(host) || PUSH_HOST_SUFFIXES.some((s) => host.endsWith(s));
}

const Sub = z.object({
  endpoint: z.string().url(),
  keys: z.object({ p256dh: z.string().min(1), auth: z.string().min(1) }),
});

export const POST = route(async (req) => {
  const user = await requireUser();
  const s = await parseBody(req, Sub);
  if (!isPushService(s.endpoint)) throw new HttpError(400, "Unsupported push service.");
  await prisma.pushSubscription.upsert({
    where: { endpoint: s.endpoint },
    create: { userId: user.id, endpoint: s.endpoint, keys: s.keys },
    update: { userId: user.id, keys: s.keys },
  });
  return ok({ ok: true });
});

export const DELETE = route(async (req) => {
  const user = await requireUser();
  const { endpoint } = await parseBody(req, z.object({ endpoint: z.string() }));
  await prisma.pushSubscription.deleteMany({ where: { endpoint, userId: user.id } });
  return ok({ ok: true });
});
