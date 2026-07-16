import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getUserId } from "@/lib/session";
import { generatePlan, type AiMemberInput } from "@/lib/groq";
import type { Category } from "@/lib/types";

const VALID: Category[] = ["cafe", "restaurant", "gaming"];

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getUserId();
  if (!userId)
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const { id } = await params;
  const { category } = await req.json().catch(() => ({}));
  if (!VALID.includes(category)) {
    return NextResponse.json({ error: "Pick a valid category." }, { status: 400 });
  }

  const group = await prisma.group.findUnique({
    where: { id },
    include: { memberships: { include: { user: true } } },
  });
  if (!group)
    return NextResponse.json({ error: "Group not found." }, { status: 404 });
  if (!group.memberships.some((m) => m.userId === userId))
    return NextResponse.json({ error: "You're not in this group." }, { status: 403 });

  const members: AiMemberInput[] = group.memberships.map((m) => ({
    name: m.user.name ?? "A friend",
    homeArea: m.user.homeLabel ?? "unknown",
    workArea: m.user.workLabel ?? "unknown",
    transport: m.user.transport,
    interests: m.user.interests,
    openness: m.user.openness,
  }));

  try {
    const ai = await generatePlan(members, category);
    const plan = await prisma.plan.create({
      data: {
        groupId: group.id,
        category,
        createdById: userId,
        results: ai as object,
      },
    });
    return NextResponse.json({ ok: true, planId: plan.id, ...ai });
  } catch (err) {
    console.error("plan generation failed", err);
    return NextResponse.json(
      { error: "The planner couldn't finish. Try again." },
      { status: 502 }
    );
  }
}
