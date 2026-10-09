/**
 * The app secret used to sign sessions and salt OTP hashes.
 * Production must set SESSION_SECRET; dev/test fall back to the given default.
 */
export function appSecret(devDefault: string): string {
  const s = process.env.SESSION_SECRET;
  if (s) return s;
  if (process.env.NODE_ENV === "production") {
    throw new Error("SESSION_SECRET must be set in production");
  }
  return devDefault;
}
