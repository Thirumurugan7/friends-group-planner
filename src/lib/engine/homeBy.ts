import { addMinutes, atLocal } from "@/lib/time";
import type { Attendee, HomeByEntry, Leg, Stop } from "./types";

export function checkHomeBy(args: { legs: Leg[]; attendees: Attendee[]; date: string }): HomeByEntry[] {
  return args.attendees.map((a) => {
    const leg = args.legs.find((l) => l.attendeeId === a.id && l.to === "home");
    if (!leg) throw new Error(`no home leg for ${a.id}`);
    const arrive = new Date(leg.arriveAt);
    const late = a.deadline ? arrive > atLocal(args.date, a.deadline) : false;
    const reason = leg.route.noService ? "no_service" : late ? "late" : null;
    return { attendeeId: a.id, deadline: a.deadline, arriveHomeAt: leg.arriveAt, ok: reason === null, reason };
  });
}

export function repair(stops: Stop[]): Stop[] | null {
  if (stops.length > 1) return stops.slice(0, -1);
  const only = stops[0];
  if (!only || only.slot.durationMin < 90) return null;
  const durationMin = only.slot.durationMin - 30;
  return [{
    ...only,
    slot: { ...only.slot, durationMin },
    endsAt: addMinutes(new Date(only.startsAt), durationMin).toISOString(),
  }];
}
