# Waypoint — Group Outings Planner Design Spec

**Date:** 2026-10-09
**Status:** Design approved in conversation; written spec pending review
**Supersedes:** `2026-07-15-friends-group-planner-design.md` (that spec's phases 1–2
are built; this spec replaces its engine, plan model, and testing sections)

## Problem

Friends live and work in different parts of the same city, so planning a meetup
or day out that is fair to everyone is painful. Waypoint lets an invite-only
group pick a day, generates real itineraries (venues, routes, timings, costs)
that are fair to everyone's travel, makes sure every attendee can get home by
their deadline, and tracks what actually happened and who spent what.

## Goals

- Invite-only groups; sign-in with phone OTP or Google.
- Group data is visible only to that group's members.
- Per-outing availability → best date → 2–3 generated itinerary options → vote → lock.
- Itineraries built from real venues and real routes; AI shapes the day and
  writes the narrative, but never invents facts.
- Everyone attending reaches home by their effective deadline.
- Cost estimates per person, plus post-trip expense logging and settle-up.
- Movies: now-playing films (TMDB) + fair cinema, with manual showtime entry.
- Outcome tracking: completed / failed / cancelled, with who dropped out.
- Mobile-first, installable PWA with offline locked itinerary and web push.
- Complete automated testing (unit, contract, integration, privacy, E2E, PWA).

## Non-Goals

- Payments, bookings, or real ticket purchase.
- In-app chat.
- Multi-city / cross-city planning.
- Scraping showtime sites (BookMyShow, PVR, etc.).
- Native mobile apps (PWA only).
- SMS notifications for outing updates (OTP SMS only).

## Tech Stack

Existing: Next.js 16 (App Router) + TypeScript + Tailwind 4, framer-motion,
Prisma + Postgres (Neon), Groq SDK, jose sessions, apitxt OTP. Deployed as one
Next.js process via PM2 + Nginx (see `DEPLOYMENT.md`).

Added:
- **arctic** — Google OAuth (feeds the existing jose session; no Auth.js).
- **zod** — request validation and LLM output validation.
- **Leaflet + react-leaflet** with OSM tiles — maps and location picker.
- **web-push** — Web Push (VAPID) notifications.
- **Vitest** — unit/integration tests. **Playwright** — E2E tests.

### Environment

```
DATABASE_URL=            # required
DATABASE_URL_TEST=       # required for integration/E2E tests
SESSION_SECRET=          # required
APITXT_AUTHKEY=          # required (OTP SMS)
GROQ_API_KEY=            # required
GOOGLE_CLIENT_ID=        # required (Google sign-in)
GOOGLE_CLIENT_SECRET=    # required (Google sign-in)
TMDB_API_KEY=            # required (movies)
VAPID_PUBLIC_KEY=        # required (push)
VAPID_PRIVATE_KEY=       # required (push)
GOOGLE_MAPS_API_KEY=     # optional — switches places/routes to Google
```

Secrets live only in gitignored env files. Keys shared in plaintext during the
July design must be rotated before the repo is shared.

## Data Model (Prisma)

Kept: `Group`, `Membership`, `OtpChallenge`. `Plan` is removed (existing data is
test data; clean migration, no carry-over).

**User** (extended)
- `phone` (unique, nullable — Google users may add later), `email` (unique,
  **required**), `googleId` (unique, nullable).
- `name`, `age`, `gender` (**required**: `male | female | non_binary | prefer_not_to_say`).
- `homeLat/homeLng/homeLabel`, `workLat/workLng/workLabel` (set via map picker).
- `transport` (`public | own`), `interests` (string[]), `openness` (1–5).
- `homeBy` (nullable `"HH:MM"`).
- Profile is complete only when all required fields and both locations are set.

**Membership** gains `role` (`admin | member`). Group creator is admin.
**Group** gains `inviteCode` rotation (admin can regenerate).

**New models**
- `Outing` — `groupId`, `createdById`, `title`, `rangeStart`, `rangeEnd`,
  `date` (nullable until confirmed), `groupHomeBy` (nullable `"HH:MM"`),
  `status` (`collecting | voting | locked | completed | failed | cancelled`),
  `cancelReason` (nullable), `lockedOptionId` (nullable), timestamps.
- `Availability` — `outingId`, `userId`, `date`, `free` (bool). Unique
  (`outingId`, `userId`, `date`).
- `Rsvp` — `outingId`, `userId`, `status` (`going | maybe | no | cancelled`),
  `cancelledAt` (nullable), `cancelReason` (nullable). Unique (`outingId`, `userId`).
