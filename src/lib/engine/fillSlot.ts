import type { PlacesProvider } from "@/lib/providers/types";
import { addMinutes, atLocal, dayOrderMinutes } from "@/lib/time";
import { estimateMinutes } from "./geo";
import type { Attendee, Film, LatLng, OpeningWindow, Slot, SlotKind, Stop, Venue } from "./types";

export const SEARCH_RADIUS_M: Record<SlotKind, number> = {
  cafe: 5000, restaurant: 5000, gaming: 6000, cinema: 7000, beach: 30000,
  park: 8000, museum: 10000, mall: 8000, viewpoint: 30000, street_food: 5000,
};

export const KIND_INTERESTS: Record<SlotKind, string[]> = {
  cafe: ["coffee", "brunch", "reading"],
  restaurant: ["fine dining", "brunch", "street food"],
  gaming: ["gaming", "board games", "sports"],
  cinema: ["movies", "art"],
  beach: ["nature", "photography", "sports"],
  park: ["nature", "sports", "photography", "reading"],
  museum: ["art", "history", "photography"],
  mall: ["shopping", "gaming"],
  viewpoint: ["photography", "nature"],
  street_food: ["street food", "craft beer"],
};

const GENRE_INTERESTS: Record<string, string[]> = {
  movies: [],
  art: ["Drama", "Documentary"],
  photography: ["Documentary"],
  history: ["History", "War", "Documentary"],
  gaming: ["Action", "Science Fiction", "Adventure"],
  "board games": ["Mystery", "Comedy"],
  sports: ["Action"],
  "live music": ["Music"],
  reading: ["Drama", "Mystery"],
};

export function isOpenDuring(opening: OpeningWindow | null, start: string, durationMin: number): boolean {
  if (!opening) return true;
  const s = dayOrderMinutes(start);
  return dayOrderMinutes(opening.open) <= s && s + durationMin <= dayOrderMinutes(opening.close);
}

const clamp = (n: number) => Math.max(0, Math.min(100, n));

export function scoreVenue(venue: Venue, attendees: Attendee[]): number {
  const times = attendees.map((a) => estimateMinutes(a.home, venue, a.transport));
  const spread = Math.max(...times) - Math.min(...times);
  const fairness = clamp(100 - spread * 1.5 - Math.max(0, Math.max(...times) - 45));
  const wanted = KIND_INTERESTS[venue.kind];
  const interest = (attendees.filter((a) => a.interests.some((i) => wanted.includes(i))).length / attendees.length) * 100;
  const rating = ((venue.rating ?? 3.5) / 5) * 100;
  const hoursKnown = venue.opening ? 100 : 70;
  return 0.45 * fairness + 0.25 * interest + 0.2 * rating + 0.1 * hoursKnown;
}

export function pickFilm(films: Film[], attendees: Attendee[]): Film | null {
  if (films.length === 0) return null;
  const wanted = new Set(attendees.flatMap((a) => a.interests.flatMap((i) => GENRE_INTERESTS[i] ?? [])));
  const score = (f: Film) => f.rating + 2 * f.genres.filter((g) => wanted.has(g)).length;
  return [...films].sort((a, b) => score(b) - score(a) || a.id - b.id)[0];
}

export async function fillSlot(args: {
  places: PlacesProvider;
  slot: Slot;
  date: string;
  area: LatLng;
  attendees: Attendee[];
  usedIds: Set<string>;
  films: Film[];
}): Promise<Stop | null> {
  const { slot } = args;
  const venues = await args.places.search(args.area, SEARCH_RADIUS_M[slot.kind], slot.kind);
  const candidates = venues.filter(
    (v) => !args.usedIds.has(v.id) && isOpenDuring(v.opening, slot.startTime, slot.durationMin)
  );
  if (candidates.length === 0) return null;

  const best = candidates
    .map((v) => ({ v, s: scoreVenue(v, args.attendees) }))
    .sort((a, b) => b.s - a.s || a.v.id.localeCompare(b.v.id))[0].v;

  const startsAt = atLocal(args.date, slot.startTime);
  return {
    slot,
    venue: best,
    film: slot.kind === "cinema" ? pickFilm(args.films, args.attendees) : null,
    startsAt: startsAt.toISOString(),
    endsAt: addMinutes(startsAt, slot.durationMin).toISOString(),
  };
}
