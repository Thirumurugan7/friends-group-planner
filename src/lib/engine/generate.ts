import type { Providers } from "@/lib/providers/types";
import { sketchDay } from "./sketchDay";
import { meetingArea } from "./meetingArea";
import { fillSlot } from "./fillSlot";
import { routeAll } from "./routeAll";
import { checkHomeBy, repair } from "./homeBy";
import { estimateCosts } from "./costs";
import { narrate } from "./narrate";
import type { Attendee, Evaluated, Film, OptionResult, ProgressStep, SlotKind, Stop, Theme } from "./types";

export const SUBSTITUTES: Record<SlotKind, SlotKind[]> = {
  beach: ["park", "viewpoint"],
  viewpoint: ["park"],
  gaming: ["mall", "cafe"],
  museum: ["mall", "park"],
  street_food: ["restaurant"],
  cinema: ["mall"],
  park: ["cafe"],
  mall: ["cafe"],
  cafe: ["restaurant"],
  restaurant: ["street_food"],
};

export class NoVenuesError extends Error {
  constructor() {
    super("No venues found for this plan.");
  }
}

const MAX_REPAIRS = 3;

async function routeAndCheck(providers: Providers, stops: Stop[], attendees: Attendee[], date: string) {
  const routes = await routeAll({ routes: providers.routes, stops, attendees });
  const homeByReport = checkHomeBy({ legs: routes, attendees, date });
  return { routes, homeByReport };
}

export async function generateOption(input: {
  providers: Providers;
  attendees: Attendee[];
  date: string;
  theme: Theme;
  onProgress?: (step: ProgressStep) => void | Promise<void>;
}): Promise<OptionResult> {
  const { providers, attendees, date, theme } = input;
  const progress = async (s: ProgressStep) => input.onProgress?.(s);

  await progress("sketching");
  const { slots } = await sketchDay(providers.llm, { theme, date, attendees });

  await progress("finding_venues");
  const area = meetingArea(attendees);
  const films: Film[] = slots.some((s) => s.kind === "cinema" || SUBSTITUTES[s.kind].includes("cinema"))
    ? await providers.movies.nowPlaying("IN").catch(() => [])
    : [];

  const usedIds = new Set<string>();
  let stops: Stop[] = [];
  for (const slot of slots) {
    let stop: Stop | null = null;
    for (const kind of [slot.kind, ...SUBSTITUTES[slot.kind]]) {
      stop = await fillSlot({
        places: providers.places, slot: { ...slot, kind }, date, area, attendees, usedIds, films,
      }).catch((err) => {
        console.warn(`[engine] fillSlot ${kind} failed`, err);
        return null;
      });
      if (stop) break;
    }
    if (stop) {
      stops.push(stop);
      usedIds.add(stop.venue.id);
    }
  }
  if (stops.length === 0) throw new NoVenuesError();

  await progress("routing");
  let evald = await routeAndCheck(providers, stops, attendees, date);

  await progress("checking_home");
  for (let i = 0; i < MAX_REPAIRS && evald.homeByReport.some((h) => !h.ok); i++) {
    const repaired = repair(stops);
    if (!repaired) break;
    stops = repaired;
    evald = await routeAndCheck(providers, stops, attendees, date);
  }

  await progress("costing");
  const costs = estimateCosts({ stops, legs: evald.routes, attendees });

  await progress("writing");
  const narrative = await narrate(providers.llm, { theme, stops, attendees, homeByReport: evald.homeByReport, costs });

  return {
    theme,
    stops,
    routes: evald.routes,
    homeByReport: evald.homeByReport,
    costs,
    narrative,
    approximateTransit: evald.routes.some((l) => l.route.approximate),
  };
}

export async function recalculateOption(input: {
  providers: Providers;
  stops: Stop[];
  attendees: Attendee[];
  date: string;
  theme: Theme;
}): Promise<Evaluated> {
  const { providers, stops, attendees, date, theme } = input;
  const { routes, homeByReport } = await routeAndCheck(providers, stops, attendees, date);
  const costs = estimateCosts({ stops, legs: routes, attendees });
  const narrative = await narrate(providers.llm, { theme, stops, attendees, homeByReport, costs });
  return { routes, homeByReport, costs, narrative, approximateTransit: routes.some((l) => l.route.approximate) };
}
