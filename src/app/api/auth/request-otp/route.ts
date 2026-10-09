import { z } from "zod";
import { prisma } from "@/lib/db";
import { route, ok, parseBody, HttpError } from "@/lib/http";
import { generateOtp, hashOtp, sendOtpSms, OTP_TTL_MS, OTP_RATE_LIMIT } from "@/lib/otp";
import { toE164India } from "@/lib/phone";

const Body = z.object({ phone: z.string() });

export const POST = route(async (req) => {
  const { phone } = await parseBody(req, Body);
  const mobile = toE164India(phone);
  if (!mobile) throw new HttpError(400, "Enter a valid 10-digit mobile number.");

  const since = new Date(Date.now() - OTP_RATE_LIMIT.windowMs);
  const recent = await prisma.otpChallenge.count({ where: { phone: mobile, createdAt: { gte: since } } });
  if (recent >= OTP_RATE_LIMIT.max) {
    throw new HttpError(429, "Too many codes. Try again in a few minutes.");
  }

  // Keep recent rows for rate limiting; drop day-old ones.
  await prisma.otpChallenge.deleteMany({
    where: { phone: mobile, createdAt: { lt: new Date(Date.now() - 24 * 3600_000) } },
  });

  const code = generateOtp();
  await prisma.otpChallenge.create({
    data: { phone: mobile, codeHash: hashOtp(mobile, code), expiresAt: new Date(Date.now() + OTP_TTL_MS) },
  });

  if (!(await sendOtpSms(mobile, code))) {
    throw new HttpError(502, "Couldn't send the code. Try again in a moment.");
  }
  return ok({ ok: true });
});
