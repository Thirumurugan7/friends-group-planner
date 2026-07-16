import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { hashOtp, normalizePhone, MAX_ATTEMPTS } from "@/lib/otp";
import { createSession } from "@/lib/session";

function toE164India(raw: string): string | null {
  let digits = normalizePhone(raw);
  if (digits.length === 10) digits = "91" + digits;
  if (digits.length === 12 && digits.startsWith("91")) return digits;
  return null;
}

export async function POST(req: Request) {
  const { phone, code } = await req.json().catch(() => ({}));
  const mobile = toE164India(String(phone ?? ""));
  const entered = normalizePhone(String(code ?? ""));

  if (!mobile || entered.length !== 4) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const challenge = await prisma.otpChallenge.findFirst({
    where: { phone: mobile },
    orderBy: { createdAt: "desc" },
  });

  if (!challenge || challenge.expiresAt < new Date()) {
    return NextResponse.json(
      { error: "This code expired. Request a new one." },
      { status: 400 }
    );
  }

  if (challenge.attempts >= MAX_ATTEMPTS) {
    return NextResponse.json(
      { error: "Too many tries. Request a new code." },
      { status: 429 }
    );
  }

  if (challenge.codeHash !== hashOtp(mobile, entered)) {
    await prisma.otpChallenge.update({
      where: { id: challenge.id },
      data: { attempts: { increment: 1 } },
    });
    return NextResponse.json({ error: "That code isn't right." }, { status: 401 });
  }

  // Verified — consume the challenge and upsert the user.
  await prisma.otpChallenge.deleteMany({ where: { phone: mobile } });

  const existing = await prisma.user.findUnique({ where: { phone: mobile } });
  const user =
    existing ??
    (await prisma.user.create({ data: { phone: mobile } }));

  await createSession(user.id);

  return NextResponse.json({
    ok: true,
    isNew: !existing || !existing.name,
  });
}
