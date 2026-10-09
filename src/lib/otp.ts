import { createHash, randomInt } from "node:crypto";
import { fakesEnabled } from "@/lib/fakes";
import { appSecret } from "@/lib/secret";

const OTP_TTL_MS = 5 * 60 * 1000; // 5 minutes
const MAX_ATTEMPTS = 5;

export { OTP_TTL_MS, MAX_ATTEMPTS };

export const OTP_RATE_LIMIT = { max: 3, windowMs: 15 * 60 * 1000 };
export const OTP_DAILY_LIMIT = { max: 10, windowMs: 24 * 3600 * 1000 };

/** Four-digit numeric code. */
export function generateOtp(): string {
  if (fakesEnabled()) return "1234";
  return String(randomInt(1000, 10000));
}

/** Salted hash so raw codes never touch the database. */
export function hashOtp(phone: string, code: string): string {
  const salt = appSecret("dev-salt");
  return createHash("sha256").update(`${salt}:${phone}:${code}`).digest("hex");
}

/** Normalize to digits only, keeping a country code if present. */
export function normalizePhone(input: string): string {
  return input.replace(/\D/g, "");
}

/**
 * Send an OTP over SMS via apitxt. Returns true on success.
 * Real network call — no mock.
 */
export async function sendOtpSms(phone: string, code: string): Promise<boolean> {
  if (fakesEnabled()) return true;
  const authkey = process.env.APITXT_AUTHKEY;
  if (!authkey) throw new Error("APITXT_AUTHKEY is not set");

  const url = new URL("https://apitxt.com/api/sendOTP");
  url.searchParams.set("authkey", authkey);
  url.searchParams.set("mobile", phone);
  url.searchParams.set("otp", code);

  const res = await fetch(url, { method: "GET" });
  const body = await res.text();
  if (!res.ok) {
    console.error("apitxt sendOTP failed", res.status, body);
    return false;
  }
  // apitxt returns a small JSON/text payload; treat non-error responses as sent.
  return !/error|invalid|fail/i.test(body);
}