- `ItineraryOption` — `outingId`, `theme`, `stops` (JSON), `routes` (JSON,
  per attendee per leg), `costs` (JSON, per person), `homeByReport` (JSON),
  `narrative` (JSON: summary + SWOT), `approximateTransit` (bool),
  `status` (`generating | ready | failed`), timestamps.
- `Vote` — `outingId`, `userId`, `optionId`. Unique (`outingId`, `userId`).
- `ShowtimeOverride` — `optionId`, `stopIndex`, `startsAt`, `enteredById`.
- `CheckIn` — `outingId`, `userId`, `attended` (bool), `createdAt`.
- `Expense` — `outingId`, `paidById`, `amount` (integer paise), `note`,
  `stopIndex` (nullable), `splitAmong` (userId[]), `createdAt`.
- `PushSubscription` — `userId`, `endpoint` (unique), `keys` (JSON).
- `RouteCache` — `key` (unique hash of from/to/mode/departure-hour/provider),
  `result` (JSON), `expiresAt` (24h).

### Effective home-by deadline

For each attendee: the earliest of
1. the user's `homeBy`, if set;
2. the outing's `groupHomeBy`, if set;
3. `23:00` if `gender = female` and the user's `homeBy` is not set.

If none apply, the person has no deadline. The default in (3) is overridable by
setting a personal `homeBy`.

## Outing Lifecycle

1. **Create** (any member): title, date range (max 14 days), optional group
   home-by → status `collecting`.
2. **Availability:** members mark free dates in the range. `pickDate` ranks dates
   by number of free members (ties broken by fewer members with incomplete
   profiles, then earlier date). Organiser confirms a date.
3. **Generate:** 2–3 options generated for the confirmed date for attendees =
   members free on that date. Status → `voting`.
4. **Vote + RSVP:** one vote per member; RSVP `going | maybe | no`. Organiser
   locks the top-voted option (ties: organiser picks) → `locked`.
5. **Locked:** `going` members may switch to `cancelled` (timestamp, optional
   reason). Cancellation, RSVP changes, or a showtime override trigger
   recalculation (steps 5–8 of the engine) for the locked option.
6. **Organiser cancel:** at any status before `completed/failed` → `cancelled`
   with optional reason.
7. **After the day:** each still-`going` attendee gets a "Did you go?" check-in.
   - `completed` if ≥ 50% of still-going attendees check in `attended = true`.
   - `failed` if < 50%, or if no check-in arrives within 3 days after the date.
   - Status is evaluated on each check-in and by a daily script
     (`scripts/evaluate-outcomes.ts`) run as a PM2 cron app (`cron_restart`).
8. **History:** group home lists past outings with ✅ completed / ❌ failed /
   🚫 cancelled, attendees, dropouts with timestamps, and actual spend.

## Planning Engine

`src/lib/engine/` — pure, single-purpose functions; network access only via
injected providers.

### Providers (`src/lib/providers/`)

Each has an interface, a free implementation, and (where noted) a Google one.
`getProviders()` selects Google when `GOOGLE_MAPS_API_KEY` is set.

- `PlacesProvider.search(center, radiusM, kind)` → venues `{id, name, lat, lng,
  kind, rating?, priceLevel?, openingHours?}`. Free: Overpass. Google: Places API.
- `RoutesProvider.route(from, to, mode, departAt)` → `{distanceM, durationS,
  lastDepartureAt?, approximate}`. Free: OSRM (driving/walking); public transport
  estimated as driving × 1.6 + 15 min with `approximate = true`. Google: Routes
  API with real transit incl. last departures. Results cached in `RouteCache`.
- `MoviesProvider.nowPlaying(region)` → films `{id, title, genres, rating,
  posterUrl}`. TMDB.
- `LlmProvider.json(prompt, zodSchema)` → validated object; one retry on schema
  failure. Groq (Llama 3.3 70B).

### Pipeline

1. `pickDate(availability, members)` → ranked dates.
2. `sketchDay(group, date, theme)` (LLM) → 3–5 slots
   `{startTime, kind, vibe}`; kinds from a fixed list (cafe, restaurant,
   gaming, cinema, beach, park, museum, mall, viewpoint, street_food). Called
   with 2–3 different themes for distinct options.
3. `meetingArea(attendees)` → fair centre minimising the maximum travel time
   (iterative over a candidate grid), not geographic centroid.
4. `fillSlot(slot, area, prevStop)` → best real venue: score = travel fairness
   (spread + max) + interest match + rating + open at slot time. Cinema slots
   pair a TMDB film (matched to interests) with a fair cinema and a suggested
   show window.
5. `routeAll(stops, attendees)` → per attendee: home → first stop, stop → stop,
   last stop → home, each with mode from the user's `transport`.
