import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { route, ok, requireUser, requireOutingMember, HttpError } from "@/lib/http";
import { requireOrganiser, requireStatus } from "@/lib/outings/permissions";
import { loadAttendees } from "@/lib/outings/attendees";
import { runGeneration } from "@/lib/outings/run";
import { runInBackground } from "@/lib/background";
import { THEMES } from "@/lib/engine/types";

const STALE_MS = 10 * 60 * 1000;

// Generation runs in after(), which on Vercel is bounded by this route's max duration.
export const maxDuration = 300;

export const POST = route<{ id: string }>(async (_req, { params }) => {
  const user = await requireUser();
  const { id } = await params;
  const { outing, membership } = await requireOutingMember(id, user.id);
  requireOrganiser(outing, user.id, membership.role);
  requireStatus(outing, "collecting", "voting");
  if (!outing.date) throw new HttpError(400, "Confirm a date first.");

  // A run that died (restart/hang) leaves options stuck "generating" — release them after 10 minutes.
  await prisma.itineraryOption.updateMany({
    where: { outingId: id, status: "generating", updatedAt: { lt: new Date(Date.now() - STALE_MS) } },
    data: { status: "failed", progress: null, error: "The planner timed out. Try again." },
  });

  const busy = await prisma.itineraryOption.count({ where: { outingId: id, status: "generating" } });
  if (busy > 0) throw new HttpError(409, "Options are already being generated.");

  const attendees = await loadAttendees(outing, "free");
  if (attendees.length < 2) {
    throw new HttpError(400, "At least 2 people with complete profiles need to be free on that date.");
  }

  const optionIds = await prisma
    .$transaction(
    async (tx) => {
      const again = await tx.itineraryOption.count({ where: { outingId: id, status: "generating" } });
      if (again > 0) throw new HttpError(409, "Options are already being generated.");
      await tx.itineraryOption.deleteMany({ where: { outingId: id } }); // cascades votes
      const created = await Promise.all(
        THEMES.map((theme) => tx.itineraryOption.create({ data: { outingId: id, theme, status: "generating" } }))
      );
      await tx.outing.update({ where: { id }, data: { status: "voting" } });
      return created.map((o) => o.id);
    },
    { isolationLevel: "Serializable" }
    )
    .catch((err) => {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2034") {
        throw new HttpError(409, "Options are already being generated.");
      }
      throw err;
    });

  await runInBackground(() => runGeneration(id));
  return ok({ optionIds }, 202);
});
