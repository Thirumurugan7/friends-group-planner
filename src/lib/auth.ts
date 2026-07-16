import { prisma } from "@/lib/db";
import { getUserId } from "@/lib/session";

/** The signed-in user, or null. Use in route handlers. */
export async function currentUser() {
  const id = await getUserId();
  if (!id) return null;
  return prisma.user.findUnique({ where: { id } });
}

/** Short shareable invite code, e.g. "DUSK-7F2K". */
export function makeInviteCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no ambiguous chars
  let s = "";
  for (let i = 0; i < 4; i++)
    s += alphabet[Math.floor(Math.random() * alphabet.length)];
  return `DUSK-${s}`;
}
