import { z } from "zod";
import { prisma } from "@/lib/db";
import { route, ok, parseBody, requireUser } from "@/lib/http";

const Sub = z.object({
  endpoint: z.string().url(),
  keys: z.object({ p256dh: z.string().min(1), auth: z.string().min(1) }),
});

export const POST = route(async (req) => {
  const user = await requireUser();
  const s = await parseBody(req, Sub);
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
