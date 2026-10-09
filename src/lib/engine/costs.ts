import type { Attendee, CostLine, Leg, SlotKind, Stop } from "./types";

export const ENTRY_PAISE: Partial<Record<SlotKind, number>> = { cinema: 25000, gaming: 30000, museum: 5000 };
export const FOOD_PAISE: Record<1 | 2 | 3 | 4, number> = { 1: 15000, 2: 35000, 3: 70000, 4: 140000 };
const FOOD_SHARE: Partial<Record<SlotKind, number>> = { restaurant: 1, street_food: 1, cafe: 0.5 };
const DEFAULT_LEVEL: Partial<Record<SlotKind, 1 | 2 | 3 | 4>> = { street_food: 1 };
export const FARE_BASE_PAISE = 1000;
export const FARE_PER_KM_PAISE = 150;
export const FUEL_PER_KM_PAISE = 700;

const r100 = (n: number) => Math.round(n / 100) * 100;

export function estimateCosts(args: { stops: Stop[]; legs: Leg[]; attendees: Attendee[] }): CostLine[] {
  const entry = r100(args.stops.reduce((s, st) => s + (ENTRY_PAISE[st.slot.kind] ?? 0), 0));
  const food = r100(
    args.stops.reduce((s, st) => {
      const share = FOOD_SHARE[st.slot.kind];
      if (!share) return s;
      const level = st.venue.priceLevel ?? DEFAULT_LEVEL[st.slot.kind] ?? 2;
      return s + FOOD_PAISE[level] * share;
    }, 0)
  );
  return args.attendees.map((a) => {
    const travel = r100(
      args.legs
        .filter((l) => l.attendeeId === a.id)
        .reduce((s, l) => {
          const km = l.route.distanceM / 1000;
          return s + (a.transport === "public" ? FARE_BASE_PAISE + FARE_PER_KM_PAISE * km : FUEL_PER_KM_PAISE * km);
        }, 0)
    );
    return { attendeeId: a.id, entry, food, travel, total: entry + food + travel };
  });
}
