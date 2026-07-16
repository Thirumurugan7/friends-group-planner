import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getUserId } from "@/lib/session";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getUserId();
  if (!userId)
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const { id } = await params;
  const group = await prisma.group.findUnique({
    where: { id },
    include: { memberships: { include: { user: true }, orderBy: { joinedAt: "asc" } } },
  });

  if (!group)
    return NextResponse.json({ error: "Group not found." }, { status: 404 });

  const isMember = group.memberships.some((m) => m.userId === userId);
  if (!isMember)
    return NextResponse.json({ error: "You're not in this group." }, { status: 403 });

  return NextResponse.json({ group });
}
