import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  generateOtp,
  hashOtp,
  normalizePhone,
  sendOtpSms,
  OTP_TTL_MS,
} from "@/lib/otp";

function toE164India(raw: string): string | null {
  let digits = normalizePhone(raw);
  if (digits.length === 10) digits = "91" + digits;
  if (digits.length === 12 && digits.startsWith("91")) return digits;
  return null;
}

export async function POST(req: Request) {
  const { phone } = await req.json().catch(() => ({}));
  const mobile = toE164India(String(phone ?? ""));
  if (!mobile) {
    return NextResponse.json(
      { error: "Enter a valid 10-digit mobile number." },
      { status: 400 }
    );
  }

  const code = generateOtp();

  // One live challenge per phone — clear stale ones first.
  await prisma.otpChallenge.deleteMany({ where: { phone: mobile } });
  await prisma.otpChallenge.create({
    data: {
      phone: mobile,
      codeHash: hashOtp(mobile, code),
      expiresAt: new Date(Date.now() + OTP_TTL_MS),
    },
  });

  const sent = await sendOtpSms(mobile, code);
  if (!sent) {
    return NextResponse.json(
      { error: "Couldn't send the code. Try again in a moment." },
      { status: 502 }
    );
  }

  return NextResponse.json({ ok: true });
}
