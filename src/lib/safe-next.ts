/**
 * Only allow same-site paths as post-sign-in destinations ("/groups", "/join/X").
 * Rejects absolute URLs, protocol-relative "//host", "/\host", and control characters
 * (browsers strip tabs/newlines, turning "/\t/host" into "//host").
 */
export function safeNext(v: string | null | undefined, fallback = "/groups"): string {
  if (!v || !v.startsWith("/") || v.startsWith("//") || v.startsWith("/\\")) return fallback;
  if (/[\u0000-\u001f\u007f\\]/.test(v)) return fallback;
  return v;
}
