import { normalizePhone } from "@/lib/otp";

export function toE164India(raw: string): string | null {
  let digits = normalizePhone(raw);
  if (digits.length === 10) digits = "91" + digits;
  if (digits.length === 12 && digits.startsWith("91")) return digits;
  return null;
}
