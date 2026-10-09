import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getProviders, type Providers } from "@/lib/providers";
import { generateOption, NoVenuesError, recalculateOption } from "@/lib/engine/generate";
import type { Stop, Theme } from "@/lib/engine/types";
import { loadAttendees } from "./attendees";
import { applyShowtimes } from "./showtimes";
import { notifyGroup } from "./notify";

const j = (v: unknown) => v as Prisma.InputJsonValue;

export async function runGeneration(outingId: string, providers: Providers = getProviders()): Promise<void> {
  const outing = await prisma.outing.findUniqueOrThrow({ where: { id: outingId } });
  const attendees = await loadAttendees(outing, "free");
  const options = await prisma.itineraryOption.findMany({ where: { outingId, status: "generating" } });

  await Promise.all(
    options.map(async (opt) => {
      try {
        const r = await generateOption({
          providers, attendees, date: outing.date!, theme: opt.theme as Theme,
          onProgress: async (step) => {
            await prisma.itineraryOption.update({ where: { id: opt.id }, data: { progress: step } });
          },
        });
        await prisma.itineraryOption.update({
          where: { id: opt.id },
          data: {
            status: "ready", progress: null, error: null,
            stops: j(r.stops), routes: j(r.routes), costs: j(r.costs), homeByReport: j(r.homeByReport),
            narrative: r.narrative ? j(r.narrative) : Prisma.JsonNull,
            approximateTransit: r.approximateTransit,
          },
        });
      } catch (err) {
        console.error("[generate] option failed", opt.id, err);
        await prisma.itineraryOption
          .update({
            where: { id: opt.id },
            data: {
              status: "failed", progress: null,
              error: err instanceof NoVenuesError
                ? "We couldn't find places for this plan near your group."
                : "The planner couldn't finish this option. Try again.",
            },
          })
          .catch(() => {}); // option may have been replaced by a newer generate
      }
    })
  );

  await notifyGroup(outing.groupId, null, {
    title: outing.title, body: "Plan options are ready — vote now.", url: `/outings/${outing.id}`,
  });
}

export async function runRecalc(optionId: string, providers: Providers = getProviders()): Promise<void> {
  const opt = await prisma.itineraryOption.findUnique({
    where: { id: optionId },
    include: { outing: true, showtimes: true },
  });
  if (!opt || opt.status !== "ready" || !opt.outing.date) return;
  const attendees = await loadAttendees(opt.outing, "going");
  if (attendees.length === 0) return;

  const stops = applyShowtimes(opt.stops as unknown as Stop[], opt.showtimes);
  const ev = await recalculateOption({ providers, stops, attendees, date: opt.outing.date, theme: opt.theme as Theme });
  await prisma.itineraryOption.update({
    where: { id: optionId },
    data: {
      stops: j(stops), routes: j(ev.routes), costs: j(ev.costs), homeByReport: j(ev.homeByReport),
      narrative: ev.narrative ? j(ev.narrative) : Prisma.JsonNull,
      approximateTransit: ev.approximateTransit,
    },
  });
}
