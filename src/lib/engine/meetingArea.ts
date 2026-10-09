import type { Attendee, LatLng } from "./types";
import { estimateMinutes } from "./geo";

const GRID = 9;

export function meetingArea(attendees: Pick<Attendee, "home" | "transport">[]): LatLng {
  if (attendees.length === 0) throw new Error("meetingArea needs attendees");
  if (attendees.length === 1) return { ...attendees[0].home };

  const lats = attendees.map((a) => a.home.lat);
  const lngs = attendees.map((a) => a.home.lng);
  const [minLat, maxLat] = [Math.min(...lats), Math.max(...lats)];
  const [minLng, maxLng] = [Math.min(...lngs), Math.max(...lngs)];

  let best: { p: LatLng; max: number; sum: number } | null = null;
  for (let i = 0; i < GRID; i++) {
    for (let j = 0; j < GRID; j++) {
      const p = {
        lat: minLat + ((maxLat - minLat) * i) / (GRID - 1),
        lng: minLng + ((maxLng - minLng) * j) / (GRID - 1),
      };
      const times = attendees.map((a) => estimateMinutes(a.home, p, a.transport));
      const max = Math.max(...times);
      const sum = times.reduce((s, t) => s + t, 0);
      if (!best || max < best.max || (max === best.max && sum < best.sum)) best = { p, max, sum };
    }
  }
  return best!.p;
}
