import type { Group, Member, VenueResult, Category } from "./types";

// ---------------------------------------------------------------------------
// Mock data. Schematic points use a normalized 0–1 space so the convergence
// map can render without real coordinates. Swap this module for real API data.
// ---------------------------------------------------------------------------

export const MOCK_MEMBERS: Member[] = [
  {
    id: "m1",
    name: "Aisha Khan",
    age: 27,
    line: "teal",
    home: { label: "Indiranagar", lat: 12.97, lng: 77.64 },
    work: { label: "Koramangala", lat: 12.93, lng: 77.62 },
    transport: "public",
    interests: ["coffee", "board games", "live music"],
    opennessToNew: 5,
    point: { lat: 0.22, lng: 0.28 },
    profileComplete: true,
  },
  {
    id: "m2",
    name: "Ravi Menon",
    age: 30,
    line: "coral",
    home: { label: "Whitefield", lat: 12.97, lng: 77.75 },
    work: { label: "Marathahalli", lat: 12.95, lng: 77.7 },
    transport: "own",
    interests: ["gaming", "craft beer", "street food"],
    opennessToNew: 3,
    point: { lat: 0.32, lng: 0.82 },
    profileComplete: true,
  },
  {
    id: "m3",
    name: "Meera Nair",
    age: 26,
    line: "violet",
    home: { label: "Jayanagar", lat: 12.93, lng: 77.58 },
    work: { label: "MG Road", lat: 12.97, lng: 77.61 },
    transport: "public",
    interests: ["cafes", "reading", "brunch"],
    opennessToNew: 4,
    point: { lat: 0.82, lng: 0.34 },
    profileComplete: true,
  },
  {
    id: "m4",
    name: "Dev Sharma",
    age: 29,
    line: "lime",
    home: { label: "HSR Layout", lat: 12.91, lng: 77.64 },
    work: { label: "Ecospace", lat: 12.92, lng: 77.68 },
    transport: "own",
    interests: ["gaming", "coffee", "photography"],
    opennessToNew: 2,
    point: { lat: 0.72, lng: 0.74 },
    profileComplete: true,
  },
  {
    id: "m5",
    name: "Sana Rao",
    age: 25,
    line: "sky",
    home: { label: "Malleshwaram", lat: 13.0, lng: 77.57 },
    work: { label: "Rajajinagar", lat: 12.99, lng: 77.55 },
    transport: "public",
    interests: ["brunch", "live music", "art"],
    opennessToNew: 5,
    point: { lat: 0.68, lng: 0.16 },
    profileComplete: false,
  },
];

export const MOCK_GROUP: Group = {
  id: "g1",
  name: "The Usual Suspects",
  inviteCode: "DUSK-7F2K",
  members: MOCK_MEMBERS,
};

// The fair meeting point on the schematic map (amber signal).
export const MEETING_POINT = { lat: 0.5, lng: 0.5 };

export const CATEGORIES: { id: Category; label: string; emoji: string; hint: string }[] = [
  { id: "cafe", label: "Cafe", emoji: "☕", hint: "Coffee & a catch-up" },
  { id: "restaurant", label: "Restaurant", emoji: "🍽️", hint: "Sit-down dinner" },
  { id: "gaming", label: "Gaming", emoji: "🎮", hint: "Arcade or board games" },
];

export const MOCK_RESULTS: VenueResult[] = [
  {
    id: "v1",
    name: "Third Wave Roastery",
    category: "cafe",
    area: "Domlur",
    rating: 4.6,
    priceLevel: 2,
    tags: ["specialty coffee", "quiet", "board games"],
    compatibility: 92,
    fairness: 88,
    point: { lat: 0.52, lng: 0.46 },
    blurb:
      "Central to almost everyone, with the board games Aisha and Ravi both wanted.",
    legs: [
      { memberId: "m1", distanceKm: 3.2, durationMin: 18, transport: "public" },
      { memberId: "m2", distanceKm: 9.1, durationMin: 26, transport: "own" },
      { memberId: "m3", distanceKm: 5.4, durationMin: 24, transport: "public" },
      { memberId: "m4", distanceKm: 6.0, durationMin: 19, transport: "own" },
      { memberId: "m5", distanceKm: 7.8, durationMin: 34, transport: "public" },
    ],
    swot: {
      strengths: [
        "Under 26 min for 4 of 5 members",
        "Board games match a shared interest",
        "High rating (4.6) with a calm room for talking",
      ],
      weaknesses: [
        "Sana's transit trip is the longest at 34 min",
        "Limited parking for Ravi and Dev",
      ],
      opportunities: [
        "Weekday mornings are near-empty — easy to get the big table",
      ],
      threats: ["Fills up fast after 5pm on weekends"],
    },
  },
  {
    id: "v2",
    name: "Loft & Ladder",
    category: "cafe",
    area: "Koramangala",
    rating: 4.4,
    priceLevel: 3,
    tags: ["brunch", "rooftop", "live music"],
    compatibility: 85,
    fairness: 79,
    point: { lat: 0.4, lng: 0.6 },
    blurb: "Rooftop brunch spot — great for Sana and Meera, a bit further for the north.",
    legs: [
      { memberId: "m1", distanceKm: 4.0, durationMin: 22, transport: "public" },
      { memberId: "m2", distanceKm: 7.5, durationMin: 21, transport: "own" },
      { memberId: "m3", distanceKm: 3.1, durationMin: 16, transport: "public" },
      { memberId: "m4", distanceKm: 3.8, durationMin: 13, transport: "own" },
      { memberId: "m5", distanceKm: 11.2, durationMin: 41, transport: "public" },
    ],
    swot: {
      strengths: [
        "Rooftop + live music fits three interest profiles",
        "Short hop for Meera and Dev",
      ],
      weaknesses: [
        "Sana crosses the city — 41 min",
        "Pricier ($$$) than the group average",
      ],
      opportunities: ["Live sets on Saturdays could turn it into a full evening"],
      threats: ["No reservations — can be a wait at peak brunch"],
    },
  },
  {
    id: "v3",
    name: "Cuppa Corner",
    category: "cafe",
    area: "Indiranagar",
    rating: 4.2,
    priceLevel: 1,
    tags: ["budget", "cozy", "reading"],
    compatibility: 78,
    fairness: 71,
    point: { lat: 0.3, lng: 0.34 },
    blurb: "Cheap and cheerful, closest to Aisha — the east side travels more.",
    legs: [
      { memberId: "m1", distanceKm: 0.9, durationMin: 6, transport: "public" },
      { memberId: "m2", distanceKm: 12.0, durationMin: 33, transport: "own" },
      { memberId: "m3", distanceKm: 7.2, durationMin: 31, transport: "public" },
      { memberId: "m4", distanceKm: 8.4, durationMin: 27, transport: "own" },
      { memberId: "m5", distanceKm: 6.1, durationMin: 28, transport: "public" },
    ],
    swot: {
      strengths: ["Easiest on wallets ($)", "6 min for Aisha"],
      weaknesses: [
        "Fairness dips — Ravi and Meera both cross 30 min",
        "Small room, gets loud",
      ],
      opportunities: ["Quiet enough on weekday afternoons for a long catch-up"],
      threats: ["Only seats about 8 — a full group may not fit at peak"],
    },
  },
];

export function resultsFor(_category: Category): VenueResult[] {
  // Mock returns the same curated set regardless of category.
  return MOCK_RESULTS;
}
