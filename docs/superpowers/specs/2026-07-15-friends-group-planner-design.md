# Friends Group Planner — Design Spec

**Date:** 2026-07-15
**Status:** Approved (design), pending implementation plan

## Problem

Friends who live and work in different parts of the same city struggle to plan
meetups (cafe / restaurant / gaming) that are fair and convenient for everyone.
Figuring out a venue that balances everyone's travel, transport mode, and
interests is tedious. This app finds the optimal venue and plan for the whole
group, with per-person routes, travel time/distance, and a compatibility
("SWOT") analysis.

## Goals

- Group coordination via shareable invite links, backed by real accounts.
- Rich member profiles (locations, transport, interests, openness).
- Recommend the best venues for a chosen category, ranked by a fair,
  transport-aware scoring engine over real map data.
- Per-person routes, distance, and duration for each option.
- A readable, group-level compatibility + SWOT analysis per top option.
- A polished, intuitive, mobile-first UI.

## Non-Goals (for now)

- Payments / bookings / reservations.
- In-app chat/messaging.
- Multi-city or cross-city planning.
- Native mobile apps (responsive web only).

## Tech Stack

- **Next.js (App Router) + TypeScript + Tailwind CSS** — UI and API routes.
- **framer-motion** — transitions and motion polish.
- **Prisma ORM + Neon Postgres** — `provider = "postgresql"`, `DATABASE_URL` from env.
- **Leaflet + OpenStreetMap tiles** — map rendering.
- **OSRM / OpenRouteService** — routing: distance & duration for driving,
  walking, and public transport.
- **Overpass API (OSM) + Foursquare free tier** — venue candidate discovery.
- **Groq API (Llama 3.3 70B)** — narrative SWOT and tie-break reasoning.
- **apitxt.com `sendOTP`** — phone-number OTP delivery.

### Secrets (env only, gitignored — never committed)

```
DATABASE_URL=<neon postgres url>
GROQ_API_KEY=<groq key>
APITXT_AUTHKEY=<apitxt auth key>
FOURSQUARE_API_KEY=<optional, free tier>
```

All three provided secrets were shared in plaintext during design and should be
**rotated** before this repo is shared or made public.

## Data Model (Prisma)

- **User** — `id`, `phone` (unique), `name`, `age`, `homeLat/homeLng/homeLabel`,
  `workLat/workLng/workLabel`, `transportMode` (`public` | `own`),
  `interests` (string[] tags), `opennessToNew` (int scale 1–5), timestamps.
- **Group** — `id`, `name`, `inviteCode` (unique, for share link), `createdById`,
  timestamps.
- **Membership** — `id`, `userId`, `groupId` (unique pair), `joinedAt`.
- **Plan** — `id`, `groupId`, `category` (`cafe` | `restaurant` | `gaming`),
  `scheduledFor` (nullable), `results` (JSON: ranked venues + scores + routes +
  SWOT), `createdById`, `createdAt`. Results are cached on the record.
- **OtpChallenge** — `id`, `phone`, `codeHash`, `expiresAt`, `attempts`.

## Authentication

Phone-number OTP:
1. User enters phone → server generates a 4-digit OTP, stores a hash + 5-minute
   expiry in `OtpChallenge`, sends via apitxt `sendOTP`.
2. User enters OTP → server verifies against hash + expiry (limited attempts) →
   issues a session (httpOnly cookie).
3. First-time users are routed to profile setup before using groups.

Profiles persist across groups per account (users don't re-enter details).

## Core User Flow

1. **Sign in** — phone → OTP → session.
2. **Profile setup** (first time) — name, age, home & work (map picker),
   transport mode, interests, openness. Editable later.
3. **Create or join a group** — create → get share link `/join/<inviteCode>`;
   or open a friend's link → join.
4. **Group home** — members on a map, profile summaries, "who's missing details."
5. **Plan** — pick category (cafe / restaurant / gaming) + optional time →
   Generate.
6. **Results** — ranked venue cards: venue info, group compatibility score,
   per-person distance/duration/route, and a Groq-written SWOT panel. Tapping a
   venue shows the map with everyone's routes drawn.

## Recommendation Engine (isolated, testable module)

Each function has one job and clear typed inputs/outputs; unit-testable with
mock data independent of network calls.

- **`findMeetingArea(members)`** — fair centroid weighted by transport mode and
  travel time (not just geographic center).
- **`fetchCandidates(area, category)`** — query Overpass/Foursquare for venues
  of the category near the meeting area.
- **`scoreVenue(venue, members)`** — per-person travel via OSRM/ORS + interest
  match + openness + rating → group compatibility score and a fairness spread
  (penalize any one person getting a brutal commute).
- **`rankVenues(candidates, members)`** — sort by score; return top N with
  per-person route detail.
- **`generateSWOT(venue, scoredData)`** — Groq (Llama 3.3 70B) turns scored data
  into readable Strengths / Weaknesses / Opportunities / Threats for the group.

Network-dependent pieces are wrapped so they can be mocked in tests.

## UI Direction

Clean, warm, map-forward, mobile-first. Calm neutral canvas with one confident
accent color; large tap targets; the map is a first-class element. Smooth motion
on key transitions (join, generate, reveal results). Designed empty, loading,
and error states throughout. Detailed visual system is developed during
implementation using the frontend-design skill.

## Defaults / Decisions

- OTP: 4 digits, 5-minute expiry, limited verify attempts.
- Transport modes: `public` and `own` only.
- Categories at launch: cafe, restaurant, gaming.
- Working name: "Friends Group Planner" (renameable).

## Build Order (phased; each phase independently working)

1. **Foundations** — Next.js scaffold, Prisma schema + Neon, phone OTP auth,
   profile setup with map picker.
2. **Groups** — create, share link, join, group home with members on a map.
3. **Engine (free layer)** — meeting area + candidates + travel scoring + ranked
   results against real OSM data.
4. **SWOT + polish** — Groq narrative analysis, route drawing on map, motion,
   empty/error states.

## Testing Strategy

- Unit tests for each engine function with mocked map/route data.
- Auth flow tests (OTP generation, hashing, expiry, attempt limits).
- Integration test for the create-group → join → generate-plan happy path.
