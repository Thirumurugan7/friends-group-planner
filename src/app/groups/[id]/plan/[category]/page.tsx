import { redirect, notFound } from "next/navigation";
import PlanResults from "@/components/PlanResults";
import { prisma } from "@/lib/db";
import { getUserId } from "@/lib/session";
import { toDisplayMembers } from "@/lib/display";
import type { Category } from "@/lib/types";

const VALID: Category[] = ["cafe", "restaurant", "gaming"];

export default async function PlanPage({
  params,
}: {
  params: Promise<{ id: string; category: string }>;
}) {
  const userId = await getUserId();
  if (!userId) redirect("/signin");

  const { id, category } = await params;
  if (!VALID.includes(category as Category)) notFound();

  const group = await prisma.group.findUnique({
    where: { id },
    include: {
      memberships: { include: { user: true }, orderBy: { joinedAt: "asc" } },
    },
  });
  if (!group) notFound();
  if (!group.memberships.some((m) => m.userId === userId))
    redirect(`/join/${group.inviteCode}`);

  return (
    <PlanResults
      groupId={group.id}
      groupName={group.name}
      category={category as Category}
      members={toDisplayMembers(group.memberships.map((m) => m.user))}
    />
  );
}
