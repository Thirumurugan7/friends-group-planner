import type { Stop } from "@/lib/engine/types";
import { addMinutes, localHHMM } from "@/lib/time";

export function applyShowtimes(stops: Stop[], overrides: { stopIndex: number; startsAt: Date }[]): Stop[] {
  return stops.map((s, i) => {
    const o = overrides.find((x) => x.stopIndex === i);
    if (!o) return s;
    return {
      ...s,
      slot: { ...s.slot, startTime: localHHMM(o.startsAt) },
      startsAt: o.startsAt.toISOString(),
      endsAt: addMinutes(o.startsAt, s.slot.durationMin).toISOString(),
    };
  });
}
