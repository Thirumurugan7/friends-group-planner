import type { RoutesProvider } from "@/lib/providers/types";
import { addMinutes } from "@/lib/time";
import type { Attendee, LatLng, Leg, LegEnd, Stop } from "./types";

export async function routeAll(args: { routes: RoutesProvider; stops: Stop[]; attendees: Attendee[] }): Promise<Leg[]> {
  const { routes, stops } = args;
  const at = (e: LegEnd, a: Attendee): LatLng => (e === "home" ? a.home : stops[e as number].venue);

  const perAttendee = await Promise.all(
    args.attendees.map(async (a) => {
      const legs: Leg[] = [];

      // home → first stop: arrive exactly at the start.
      const firstStart = new Date(stops[0].startsAt);
      const first = await routes.route(a.home, at(0, a), a.transport, addMinutes(firstStart, -60));
      legs.push({
        attendeeId: a.id, from: "home", to: 0, mode: a.transport,
        departAt: new Date(firstStart.getTime() - first.durationS * 1000).toISOString(),
        arriveAt: firstStart.toISOString(), route: first,
      });

      for (let i = 0; i < stops.length - 1; i++) {
        const depart = new Date(stops[i].endsAt);
        const r = await routes.route(at(i, a), at(i + 1, a), a.transport, depart);
        legs.push({
          attendeeId: a.id, from: i, to: i + 1, mode: a.transport,
          departAt: depart.toISOString(),
          arriveAt: new Date(depart.getTime() + r.durationS * 1000).toISOString(), route: r,
        });
      }

      const lastIdx = stops.length - 1;
      const leave = new Date(stops[lastIdx].endsAt);
      const home = await routes.route(at(lastIdx, a), a.home, a.transport, leave);
      legs.push({
        attendeeId: a.id, from: lastIdx, to: "home", mode: a.transport,
        departAt: leave.toISOString(),
        arriveAt: new Date(leave.getTime() + home.durationS * 1000).toISOString(), route: home,
      });
      return legs;
    })
  );
  return perAttendee.flat();
}
