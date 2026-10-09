import GroupHome from "@/components/group/GroupHome";

export default async function GroupPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <GroupHome groupId={id} />;
}