6. `checkHomeBy(routes, deadlines)` → per attendee arrival time vs effective
   deadline, plus last-departure feasibility when known. `repair()` shortens or
   drops the last stop and re-checks, max 3 attempts; if still failing, the
   option is kept with explicit per-person warnings.
7. `estimateCosts(stops, routes)` → per person: entry/tickets, food by price
   level, fares (public) or fuel (own vehicle; estimated per person, no
   ride-sharing split), plus day total.
8. `narrate(option)` (LLM) → summary + SWOT generated only from computed facts
   passed in the prompt.

**Recalculation** (RSVP change, cancellation, showtime override) re-runs
steps 5–8 on the existing stops.

**Progress UX:** options stream status per step; each option is saved as it
finishes. Target 10–20 s per option.

### Settle-up

`settle(expenses, members)` → minimal list of `{from, to, amount}` transfers
(greedy max-creditor/max-debtor matching). Amounts in integer paise.

## Auth & Privacy

- Phone OTP unchanged: 4 digits, 5-min expiry, 5 verify attempts; add request
  rate limit of 3 codes per phone per 15 min.
- Google OAuth via arctic → same session cookie. Google sign-in with an email
  that matches an existing user links to that account. Users can link phone /
  Google from the profile page.
- Onboarding enforces required fields (email, gender, both locations, etc.)
  before any group action.
- All group-scoped reads/writes go through `requireMember(groupId)` (and
  `requireAdmin` for admin actions); non-members get **404**.
- Exact coordinates never leave the server. Members see area labels and travel
  times for everyone; route geometry is shown for stop-to-stop legs and for the
  viewer's own home legs only (other members' home legs appear as times, not
  lines). The group map shows area markers, not exact pins.
- Groups are joinable only via invite link. Admin can rotate the code and
  remove members.

## UI — Mobile-First

- Designed at 375px first, scaled up. Bottom tab bar: Groups · Outings · Profile.
- ≥ 44px tap targets; primary actions in the bottom thumb zone; bottom sheets
  instead of page navigations for detail views; swipeable option cards.
- Safe-area insets respected; keyboard never covers OTP / amount inputs.
- Existing Waypoint visual language retained.

Screens:
1. Sign in (phone / Google) → onboarding (name, age, gender, email, home & work
   via Leaflet map with search, transport, interests, openness, home-by).
2. Groups list → group home (members, area map, outing history).
3. New outing → availability grid → confirm date.
4. Options: timeline, routes map (per privacy rules), per-person travel times,
   costs, home-by status, SWOT →
   vote + RSVP → lock.
5. Locked plan: itinerary, showtime entry, "I can't make it".
6. After the day: check-in, expense log, settle-up.

Designed empty, loading, and error states on every screen.

## PWA

- Web app manifest (name, icons, theme colour, `display: standalone`).
- Hand-written service worker `public/sw.js`: precache app shell; network-first
  for API with cached fallback for the locked itinerary and its routes.
- Install prompt after a user's first outing; iOS shows an "Add to Home Screen"
  hint.
- Web Push (VAPID), opt-in: vote opened, plan locked, someone dropped out,
  check-in reminder. iOS requires the app to be installed.

## Error Handling

- Provider failure: one retry → fall back Google → free where available → if a
  slot is unfillable, ask `sketchDay` for a substitute kind. Approximate transit
  is labelled on the option card.
- LLM schema failure: one retry; `narrate` failure → option shown without SWOT;
  `sketchDay` failure → built-in template day for the category.
- Partial generation: failed options marked `failed`; successful ones shown.
- Members with incomplete profiles are flagged and excluded; generation needs ≥ 2
  complete attendees.
- All API routes validate input with zod and return `{ error }` with an
  appropriate status code.

## Testing

- **Unit (Vitest):** every engine function with fake providers and fixtures —
  date ranking, meeting area fairness, slot filling, home-by deadline rule,
  repair loop, cost estimation, settle-up, outcome evaluation; OTP hashing,
  expiry, attempt and rate limits.
- **Provider contract tests:** free and Google implementations run against one
  shared contract using recorded responses. Optional live suite runs when keys
  are present.
- **API integration (Vitest + test Postgres):** every route; privacy suite
  asserting non-members get 404 on every group endpoint and that no response
  ever contains member coordinates.
- **E2E (Playwright, mobile viewport):** sign in → onboarding → create group →
  second user joins → availability → generate → vote → lock → user cancels and
  plan recalculates → showtime override → check-in → outcome → expenses →
  settle-up. Uses fake providers and a fake SMS sender (enabled only when
  `NODE_ENV=test`).
- **PWA:** manifest validity, service worker registration, locked itinerary
  loads offline.
- Commands: `npm test`, `npm run test:e2e`. GitHub Actions workflow added if the
  repo gets a GitHub remote.
