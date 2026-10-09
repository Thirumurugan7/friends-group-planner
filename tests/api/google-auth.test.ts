import { describe, it, expect, beforeEach } from "vitest";
import { resetDb } from "../helpers/db";
import { makeUser, makeCompleteUser } from "../helpers/factories";
import { asUser } from "../helpers/http";
import { resolveGoogleUser } from "@/lib/google-auth";
import { GET as callback } from "@/app/api/auth/google/callback/route";
import { prisma } from "@/lib/db";

const claims = { sub: "g-123", email: "Friend@Gmail.com", emailVerified: true, name: "Friend" };

describe("resolveGoogleUser", () => {
  beforeEach(resetDb);

  it("creates a new user with lowercased email", async () => {
    const u = await resolveGoogleUser(claims, null);
    expect(u.googleId).toBe("g-123");
    expect(u.email).toBe("friend@gmail.com");
    expect(u.name).toBe("Friend");
  });

  it("returns the existing user for a known googleId", async () => {
    const a = await resolveGoogleUser(claims, null);
    const b = await resolveGoogleUser(claims, null);
    expect(b.id).toBe(a.id);
  });

  it("links to an existing account with the same email", async () => {
    const existing = await makeCompleteUser({ email: "friend@gmail.com" });
    const u = await resolveGoogleUser(claims, null);
    expect(u.id).toBe(existing.id);
    expect(u.googleId).toBe("g-123");
  });

  it("links to the signed-in user when linking from profile", async () => {
    const me = await makeUser();
    const u = await resolveGoogleUser(claims, me.id);
    expect(u.id).toBe(me.id);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: me.id } })).email).toBe("friend@gmail.com");
  });

  it("refuses to link a Google account owned by someone else", async () => {
    await resolveGoogleUser(claims, null);
    const me = await makeUser();
    await expect(resolveGoogleUser(claims, me.id)).rejects.toThrow(/different user/);
  });

  it("refuses unverified emails", async () => {
    await expect(resolveGoogleUser({ ...claims, emailVerified: false }, null)).rejects.toThrow(/verified/);
  });
});

describe("google callback", () => {
  it("redirects to sign-in on state mismatch", async () => {
    await asUser(null);
    (globalThis as any).__jar.set("g_state", "expected");
    (globalThis as any).__jar.set("g_verifier", "v");
    const res = await callback(new Request("http://localhost:3200/api/auth/google/callback?code=c&state=wrong"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/signin?error=google");
  });
});
