import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { generateState, generateCodeVerifier } from "arctic";
import { google } from "@/lib/google-auth";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const state = generateState();
  const verifier = generateCodeVerifier();
  const authUrl = google().createAuthorizationURL(state, verifier, ["openid", "profile", "email"]);

  const store = await cookies();
  const opts = { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax" as const, path: "/", maxAge: 600 };
  store.set("g_state", state, opts);
  store.set("g_verifier", verifier, opts);
  store.set("g_link", url.searchParams.get("link") === "1" ? "1" : "0", opts);
  return NextResponse.redirect(authUrl);
}
