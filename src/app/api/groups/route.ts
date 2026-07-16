import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getUserId } from "@/lib/session";
import { makeInviteCode } from "@/lib/auth";

// List the current user's groups.
export async function GET() {
  const id = await getUserId();
  if (!id) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const groups = await prisma.group.findMany({
    where: { memberships: { some: { userId: id } } },
    include: { memberships: { include: { user: true } } },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ groups });
}

// Create a group; the creator is auto-added as the first member.
export async function POST(req: Request) {
  const id = await getUserId();
  if (!id) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const { name } = await req.json().catch(() => ({}));
  const groupName = typeof name === "string" ? name.trim() : "";
  if (!groupName) {
    return NextResponse.json({ error: "Name your group." }, { status: 400 });
  }

  // Retry a couple of times in the unlikely event of an invite-code collision.
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const group = await prisma.group.create({
        data: {
          name: groupName,
          inviteCode: makeInviteCode(),
          createdById: id,
          memberships: { create: { userId: id } },
        },
      });
      return NextResponse.json({ ok: true, group });
    } catch {
      // likely a unique-constraint clash on inviteCode — try again
    }
  }
  return NextResponse.json(
    { error: "Couldn't create the group. Try again." },
    { status: 500 }
  );
}
