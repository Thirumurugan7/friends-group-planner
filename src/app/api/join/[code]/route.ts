import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getUserId } from "@/lib/session";

// Preview a group by invite code (name + members) so the join page can render.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params;
  const group = await prisma.group.findUnique({
    where: { inviteCode: code.toUpperCase() },
    include: { memberships: { include: { user: true } } },
  });
  if (!group)
    return NextResponse.json({ error: "Invite not found." }, { status: 404 });

  return NextResponse.json({
    group: {
      id: group.id,
      name: group.name,
      inviteCode: group.inviteCode,
      members: group.memberships.map((m) => ({
        id: m.user.id,
        name: m.user.name,
      })),
    },
  });
}

// Join the group with the current session user.
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  const userId = await getUserId();
  if (!userId)
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const { code } = await params;
  const group = await prisma.group.findUnique({
    where: { inviteCode: code.toUpperCase() },
  });
  if (!group)
    return NextResponse.json({ error: "Invite not found." }, { status: 404 });

  await prisma.membership.upsert({
    where: { userId_groupId: { userId, groupId: group.id } },
    create: { userId, groupId: group.id },
    update: {},
  });

  return NextResponse.json({ ok: true, groupId: group.id });
}
