import { z } from "zod";
import { prisma } from "@/lib/db";
import { route, ok, parseBody, requireUser, requireOutingMember } from "@/lib/http";
import { requireOrganiser, requireStatus } from "@/lib/outings/permissions";
import { notifyGroup } from "@/lib/outings/notify";
import { runInBackground } from "@/lib/background";

export const POST = route<{ id: string }>(async (req, { params }) => {
  const user = await requireUser();
  const { id } = await params;
  const { outing, membership } = await requireOutingMember(id, user.id);
  requireOrganiser(outing, user.id, membership.role);
  requireStatus(outing, "collecting", "voting", "locked");
  const { reason } = await parseBody(req, z.object({ reason: z.string().trim().max(200).optional() }));
  await prisma.outing.update({ where: { id }, data: { status: "cancelled", cancelReason: reason ?? null } });
  await runInBackground(() =>
    notifyGroup(outing.groupId, user.id, {
      title: outing.title, body: `Cancelled${reason ? `: ${reason}` : ""}`, url: `/outings/${id}`,
    })
  );
  return ok({ ok: true });
});
