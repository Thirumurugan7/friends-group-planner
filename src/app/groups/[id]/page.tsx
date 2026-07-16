import { redirect, notFound } from "next/navigation";
import GroupHome from "@/components/GroupHome";
import { prisma } from "@/lib/db";
import { getUserId } from "@/lib/session";
import { toDisplayMembers } from "@/lib/display";

export default async function GroupPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const userId = await getUserId();
  if (!userId) redirect("/signin");

  const { id } = await params;
  const group = await prisma.group.findUnique({
    where: { id },
    include: {
      memberships: { include: { user: true }, orderBy: { joinedAt: "asc" } },
    },
  });

  if (!group) notFound();
  if (!group.memberships.some((m) => m.userId === userId)) {
    // Not a member — bounce to the join flow for this group.
    redirect(`/join/${group.inviteCode}`);
  }

  return (
    <GroupHome
      group={{
        id: group.id,
        name: group.name,
        inviteCode: group.inviteCode,
        members: toDisplayMembers(group.memberships.map((m) => m.user)),
      }}
    />
  );
}
