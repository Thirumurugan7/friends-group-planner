import { z } from "zod";
import { prisma } from "@/lib/db";
import { route, ok, parseBody, HttpError } from "@/lib/http";
import { hashOtp, normalizePhone, MAX_ATTEMPTS } from "@/lib/otp";
import { toE164India } from "@/lib/phone";
import { createSession } from "@/lib/session";
import { isProfileComplete } from "@/lib/profile";

const Body = z.object({ phone: z.string(), code: z.string() });

export const POST = route(async (req) => {
  const body = await parseBody(req, Body);
  const mobile = toE164India(body.phone);
  const entered = normalizePhone(body.code);
  if (!mobile || entered.length !== 4) throw new HttpError(400, "Invalid request.");

  const challenge = await prisma.otpChallenge.findFirst({
    where: { phone: mobile },
    orderBy: { createdAt: "desc" },
  });
  if (!challenge || challenge.expiresAt < new Date()) {
    throw new HttpError(400, "This code expired. Request a new one.");
  }
  if (challenge.attempts >= MAX_ATTEMPTS) throw new HttpError(429, "Too many tries. Request a new code.");

  if (challenge.codeHash !== hashOtp(mobile, entered)) {
    await prisma.otpChallenge.update({ where: { id: challenge.id }, data: { attempts: { increment: 1 } } });
    throw new HttpError(401, "That code isn't right.");
  }

  // Consume this challenge (keep older rows for the rate-limit window).
  await prisma.otpChallenge.update({ where: { id: challenge.id }, data: { expiresAt: new Date(0) } });

  const user =
    (await prisma.user.findUnique({ where: { phone: mobile } })) ??
    (await prisma.user.create({ data: { phone: mobile } }));
  await createSession(user.id);
  return ok({ ok: true, needsProfile: !isProfileComplete(user) });
});
