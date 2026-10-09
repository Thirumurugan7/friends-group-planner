import { z } from "zod";
import { prisma } from "@/lib/db";
import { route, ok, parseBody, HttpError } from "@/lib/http";
import {
  generateOtp, hashOtp, sendOtpSms, OTP_TTL_MS, OTP_RATE_LIMIT, OTP_DAILY_LIMIT,
} from "@/lib/otp";
import { toE164India } from "@/lib/phone";

const Body = z.object({ phone: z.string() });

export const POST = route(async (req) => {
  const { phone } = await parseBody(req, Body);
  const mobile = toE164India(phone);
  if (!mobile) throw new HttpError(400, "Enter a valid 10-digit mobile number.");

  const code = generateOtp();
  // Count-then-create under a per-phone advisory lock so parallel requests can't exceed the limits.
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${mobile}))`;
    const now = Date.now();
    const dayAgo = new Date(now - OTP_DAILY_LIMIT.windowMs);

    const recent = await tx.otpChallenge.count({
      where: { phone: mobile, createdAt: { gte: new Date(now - OTP_RATE_LIMIT.windowMs) } },
    });
    if (recent >= OTP_RATE_LIMIT.max) {
      throw new HttpError(429, "Too many codes. Try again in a few minutes.");
    }
    const today = await tx.otpChallenge.count({ where: { phone: mobile, createdAt: { gte: dayAgo } } });
    if (today >= OTP_DAILY_LIMIT.max) {
      throw new HttpError(429, "Too many codes today. Try again tomorrow.");
    }

    // Keep recent rows for rate limiting; drop day-old ones.
    await tx.otpChallenge.deleteMany({ where: { phone: mobile, createdAt: { lt: dayAgo } } });
    await tx.otpChallenge.create({
      data: { phone: mobile, codeHash: hashOtp(mobile, code), expiresAt: new Date(now + OTP_TTL_MS) },
    });
  });

  if (!(await sendOtpSms(mobile, code))) {
    throw new HttpError(502, "Couldn't send the code. Try again in a moment.");
  }
  return ok({ ok: true });
});
