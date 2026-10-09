import { z } from "zod";
import { prisma } from "@/lib/db";
import { route, ok, parseBody, HttpError } from "@/lib/http";
import { hashOtp, normalizePhone, MAX_ATTEMPTS } from "@/lib/otp";
import { toE164India } from "@/lib/phone";
import { createSession } from "@/lib/session";
import { isProfileComplete } from "@/lib/profile";

const Body = z.object({ phone: z.string(), code: z.string() });

const expired = () => new HttpError(400, "This code expired. Request a new one.");

export const POST = route(async (req) => {
  const body = await parseBody(req, Body);
  const mobile = toE164India(body.phone);
  const entered = normalizePhone(body.code);
  if (!mobile || entered.length !== 4) throw new HttpError(400, "Invalid request.");

  const now = new Date();
  const challenge = await prisma.otpChallenge.findFirst({
    where: { phone: mobile },
    orderBy: { createdAt: "desc" },
  });
  if (!challenge || challenge.expiresAt <= now) throw expired();

  // Claim an attempt atomically before comparing, so parallel guesses can't exceed the limit.
  const claimed = await prisma.otpChallenge.updateMany({
    where: { id: challenge.id, attempts: { lt: MAX_ATTEMPTS }, expiresAt: { gt: now } },
    data: { attempts: { increment: 1 } },
  });
  if (claimed.count === 0) {
    const current = await prisma.otpChallenge.findUnique({ where: { id: challenge.id } });
    if (!current || current.expiresAt <= now) throw expired();
    throw new HttpError(429, "Too many tries. Request a new code.");
  }

  if (challenge.codeHash !== hashOtp(mobile, entered)) {
    throw new HttpError(401, "That code isn't right.");
  }

  // Consume this challenge exactly once (keep older rows for the rate-limit window).
  const consumed = await prisma.otpChallenge.updateMany({
    where: { id: challenge.id, expiresAt: { gt: now } },
    data: { expiresAt: new Date(0) },
  });
  if (consumed.count !== 1) throw expired();

  const user = await prisma.user.upsert({
    where: { phone: mobile },
    update: {},
    create: { phone: mobile },
  });
  await createSession(user.id);
  return ok({ ok: true, needsProfile: !isProfileComplete(user) });
});
