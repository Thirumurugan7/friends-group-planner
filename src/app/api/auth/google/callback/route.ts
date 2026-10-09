import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { decodeIdToken } from "arctic";
import { HttpError } from "@/lib/http";
import { google, resolveGoogleUser } from "@/lib/google-auth";
import { createSession, getUserId } from "@/lib/session";
import { isProfileComplete } from "@/lib/profile";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const base = process.env.APP_URL ?? url.origin;
  const fail = NextResponse.redirect(`${base}/signin?error=google`);

  const store = await cookies();
  const state = store.get("g_state")?.value;
  const verifier = store.get("g_verifier")?.value;
  const linking = store.get("g_link")?.value === "1";
  store.delete("g_state");
  store.delete("g_verifier");
  store.delete("g_link");

  const code = url.searchParams.get("code");
  if (!code || !state || !verifier || url.searchParams.get("state") !== state) return fail;

  try {
    const tokens = await google().validateAuthorizationCode(code, verifier);
    const claims = decodeIdToken(tokens.idToken()) as {
      sub: string; email: string; email_verified: boolean; name?: string;
    };
    const user = await resolveGoogleUser(
      { sub: claims.sub, email: claims.email, emailVerified: claims.email_verified, name: claims.name },
      linking ? await getUserId() : null
    );
    await createSession(user.id);
    if (linking) return NextResponse.redirect(`${base}/profile?linked=google`);
    return NextResponse.redirect(`${base}${isProfileComplete(user) ? "/groups" : "/onboarding"}`);
  } catch (err) {
    console.error("[google] callback failed:", err instanceof Error ? err.message : "unknown");
    if (!linking && err instanceof HttpError && err.status === 409) {
      return NextResponse.redirect(`${base}/signin?error=google-email`);
    }
    return fail;
  }
}
