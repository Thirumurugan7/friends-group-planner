import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getUserId } from "@/lib/session";

export async function GET() {
  const id = await getUserId();
  if (!id) return NextResponse.json({ user: null }, { status: 200 });

  const user = await prisma.user.findUnique({
    where: { id },
    include: {
      memberships: { include: { group: { include: { memberships: true } } } },
    },
  });

  return NextResponse.json({ user });
}
