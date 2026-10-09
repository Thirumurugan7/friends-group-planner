# Waypoint

Waypoint is a mobile-first outings planner for groups of friends. Members join a
group, set their home area and a "home by" time, and mark availability for an
outing. Waypoint then builds three itinerary options (places, movies, routes,
home-by checks and cost estimates), the group votes, the organiser locks one in,
and afterwards people check in and settle expenses. It installs as a PWA, works
offline for the locked plan, and sends web push notifications. Exact home
coordinates never leave the server.

Built with Next.js 16, React 19, Prisma and PostgreSQL. Maps and routing use
OpenStreetMap, Nominatim and OSRM by default, or Google when a key is set.

## Local setup

```bash
npm install
createdb waypoint_test            # local Postgres, used by tests
cp .env.example .env.local        # then fill in the values
npx prisma migrate dev
npm run dev
```

`DATABASE_URL_TEST` must point at a local database named `waypoint_test`. The
test suite wipes its schema, and refuses to run against anything else.

## Offline development

Set `WAYPOINT_FAKES=1` to use fake maps, places and AI, with a fixed OTP of
`1234`. It is for development and tests only and is refused in production.

## Tests

```bash
npm test            # unit, contract, integration and privacy tests (Vitest)
npm run test:e2e    # Playwright end-to-end specs (needs a local waypoint_test DB)
npm run test:live   # hits public OSM/OSRM (and Google if a key is set)
```

CI (`.github/workflows/ci.yml`) runs type-check, lint, tests, build and E2E.

## Deployment

See [DEPLOYMENT.md](DEPLOYMENT.md) for PM2 + Nginx, environment variables,
Google OAuth, HTTPS and database migration steps.
