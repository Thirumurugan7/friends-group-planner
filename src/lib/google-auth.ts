import { Google } from "arctic";
import type { User } from "@prisma/client";
import { prisma } from "@/lib/db";
import { HttpError } from "@/lib/http";

export function google() {
  const base = process.env.APP_URL ?? "http://localhost:3000";
  return new Google(
    process.env.GOOGLE_CLIENT_ID ?? "",
    process.env.GOOGLE_CLIENT_SECRET ?? "",
    `${base}/api/auth/google/callback`
  );
}

export interface GoogleClaims {
  sub: string;
  email: string;
  emailVerified: boolean;
  name?: string;
}

export async function resolveGoogleUser(c: GoogleClaims, currentUserId: string | null): Promise<User> {
  if (!c.emailVerified) throw new HttpError(400, "Your Google email isn't verified.");
  const email = c.email.trim().toLowerCase();
  const byGoogle = await prisma.user.findUnique({ where: { googleId: c.sub } });

  if (currentUserId) {
    if (byGoogle && byGoogle.id !== currentUserId) {
      throw new HttpError(409, "That Google account is linked to a different user.");
    }
    const me = await prisma.user.findUniqueOrThrow({ where: { id: currentUserId } });
    const emailOwner = await prisma.user.findUnique({ where: { email } });
    return prisma.user.update({
      where: { id: currentUserId },
      data: {
        googleId: c.sub,
        email: me.email ?? (emailOwner && emailOwner.id !== me.id ? undefined : email),
      },
    });
  }

  if (byGoogle) return byGoogle;

  const byEmail = await prisma.user.findUnique({ where: { email } });
  if (byEmail) return prisma.user.update({ where: { id: byEmail.id }, data: { googleId: c.sub } });

  return prisma.user.create({ data: { googleId: c.sub, email, name: c.name ?? null } });
}
