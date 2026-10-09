import { route, ok, requireUser, requireOutingMember } from "@/lib/http";
import { outingView } from "@/lib/outings/view";

export const GET = route<{ id: string }>(async (_req, { params }) => {
  const user = await requireUser();
  const { id } = await params;
  await requireOutingMember(id, user.id);
  return ok(await outingView(id, user.id));
});
