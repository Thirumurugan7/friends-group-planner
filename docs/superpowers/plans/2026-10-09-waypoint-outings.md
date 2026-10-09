# Waypoint Group Outings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn Waypoint into an invite-only group outing planner: per-outing availability → AI-sketched, engine-verified itineraries over real map data → vote/lock → home-by safety → check-in outcomes → expenses and settle-up, as a mobile-first PWA with full automated tests.

**Architecture:** One Next.js 16 process (UI + `/api` route handlers) on Postgres via Prisma. Planning lives in pure engine functions (`src/lib/engine/`) that talk to the outside world only through injected providers (`src/lib/providers/`: OSM/OSRM free, Google when keyed, TMDB, Groq, plus fakes for tests). DB-aware orchestration lives in `src/lib/outings/`. Every group-scoped route goes through one membership guard that returns 404 to outsiders.

**Tech Stack:** Next.js 16.2 App Router, React 19, TypeScript, Tailwind 4, framer-motion, Prisma 6 + Postgres, jose, arctic (Google OAuth), zod, groq-sdk, Leaflet/react-leaflet, web-push, Vitest, Playwright, tsx.

**Spec:** `docs/superpowers/specs/2026-10-09-waypoint-outings-design.md`

## Global Constraints

- Next.js here is 16.x with breaking changes: before writing any route, page, or config code, read the relevant file under `node_modules/next/dist/docs/` (per `AGENTS.md`). Route handler `params` and `cookies()` are async (`await params`, `await cookies()`).
- Secrets only in gitignored `.env*` files. Never commit keys. Never print keys in logs.
- City timezone is `Asia/Kolkata` (UTC+05:30); all `"HH:MM"` values are city-local. A `"HH:MM"` earlier than `05:00` means the *next* calendar day.
- Money is integer **paise** everywhere (DB, engine, API). Format to ₹ only in UI.
- Default home-by for `gender = female` without personal `homeBy` is `"23:00"`.
- Effective deadline = earliest of personal `homeBy`, outing `groupHomeBy`, female default.
- OTP: 4 digits, 5-minute expiry, 5 verify attempts, max 3 codes per phone per 15 minutes.
- Non-members get **404** from every group/outing endpoint; non-admin members get 403 on admin actions.
- Exact home/work coordinates never appear in any API response. Area points are rounded to 2 decimals.
- Outing date range: max 14 days. Generation needs ≥ 2 complete attendees. 2–3 options per outing (we generate 3 themes).
- Outcome: `completed` if ≥ 50% of still-going attendees check in `attended=true`; `failed` if < 50% once all have answered, or no decision 3 days after the date.
- `home-by` repair: max 3 attempts; failing options are kept with warnings, never hidden.
- Route cache TTL: 24 hours.
- Mobile-first: design at 375px; tap targets ≥ 44px; safe-area insets respected.
- `WAYPOINT_FAKES=1` (fixed OTP `1234`, fake providers) must be impossible in `NODE_ENV=production`.
- Commit after every task with a plain, one-line commit message.

## Review Focus

1. **Home-by times after midnight** (`homeBy = "00:30"`): must be treated as 00:30 the next day — later than `"23:00"` — not as the earliest time of the day. Pinned in Task 6.
2. **No venues for a sketched kind** (e.g. no beach near an inland city, Overpass returns `[]`): the engine must substitute a related kind or skip the slot, not fail the whole option; zero stops → option `failed` with a readable error. Pinned in Task 16.
3. **Double-tapping Generate / concurrent generate requests**: must not create 6 options; a second request while options are `generating` gets 409. Pinned in Task 20.
4. **A member removed from the group mid-outing**: loses access (404) immediately and is excluded from attendees on the next recalculation. Pinned in Task 7 (access) and Task 21 (recalculation).
5. **`WAYPOINT_FAKES=1` on a production server**: would turn OTP into a fixed-code backdoor; must throw at use. Pinned in Task 4.

---

## File Structure

```
prisma/schema.prisma                      MODIFY  new models/enums, drop Plan
prisma/migrations/…                       CREATE  first tracked migration
vitest.config.mts                         CREATE
playwright.config.ts                      CREATE
tests/setup.ts                            CREATE  next/headers cookie jar mock
tests/global-setup.ts                     CREATE  migrate-reset the test DB
tests/helpers/{db,http,factories}.ts      CREATE
tests/unit/**                             CREATE  pure function tests
tests/providers/**                        CREATE  contract tests + fixtures
tests/api/**                              CREATE  route integration + privacy
tests/live/**                             CREATE  optional real-API suite
tests/e2e/**                              CREATE  Playwright
src/lib/time.ts                           CREATE  city-time helpers
src/lib/deadline.ts                       CREATE  effective home-by rule
src/lib/fakes.ts                          CREATE  WAYPOINT_FAKES guard
src/lib/http.ts                           CREATE  route wrapper, guards, zod body parsing
src/lib/serialize.ts                      CREATE  public shapes, redaction
src/lib/profile.ts                        CREATE  profile schema + completeness
src/lib/background.ts                     CREATE  after() wrapper
src/lib/otp.ts                            MODIFY  fakes, rate limit helper
src/lib/google-auth.ts                    CREATE  arctic client + account linking
src/lib/push.ts                           CREATE  web-push sender
src/lib/providers/*.ts                    CREATE  interfaces, osm, osrm, google, tmdb, groq, cache, fallback, fake, index
src/lib/engine/*.ts                       CREATE  types, geo, pickDate, meetingArea, sketchDay, fillSlot,
                                                  routeAll, homeBy, costs, narrate, generate, settle, outcome
src/lib/outings/*.ts                      CREATE  attendees, run (generation/recalc), outcomes (daily job), notify
src/app/api/**                            MODIFY/CREATE  see tasks
src/app/manifest.ts, src/app/pwa-icon/…   CREATE  PWA
public/sw.js                              CREATE  service worker
src/components/shell/*                    CREATE  AppShell, BottomSheet, InstallPrompt, PushToggle
src/components/profile/*                  CREATE  ProfileForm, LocationPicker, LeafletPicker
src/components/outing/*                   CREATE  outing screens
scripts/evaluate-outcomes.ts              CREATE  daily cron
DELETE: src/lib/mock.ts, src/lib/groq.ts, src/components/PlanResults.tsx,
        src/app/api/groups/[id]/plan/, src/app/groups/[id]/plan/
```

---

## Phase A — Foundations

### Task 1: Test infrastructure, schema migration, and fakes guard

**Files:**
- Modify: `package.json`, `prisma/schema.prisma`, `.env.example`
- Create: `vitest.config.mts`, `tests/setup.ts`, `tests/global-setup.ts`, `tests/helpers/db.ts`, `tests/helpers/http.ts`, `tests/helpers/factories.ts`, `tests/unit/smoke.test.ts`
- Delete (`Plan`-dependent code; mock data is removed later in Task 25): `src/app/api/groups/[id]/plan/route.ts`, `src/app/groups/[id]/plan/[category]/page.tsx`, `src/components/PlanResults.tsx`, `src/lib/groq.ts`

**Interfaces:**
- Produces: Prisma models `User, Group, Membership, OtpChallenge, Outing, Availability, Rsvp, ItineraryOption, Vote, ShowtimeOverride, CheckIn, Expense, PushSubscription, RouteCache`; enums `Gender, Role, TransportMode, OutingStatus, RsvpStatus, OptionStatus`.
- Produces test helpers: `resetDb(): Promise<void>`, `asUser(userId: string | null): Promise<void>`, `call(handler, opts?: { method?: string; body?: unknown; params?: Record<string,string>; url?: string }): Promise<{ status: number; json: any }>`, `makeUser(overrides?: Partial<UserCreate>): Promise<User>`, `makeCompleteUser(overrides?)`, `makeGroup(adminId: string, memberIds?: string[]): Promise<Group>`.

- [ ] **Step 1: Install dev/runtime dependencies**

```bash
npm install zod arctic web-push leaflet react-leaflet
npm install -D vitest vite-tsconfig-paths @playwright/test tsx @types/leaflet @types/web-push
npx playwright install chromium
createdb waypoint_test || true
```

Add to `package.json` `"scripts"`:

```json
"test": "vitest run",
"test:watch": "vitest",
"test:live": "vitest run --config vitest.live.config.mts",
"test:e2e": "playwright test",
"dev:e2e": "next dev -p 3200",
"db:migrate": "prisma migrate dev",
"outcomes": "tsx scripts/evaluate-outcomes.ts"
```

Add to `.env.local` (not committed): `DATABASE_URL_TEST="postgresql://localhost:5432/waypoint_test"`.

- [ ] **Step 2: Replace `prisma/schema.prisma`**

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

enum TransportMode {
  public
  own
}

enum Gender {
  male
  female
  non_binary
  prefer_not_to_say
}

enum Role {
  admin
  member
}

enum OutingStatus {
  collecting
  voting
  locked
  completed
  failed
  cancelled
}

enum RsvpStatus {
  going
  maybe
  no
  cancelled
}

enum OptionStatus {
  generating
  ready
  failed
}

model User {
  id        String         @id @default(cuid())
  phone     String?        @unique
  email     String?        @unique // required by onboarding; nullable until then
  googleId  String?        @unique
  name      String?
  age       Int?
  gender    Gender?
  homeBy    String? // "HH:MM" city-local
  homeLat   Float?
  homeLng   Float?
  homeLabel String?
  workLat   Float?
  workLng   Float?
  workLabel String?
  transport TransportMode  @default(public)
  interests String[]       @default([])
  openness  Int            @default(3)

  createdGroups  Group[]            @relation("GroupCreator")
  memberships    Membership[]
  createdOutings Outing[]           @relation("OutingCreator")
  availability   Availability[]
  rsvps          Rsvp[]
  votes          Vote[]
  checkIns       CheckIn[]
  expensesPaid   Expense[]
  showtimes      ShowtimeOverride[]
  pushSubs       PushSubscription[]

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}

model Group {
  id          String       @id @default(cuid())
  name        String
  inviteCode  String       @unique
  createdBy   User         @relation("GroupCreator", fields: [createdById], references: [id])
  createdById String
  memberships Membership[]
  outings     Outing[]
  createdAt   DateTime     @default(now())
}

model Membership {
  id       String   @id @default(cuid())
  user     User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  userId   String
  group    Group    @relation(fields: [groupId], references: [id], onDelete: Cascade)
  groupId  String
  role     Role     @default(member)
  joinedAt DateTime @default(now())

  @@unique([userId, groupId])
}

model OtpChallenge {
  id        String   @id @default(cuid())
  phone     String
  codeHash  String
  attempts  Int      @default(0)
  expiresAt DateTime
  createdAt DateTime @default(now())

  @@index([phone, createdAt])
}

model Outing {
  id             String       @id @default(cuid())
  group          Group        @relation(fields: [groupId], references: [id], onDelete: Cascade)
  groupId        String
  createdBy      User         @relation("OutingCreator", fields: [createdById], references: [id])
  createdById    String
  title          String
  rangeStart     String // "YYYY-MM-DD"
  rangeEnd       String // "YYYY-MM-DD"
  date           String? // "YYYY-MM-DD" once confirmed
  groupHomeBy    String? // "HH:MM"
  status         OutingStatus @default(collecting)
  cancelReason   String?
  lockedOptionId String?

  availability Availability[]
  rsvps        Rsvp[]
  options      ItineraryOption[]
  votes        Vote[]
  checkIns     CheckIn[]
  expenses     Expense[]

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([groupId, createdAt])
}

model Availability {
  id       String  @id @default(cuid())
  outing   Outing  @relation(fields: [outingId], references: [id], onDelete: Cascade)
  outingId String
  user     User    @relation(fields: [userId], references: [id], onDelete: Cascade)
  userId   String
  date     String // "YYYY-MM-DD"
  free     Boolean

  @@unique([outingId, userId, date])
}

model Rsvp {
  id           String     @id @default(cuid())
  outing       Outing     @relation(fields: [outingId], references: [id], onDelete: Cascade)
  outingId     String
  user         User       @relation(fields: [userId], references: [id], onDelete: Cascade)
  userId       String
  status       RsvpStatus
  cancelledAt  DateTime?
  cancelReason String?
  updatedAt    DateTime   @updatedAt

  @@unique([outingId, userId])
}

model ItineraryOption {
  id                 String       @id @default(cuid())
  outing             Outing       @relation(fields: [outingId], references: [id], onDelete: Cascade)
  outingId           String
  theme              String
  status             OptionStatus @default(generating)
  progress           String?
  error              String?
  stops              Json         @default("[]")
  routes             Json         @default("[]")
  costs              Json         @default("[]")
  homeByReport       Json         @default("[]")
  narrative          Json?
  approximateTransit Boolean      @default(false)
  votes              Vote[]
  showtimes          ShowtimeOverride[]
  createdAt          DateTime     @default(now())
  updatedAt          DateTime     @updatedAt
}

model Vote {
  id       String          @id @default(cuid())
  outing   Outing          @relation(fields: [outingId], references: [id], onDelete: Cascade)
  outingId String
  user     User            @relation(fields: [userId], references: [id], onDelete: Cascade)
  userId   String
  option   ItineraryOption @relation(fields: [optionId], references: [id], onDelete: Cascade)
  optionId String

  @@unique([outingId, userId])
}

model ShowtimeOverride {
  id          String          @id @default(cuid())
  option      ItineraryOption @relation(fields: [optionId], references: [id], onDelete: Cascade)
  optionId    String
  stopIndex   Int
  startsAt    DateTime
  enteredBy   User            @relation(fields: [enteredById], references: [id])
  enteredById String
  createdAt   DateTime        @default(now())

  @@unique([optionId, stopIndex])
}

model CheckIn {
  id        String   @id @default(cuid())
  outing    Outing   @relation(fields: [outingId], references: [id], onDelete: Cascade)
  outingId  String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  userId    String
  attended  Boolean
  createdAt DateTime @default(now())

  @@unique([outingId, userId])
}

model Expense {
  id         String   @id @default(cuid())
  outing     Outing   @relation(fields: [outingId], references: [id], onDelete: Cascade)
  outingId   String
  paidBy     User     @relation(fields: [paidById], references: [id])
  paidById   String
  amount     Int // paise
  note       String
  stopIndex  Int?
  splitAmong String[]
  createdAt  DateTime @default(now())
}

model PushSubscription {
  id        String   @id @default(cuid())
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  userId    String
  endpoint  String   @unique
  keys      Json
  createdAt DateTime @default(now())
}

model RouteCache {
  id        String   @id @default(cuid())
  key       String   @unique
  result    Json
  expiresAt DateTime
}
```

- [ ] **Step 3: Remove code that depended on `Plan` / old Groq planner**

```bash
git rm -r "src/app/api/groups/[id]/plan" "src/app/groups/[id]/plan" src/components/PlanResults.tsx src/lib/groq.ts
```

Remove `generatePlan` from `src/lib/api.ts` (delete the whole `export function generatePlan…` block). In `src/components/GroupHome.tsx`, delete any `Link`/button pointing at `/groups/${group.id}/plan/...` (GroupHome is rewritten in Task 24; for now it only needs to compile).

- [ ] **Step 4: Create the first tracked migration against the test DB**

The repo previously used `db push`, so there is no migration history.

```bash
DATABASE_URL="postgresql://localhost:5432/waypoint_test" npx prisma migrate dev --name outings_init
```

Expected: `prisma/migrations/<timestamp>_outings_init/migration.sql` created; "Your database is now in sync".

> Production (Neon) note — do NOT run against Neon here. Task 30 covers the production reset, which needs the human's explicit go-ahead because it wipes the existing test data.

- [ ] **Step 5: Write `vitest.config.mts`**

```ts
import { defineConfig, loadEnv } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

const env = loadEnv("test", process.cwd(), "");
const testDb = env.DATABASE_URL_TEST ?? "postgresql://localhost:5432/waypoint_test";
if (/neon\.tech|amazonaws|supabase/.test(testDb)) {
  throw new Error("DATABASE_URL_TEST points at a hosted DB; refuse to run tests against it.");
}

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    exclude: ["tests/e2e/**", "tests/live/**", "node_modules/**"],
    setupFiles: ["tests/setup.ts"],
    globalSetup: ["tests/global-setup.ts"],
    fileParallelism: false,
    env: {
      DATABASE_URL: testDb,
      SESSION_SECRET: "test-secret",
      WAYPOINT_FAKES: "1",
      GROQ_API_KEY: "test",
      TMDB_API_KEY: "test",
      GOOGLE_CLIENT_ID: "test-client",
      GOOGLE_CLIENT_SECRET: "test-secret",
      APP_URL: "http://localhost:3200",
      VAPID_PUBLIC_KEY: "",
      VAPID_PRIVATE_KEY: "",
    },
  },
});
```

- [ ] **Step 6: Write `tests/global-setup.ts`**

```ts
import { execSync } from "node:child_process";

export default function setup() {
  execSync("npx prisma migrate reset --force --skip-seed", {
    stdio: "inherit",
    env: { ...process.env },
  });
}
```

- [ ] **Step 7: Write `tests/setup.ts` (cookie jar mock so real session code runs)**

```ts
import { vi } from "vitest";

type Jar = Map<string, string>;
const g = globalThis as unknown as { __jar: Jar };
g.__jar = new Map();

vi.mock("next/headers", () => ({
  cookies: async () => {
    const jar = (globalThis as unknown as { __jar: Jar }).__jar;
    return {
      get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)! } : undefined),
      set: (name: string, value: string) => void jar.set(name, value),
      delete: (name: string) => void jar.delete(name),
    };
  },
}));

vi.mock("web-push", () => ({
  default: {
    setVapidDetails: vi.fn(),
    sendNotification: vi.fn(async () => ({ statusCode: 201 })),
  },
}));
```

- [ ] **Step 8: Write helpers**

`tests/helpers/db.ts`:

```ts
import { prisma } from "@/lib/db";

export async function resetDb() {
  const rows = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  if (rows.length === 0) return;
  await prisma.$executeRawUnsafe(
    `TRUNCATE ${rows.map((r) => `"${r.tablename}"`).join(", ")} CASCADE`
  );
}
```

`tests/helpers/http.ts`:

```ts
import { createSession } from "@/lib/session";

const jar = () => (globalThis as unknown as { __jar: Map<string, string> }).__jar;

export async function asUser(userId: string | null) {
  jar().clear();
  if (userId) await createSession(userId);
}

type Handler = (req: Request, ctx: { params: Promise<Record<string, string>> }) => Promise<Response>;

export async function call(
  handler: Handler,
  opts: { method?: string; body?: unknown; params?: Record<string, string>; url?: string } = {}
) {
  const req = new Request(opts.url ?? "http://test.local/api", {
    method: opts.method ?? "GET",
    headers: opts.body !== undefined ? { "content-type": "application/json" } : {},
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  const res = await handler(req, { params: Promise.resolve(opts.params ?? {}) });
  const text = await res.text();
  let json: any = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = text; }
  return { status: res.status, json, headers: res.headers };
}
```

`tests/helpers/factories.ts`:

```ts
import { prisma } from "@/lib/db";
import type { Prisma } from "@prisma/client";

let n = 0;
const uniq = () => `${Date.now()}${n++}`;

export function makeUser(overrides: Partial<Prisma.UserCreateInput> = {}) {
  const id = uniq();
  return prisma.user.create({
    data: { phone: `91${id.slice(-10).padStart(10, "9")}`, ...overrides },
  });
}

export function makeCompleteUser(overrides: Partial<Prisma.UserCreateInput> = {}) {
  const id = uniq();
  return makeUser({
    name: `User ${id.slice(-4)}`,
    email: `u${id}@example.com`,
    age: 27,
    gender: "male",
    homeLat: 12.97123,
    homeLng: 77.64123,
    homeLabel: "Indiranagar",
    workLat: 12.93456,
    workLng: 77.62456,
    workLabel: "Koramangala",
    transport: "public",
    interests: ["coffee", "board games"],
    openness: 4,
    ...overrides,
  });
}

export async function makeGroup(adminId: string, memberIds: string[] = []) {
  return prisma.group.create({
    data: {
      name: "Test Group",
      inviteCode: `TEST-${uniq().slice(-6)}`,
      createdById: adminId,
      memberships: {
        create: [
          { userId: adminId, role: "admin" },
          ...memberIds.map((userId) => ({ userId, role: "member" as const })),
        ],
      },
    },
  });
}
```

- [ ] **Step 9: Smoke test**

`tests/unit/smoke.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/lib/db";
import { resetDb } from "../helpers/db";
import { makeCompleteUser, makeGroup } from "../helpers/factories";

describe("test infrastructure", () => {
  beforeEach(resetDb);

  it("creates a group with an admin membership in the test DB", async () => {
    const u = await makeCompleteUser();
    const g = await makeGroup(u.id);
    const m = await prisma.membership.findFirstOrThrow({ where: { groupId: g.id } });
    expect(m.role).toBe("admin");
    expect(process.env.DATABASE_URL).toContain("waypoint_test");
  });
});
```

Run: `npm test`
Expected: PASS (1 test). Then `npx tsc --noEmit` — fix any compile errors from removed Plan code (only `api.ts`/`GroupHome.tsx` references).

- [ ] **Step 10: Update `.env.example`**

```
# Copy to .env.local and fill in. Never commit real secrets.
DATABASE_URL="postgresql://USER:PASSWORD@HOST/DB?sslmode=require"
DATABASE_URL_TEST="postgresql://localhost:5432/waypoint_test"
SESSION_SECRET="generate-with-openssl-rand-hex-32"
APP_URL="http://localhost:3000"
APITXT_AUTHKEY="..."
GROQ_API_KEY="gsk_..."
GOOGLE_CLIENT_ID="..."
GOOGLE_CLIENT_SECRET="..."
TMDB_API_KEY="..."
VAPID_PUBLIC_KEY="..."            # npx web-push generate-vapid-keys
VAPID_PRIVATE_KEY="..."
NEXT_PUBLIC_VAPID_PUBLIC_KEY="..." # same value as VAPID_PUBLIC_KEY
VAPID_CONTACT="mailto:you@example.com"
GOOGLE_MAPS_API_KEY=""            # optional: switches places/routes to Google
NOMINATIM_CONTACT="you@example.com"
# WAYPOINT_FAKES=1                 # tests/E2E only; refused in production
```

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -m "chore: test infrastructure and outings schema"
```

---

### Task 2: City time helpers

**Files:**
- Create: `src/lib/time.ts`
- Test: `tests/unit/time.test.ts`

**Interfaces:**
- Produces:
  - `HHMM_RE: RegExp`, `DATE_RE: RegExp`
  - `atLocal(date: string, hhmm: string): Date` — city-local wall time → UTC `Date`; `hhmm < "05:00"` rolls to next day.
  - `localDate(d: Date): string` → `"YYYY-MM-DD"` in city time.
  - `localHHMM(d: Date): string` → `"HH:MM"` in city time.
  - `addMinutes(d: Date, min: number): Date`
  - `datesInRange(start: string, end: string): string[]` (inclusive)
  - `dayOrderMinutes(hhmm: string): number` — minutes since 05:00 (so `"00:30"` sorts after `"23:00"`).

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { atLocal, localDate, localHHMM, addMinutes, datesInRange, dayOrderMinutes } from "@/lib/time";

describe("city time", () => {
  it("converts city wall time to UTC", () => {
    expect(atLocal("2026-10-18", "10:00").toISOString()).toBe("2026-10-18T04:30:00.000Z");
  });
  it("rolls times before 05:00 to the next day", () => {
    expect(atLocal("2026-10-18", "00:30").toISOString()).toBe("2026-10-18T19:00:00.000Z");
  });
  it("formats back to city-local date and time", () => {
    const d = new Date("2026-10-18T19:00:00.000Z");
    expect(localDate(d)).toBe("2026-10-19");
    expect(localHHMM(d)).toBe("00:30");
  });
  it("adds minutes", () => {
    expect(addMinutes(new Date("2026-10-18T00:00:00Z"), 90).toISOString()).toBe("2026-10-18T01:30:00.000Z");
  });
  it("lists dates inclusively", () => {
    expect(datesInRange("2026-10-30", "2026-11-02")).toEqual(["2026-10-30", "2026-10-31", "2026-11-01", "2026-11-02"]);
  });
  it("orders after-midnight times later than evening times", () => {
    expect(dayOrderMinutes("00:30")).toBeGreaterThan(dayOrderMinutes("23:00"));
    expect(dayOrderMinutes("05:00")).toBe(0);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/unit/time.test.ts`
Expected: FAIL — cannot resolve `@/lib/time`.

- [ ] **Step 3: Implement `src/lib/time.ts`**

```ts
// City-local time helpers. Waypoint plans within one city (Asia/Kolkata).
// "HH:MM" strings are city wall-clock; anything before 05:00 belongs to the
// night of the previous calendar day (e.g. home-by "00:30").

export const CITY_OFFSET_MIN = 330; // UTC+05:30
export const DAY_START_MIN = 5 * 60;
export const HHMM_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

export function dayOrderMinutes(hhmm: string): number {
  const m = toMinutes(hhmm);
  return m >= DAY_START_MIN ? m - DAY_START_MIN : m + 24 * 60 - DAY_START_MIN;
}

export function atLocal(date: string, hhmm: string): Date {
  const [y, mo, d] = date.split("-").map(Number);
  let mins = toMinutes(hhmm);
  if (mins < DAY_START_MIN) mins += 24 * 60;
  return new Date(Date.UTC(y, mo - 1, d, 0, mins - CITY_OFFSET_MIN));
}

function shifted(d: Date): Date {
  return new Date(d.getTime() + CITY_OFFSET_MIN * 60_000);
}

export function localDate(d: Date): string {
  return shifted(d).toISOString().slice(0, 10);
}

export function localHHMM(d: Date): string {
  return shifted(d).toISOString().slice(11, 16);
}

export function addMinutes(d: Date, min: number): Date {
  return new Date(d.getTime() + min * 60_000);
}

export function datesInRange(start: string, end: string): string[] {
  const out: string[] = [];
  const cur = new Date(`${start}T00:00:00Z`);
  const last = new Date(`${end}T00:00:00Z`);
  while (cur <= last) {
    out.push(cur.toISOString().slice(0, 10));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return out;
}
```

- [ ] **Step 4: Run tests** — `npx vitest run tests/unit/time.test.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/time.ts tests/unit/time.test.ts
git commit -m "feat: city-local time helpers"
```

---

### Task 3: HTTP helpers, guards, and serializers

**Files:**
- Create: `src/lib/http.ts`, `src/lib/serialize.ts`, `src/lib/profile.ts`
- Test: `tests/unit/profile.test.ts`, `tests/api/guards.test.ts`

**Interfaces:**
- Consumes: `getUserId()` from `src/lib/session.ts`; `prisma`.
- Produces (`src/lib/http.ts`):
  - `class HttpError extends Error { status: number }`
  - `route<P>(fn: (req: Request, ctx: { params: Promise<P> }) => Promise<Response>)` — wraps a handler; maps `HttpError` → `{error}` with status, `ZodError` → 400 `{error: first issue message}`, anything else → 500 `{error: "Something went wrong."}` (logged).
  - `ok(data: object, status = 200): Response`
  - `parseBody<T>(req: Request, schema: z.ZodType<T>): Promise<T>`
  - `requireUser(): Promise<User>` (401 `"Not signed in."`)
  - `requireCompleteUser(): Promise<User>` (403 `"Finish your profile first."`)
  - `requireMember(groupId: string, userId: string): Promise<{ group: Group; membership: Membership }>` (404 `"Not found."`)
  - `requireAdmin(groupId: string, userId: string)` (404 for non-members, 403 `"Only the group admin can do that."`)
  - `requireOutingMember(outingId: string, userId: string): Promise<{ outing: Outing; membership: Membership }>` (404)
- Produces (`src/lib/profile.ts`):
  - `ProfileSchema` (zod) for `PUT /api/profile` body
  - `isProfileComplete(u: Pick<User, "name"|"email"|"age"|"gender"|"homeLat"|"homeLng"|"homeLabel"|"workLat"|"workLng"|"workLabel">): boolean`
- Produces (`src/lib/serialize.ts`):
  - `roundArea(lat: number|null, lng: number|null): { lat: number; lng: number } | null`
  - `publicMember(u: User, role?: Role): PublicMember` where `PublicMember = { id; name; homeLabel; workLabel; homeArea: {lat,lng}|null; transport; interests; profileComplete; role?: Role }`
  - `selfProfile(u: User)` — the viewer's own full profile (includes exact coords; only returned by `/api/me` and `/api/profile`).

- [ ] **Step 1: Write failing unit test for profile completeness**

`tests/unit/profile.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { isProfileComplete, ProfileSchema } from "@/lib/profile";

const full = {
  name: "Aisha", email: "a@x.com", age: 27, gender: "female" as const,
  homeLat: 12.9, homeLng: 77.6, homeLabel: "Indiranagar",
  workLat: 12.93, workLng: 77.62, workLabel: "Koramangala",
};

describe("profile", () => {
  it("is complete only with every required field", () => {
    expect(isProfileComplete(full)).toBe(true);
    expect(isProfileComplete({ ...full, email: null })).toBe(false);
    expect(isProfileComplete({ ...full, gender: null })).toBe(false);
    expect(isProfileComplete({ ...full, workLat: null })).toBe(false);
  });

  it("validates the profile body", () => {
    const body = {
      name: "Aisha", email: "a@x.com", age: 27, gender: "female",
      home: { lat: 12.9, lng: 77.6, label: "Indiranagar" },
      work: { lat: 12.93, lng: 77.62, label: "Koramangala" },
      transport: "public", interests: ["coffee"], openness: 4, homeBy: "23:30",
    };
    expect(ProfileSchema.parse(body).homeBy).toBe("23:30");
    expect(() => ProfileSchema.parse({ ...body, email: "nope" })).toThrow();
    expect(() => ProfileSchema.parse({ ...body, gender: undefined })).toThrow();
    expect(() => ProfileSchema.parse({ ...body, homeBy: "25:00" })).toThrow();
    expect(ProfileSchema.parse({ ...body, homeBy: null }).homeBy).toBeNull();
  });
});
```

- [ ] **Step 2: Run** — `npx vitest run tests/unit/profile.test.ts` → FAIL (module missing).

- [ ] **Step 3: Implement `src/lib/profile.ts`**

```ts
import { z } from "zod";
import type { User } from "@prisma/client";
import { HHMM_RE } from "@/lib/time";

const PlaceSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  label: z.string().trim().min(1).max(80),
});

export const ProfileSchema = z.object({
  name: z.string().trim().min(1, "Name is required.").max(60),
  email: z.string().trim().toLowerCase().email("Enter a valid email."),
  age: z.number().int().min(13).max(100),
  gender: z.enum(["male", "female", "non_binary", "prefer_not_to_say"], {
    message: "Pick a gender option.",
  }),
  home: PlaceSchema,
  work: PlaceSchema,
  transport: z.enum(["public", "own"]),
  interests: z.array(z.string().trim().min(1).max(30)).max(20),
  openness: z.number().int().min(1).max(5),
  homeBy: z.string().regex(HHMM_RE, "Use HH:MM").nullable(),
});
export type ProfileInput = z.infer<typeof ProfileSchema>;

type CompletenessFields = Pick<
  User,
  "name" | "email" | "age" | "gender" | "homeLat" | "homeLng" | "homeLabel" | "workLat" | "workLng" | "workLabel"
>;

export function isProfileComplete(u: CompletenessFields): boolean {
  return Boolean(
    u.name && u.email && u.age && u.gender &&
      u.homeLat != null && u.homeLng != null && u.homeLabel &&
      u.workLat != null && u.workLng != null && u.workLabel
  );
}
```

- [ ] **Step 4: Implement `src/lib/serialize.ts`**

```ts
import type { Role, User } from "@prisma/client";
import { isProfileComplete } from "@/lib/profile";

export function roundArea(lat: number | null, lng: number | null) {
  if (lat == null || lng == null) return null;
  return { lat: Math.round(lat * 100) / 100, lng: Math.round(lng * 100) / 100 };
}

export interface PublicMember {
  id: string;
  name: string;
  homeLabel: string | null;
  workLabel: string | null;
  homeArea: { lat: number; lng: number } | null;
  transport: "public" | "own";
  interests: string[];
  profileComplete: boolean;
  role?: Role;
}

/** What other group members may see. Never exact coordinates. */
export function publicMember(u: User, role?: Role): PublicMember {
  return {
    id: u.id,
    name: u.name ?? "New friend",
    homeLabel: u.homeLabel,
    workLabel: u.workLabel,
    homeArea: roundArea(u.homeLat, u.homeLng),
    transport: u.transport,
    interests: u.interests,
    profileComplete: isProfileComplete(u),
    ...(role ? { role } : {}),
  };
}

/** The viewer's own profile — the only place exact coordinates are returned. */
export function selfProfile(u: User) {
  return {
    id: u.id,
    phone: u.phone,
    email: u.email,
    googleLinked: Boolean(u.googleId),
    name: u.name,
    age: u.age,
    gender: u.gender,
    homeBy: u.homeBy,
    home: u.homeLat != null ? { lat: u.homeLat, lng: u.homeLng!, label: u.homeLabel ?? "" } : null,
    work: u.workLat != null ? { lat: u.workLat, lng: u.workLng!, label: u.workLabel ?? "" } : null,
    transport: u.transport,
    interests: u.interests,
    openness: u.openness,
    profileComplete: isProfileComplete(u),
  };
}
```

- [ ] **Step 5: Implement `src/lib/http.ts`**

```ts
import { NextResponse } from "next/server";
import { ZodError, type z } from "zod";
import { prisma } from "@/lib/db";
import { getUserId } from "@/lib/session";
import { isProfileComplete } from "@/lib/profile";

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export function ok(data: object, status = 200) {
  return NextResponse.json(data, { status });
}

export function route<P = Record<string, string>>(
  fn: (req: Request, ctx: { params: Promise<P> }) => Promise<Response>
) {
  return async (req: Request, ctx: { params: Promise<P> }) => {
    try {
      return await fn(req, ctx);
    } catch (err) {
      if (err instanceof HttpError) return ok({ error: err.message }, err.status);
      if (err instanceof ZodError) return ok({ error: err.issues[0]?.message ?? "Invalid request." }, 400);
      console.error("[api] unhandled", err);
      return ok({ error: "Something went wrong." }, 500);
    }
  };
}

export async function parseBody<T>(req: Request, schema: z.ZodType<T>): Promise<T> {
  const raw = await req.json().catch(() => {
    throw new HttpError(400, "Invalid JSON.");
  });
  return schema.parse(raw);
}

export async function requireUser() {
  const id = await getUserId();
  if (!id) throw new HttpError(401, "Not signed in.");
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) throw new HttpError(401, "Not signed in.");
  return user;
}

export async function requireCompleteUser() {
  const user = await requireUser();
  if (!isProfileComplete(user)) throw new HttpError(403, "Finish your profile first.");
  return user;
}

export async function requireMember(groupId: string, userId: string) {
  const membership = await prisma.membership.findUnique({
    where: { userId_groupId: { userId, groupId } },
    include: { group: true },
  });
  if (!membership) throw new HttpError(404, "Not found.");
  const { group, ...rest } = membership;
  return { group, membership: rest };
}

export async function requireAdmin(groupId: string, userId: string) {
  const res = await requireMember(groupId, userId);
  if (res.membership.role !== "admin") throw new HttpError(403, "Only the group admin can do that.");
  return res;
}

export async function requireOutingMember(outingId: string, userId: string) {
  const outing = await prisma.outing.findUnique({ where: { id: outingId } });
  if (!outing) throw new HttpError(404, "Not found.");
  const { membership } = await requireMember(outing.groupId, userId);
  return { outing, membership };
}
```

- [ ] **Step 6: Write guard integration test**

`tests/api/guards.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { resetDb } from "../helpers/db";
import { asUser, call } from "../helpers/http";
import { makeCompleteUser, makeGroup, makeUser } from "../helpers/factories";
import { route, ok, requireUser, requireMember, requireAdmin, requireCompleteUser } from "@/lib/http";

const memberOnly = route<{ id: string }>(async (_req, { params }) => {
  const user = await requireUser();
  const { id } = await params;
  await requireMember(id, user.id);
  return ok({ ok: true });
});
const adminOnly = route<{ id: string }>(async (_req, { params }) => {
  const user = await requireUser();
  await requireAdmin((await params).id, user.id);
  return ok({ ok: true });
});
const completeOnly = route(async () => {
  await requireCompleteUser();
  return ok({ ok: true });
});

describe("guards", () => {
  beforeEach(resetDb);

  it("401 when signed out", async () => {
    await asUser(null);
    expect((await call(memberOnly, { params: { id: "x" } })).status).toBe(401);
  });

  it("404 for non-members and unknown groups, 200 for members", async () => {
    const admin = await makeCompleteUser();
    const outsider = await makeCompleteUser();
    const g = await makeGroup(admin.id);
    await asUser(outsider.id);
    expect((await call(memberOnly, { params: { id: g.id } })).status).toBe(404);
    expect((await call(memberOnly, { params: { id: "nope" } })).status).toBe(404);
    await asUser(admin.id);
    expect((await call(memberOnly, { params: { id: g.id } })).status).toBe(200);
  });

  it("403 for non-admin members on admin actions", async () => {
    const admin = await makeCompleteUser();
    const member = await makeCompleteUser();
    const g = await makeGroup(admin.id, [member.id]);
    await asUser(member.id);
    expect((await call(adminOnly, { params: { id: g.id } })).status).toBe(403);
  });

  it("403 for incomplete profiles on complete-only routes", async () => {
    const u = await makeUser();
    await asUser(u.id);
    const res = await call(completeOnly);
    expect(res.status).toBe(403);
    expect(res.json.error).toBe("Finish your profile first.");
  });
});
```

- [ ] **Step 7: Run** — `npx vitest run tests/unit/profile.test.ts tests/api/guards.test.ts` → PASS.

- [ ] **Step 8: Commit**

```bash
git add src/lib/http.ts src/lib/serialize.ts src/lib/profile.ts tests/unit/profile.test.ts tests/api/guards.test.ts
git commit -m "feat: route wrapper, membership guards, public serializers"
```

---

### Task 4: Phone OTP hardening, fakes guard, profile and me APIs

**Files:**
- Create: `src/lib/fakes.ts`, `src/lib/phone.ts`
- Modify: `src/lib/otp.ts`, `src/app/api/auth/request-otp/route.ts`, `src/app/api/auth/verify-otp/route.ts`, `src/app/api/profile/route.ts`, `src/app/api/me/route.ts`
- Test: `tests/unit/fakes.test.ts`, `tests/api/auth-otp.test.ts`, `tests/api/profile.test.ts`

**Interfaces:**
- Produces: `fakesEnabled(): boolean` (throws `Error("WAYPOINT_FAKES cannot be enabled in production")` when `NODE_ENV === "production"` and `WAYPOINT_FAKES === "1"`); `toE164India(raw: string): string | null`; `OTP_RATE_LIMIT = { max: 3, windowMs: 15 * 60_000 }`.
- `POST /api/auth/request-otp {phone}` → `200 {ok}` | `400` | `429 {error: "Too many codes. Try again in a few minutes."}` | `502`.
- `POST /api/auth/verify-otp {phone, code}` → `200 {ok, needsProfile: boolean}`.
- `PUT /api/profile` body = `ProfileSchema` → `200 {ok, profile: selfProfile}`; `409 {error: "That email is already used by another account."}`.
- `GET /api/me` → `200 {profile: selfProfile}` | `401`.

- [ ] **Step 1: Failing test for the fakes guard (Review Focus #5)**

`tests/unit/fakes.test.ts`:

```ts
import { describe, it, expect, afterEach, vi } from "vitest";
import { fakesEnabled } from "@/lib/fakes";

describe("fakesEnabled", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("is true in test with WAYPOINT_FAKES=1", () => {
    expect(fakesEnabled()).toBe(true);
  });
  it("is false without the flag", () => {
    vi.stubEnv("WAYPOINT_FAKES", "");
    expect(fakesEnabled()).toBe(false);
  });
  it("throws in production with the flag set", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(() => fakesEnabled()).toThrow(/cannot be enabled in production/);
  });
});
```

- [ ] **Step 2: Run** — FAIL (module missing).

- [ ] **Step 3: Implement `src/lib/fakes.ts` and `src/lib/phone.ts`**

```ts
// src/lib/fakes.ts
// Fakes give a fixed OTP and canned map/AI data for tests and E2E runs.
// In production this would be a login backdoor, so it is refused outright.
export function fakesEnabled(): boolean {
  if (process.env.WAYPOINT_FAKES !== "1") return false;
  if (process.env.NODE_ENV === "production") {
    throw new Error("WAYPOINT_FAKES cannot be enabled in production");
  }
  return true;
}
```

```ts
// src/lib/phone.ts
import { normalizePhone } from "@/lib/otp";

export function toE164India(raw: string): string | null {
  let digits = normalizePhone(raw);
  if (digits.length === 10) digits = "91" + digits;
  if (digits.length === 12 && digits.startsWith("91")) return digits;
  return null;
}
```

- [ ] **Step 4: Modify `src/lib/otp.ts`** — fixed code and no SMS under fakes; export the rate limit.

Replace `generateOtp` and the start of `sendOtpSms`:

```ts
import { fakesEnabled } from "@/lib/fakes";

export const OTP_RATE_LIMIT = { max: 3, windowMs: 15 * 60 * 1000 };

/** Four-digit numeric code. */
export function generateOtp(): string {
  if (fakesEnabled()) return "1234";
  return String(Math.floor(1000 + Math.random() * 9000));
}
```

and as the first line inside `sendOtpSms`:

```ts
  if (fakesEnabled()) return true;
```

- [ ] **Step 5: Failing OTP API test**

`tests/api/auth-otp.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { resetDb } from "../helpers/db";
import { asUser, call } from "../helpers/http";
import { POST as requestOtp } from "@/app/api/auth/request-otp/route";
import { POST as verifyOtp } from "@/app/api/auth/verify-otp/route";
import { prisma } from "@/lib/db";

describe("phone OTP", () => {
  beforeEach(async () => { await resetDb(); await asUser(null); });

  it("rejects invalid numbers", async () => {
    expect((await call(requestOtp, { method: "POST", body: { phone: "123" } })).status).toBe(400);
  });

  it("signs in with the code and reports profile needed", async () => {
    expect((await call(requestOtp, { method: "POST", body: { phone: "9876543210" } })).status).toBe(200);
    const res = await call(verifyOtp, { method: "POST", body: { phone: "9876543210", code: "1234" } });
    expect(res.status).toBe(200);
    expect(res.json.needsProfile).toBe(true);
    expect(await prisma.user.count({ where: { phone: "919876543210" } })).toBe(1);
  });

  it("rate limits to 3 codes per 15 minutes", async () => {
    for (let i = 0; i < 3; i++) {
      expect((await call(requestOtp, { method: "POST", body: { phone: "9876500000" } })).status).toBe(200);
    }
    const res = await call(requestOtp, { method: "POST", body: { phone: "9876500000" } });
    expect(res.status).toBe(429);
  });

  it("locks after 5 wrong attempts", async () => {
    await call(requestOtp, { method: "POST", body: { phone: "9876511111" } });
    for (let i = 0; i < 5; i++) {
      expect((await call(verifyOtp, { method: "POST", body: { phone: "9876511111", code: "0000" } })).status).toBe(401);
    }
    const res = await call(verifyOtp, { method: "POST", body: { phone: "9876511111", code: "1234" } });
    expect(res.status).toBe(429);
  });

  it("rejects expired codes", async () => {
    await call(requestOtp, { method: "POST", body: { phone: "9876522222" } });
    await prisma.otpChallenge.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
    const res = await call(verifyOtp, { method: "POST", body: { phone: "9876522222", code: "1234" } });
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 6: Rewrite `src/app/api/auth/request-otp/route.ts`**

```ts
import { z } from "zod";
import { prisma } from "@/lib/db";
import { route, ok, parseBody, HttpError } from "@/lib/http";
import { generateOtp, hashOtp, sendOtpSms, OTP_TTL_MS, OTP_RATE_LIMIT } from "@/lib/otp";
import { toE164India } from "@/lib/phone";

const Body = z.object({ phone: z.string() });

export const POST = route(async (req) => {
  const { phone } = await parseBody(req, Body);
  const mobile = toE164India(phone);
  if (!mobile) throw new HttpError(400, "Enter a valid 10-digit mobile number.");

  const since = new Date(Date.now() - OTP_RATE_LIMIT.windowMs);
  const recent = await prisma.otpChallenge.count({ where: { phone: mobile, createdAt: { gte: since } } });
  if (recent >= OTP_RATE_LIMIT.max) {
    throw new HttpError(429, "Too many codes. Try again in a few minutes.");
  }

  // Keep recent rows for rate limiting; drop day-old ones.
  await prisma.otpChallenge.deleteMany({
    where: { phone: mobile, createdAt: { lt: new Date(Date.now() - 24 * 3600_000) } },
  });

  const code = generateOtp();
  await prisma.otpChallenge.create({
    data: { phone: mobile, codeHash: hashOtp(mobile, code), expiresAt: new Date(Date.now() + OTP_TTL_MS) },
  });

  if (!(await sendOtpSms(mobile, code))) {
    throw new HttpError(502, "Couldn't send the code. Try again in a moment.");
  }
  return ok({ ok: true });
});
```

- [ ] **Step 7: Rewrite `src/app/api/auth/verify-otp/route.ts`**

```ts
import { z } from "zod";
import { prisma } from "@/lib/db";
import { route, ok, parseBody, HttpError } from "@/lib/http";
import { hashOtp, normalizePhone, MAX_ATTEMPTS } from "@/lib/otp";
import { toE164India } from "@/lib/phone";
import { createSession } from "@/lib/session";
import { isProfileComplete } from "@/lib/profile";

const Body = z.object({ phone: z.string(), code: z.string() });

export const POST = route(async (req) => {
  const body = await parseBody(req, Body);
  const mobile = toE164India(body.phone);
  const entered = normalizePhone(body.code);
  if (!mobile || entered.length !== 4) throw new HttpError(400, "Invalid request.");

  const challenge = await prisma.otpChallenge.findFirst({
    where: { phone: mobile },
    orderBy: { createdAt: "desc" },
  });
  if (!challenge || challenge.expiresAt < new Date()) {
    throw new HttpError(400, "This code expired. Request a new one.");
  }
  if (challenge.attempts >= MAX_ATTEMPTS) throw new HttpError(429, "Too many tries. Request a new code.");

  if (challenge.codeHash !== hashOtp(mobile, entered)) {
    await prisma.otpChallenge.update({ where: { id: challenge.id }, data: { attempts: { increment: 1 } } });
    throw new HttpError(401, "That code isn't right.");
  }

  // Consume this challenge (keep older rows for the rate-limit window).
  await prisma.otpChallenge.update({ where: { id: challenge.id }, data: { expiresAt: new Date(0) } });

  const user =
    (await prisma.user.findUnique({ where: { phone: mobile } })) ??
    (await prisma.user.create({ data: { phone: mobile } }));
  await createSession(user.id);
  return ok({ ok: true, needsProfile: !isProfileComplete(user) });
});
```

Update `src/lib/api.ts` `verifyOtp` return type to `Promise<{ ok: true; needsProfile: boolean }>` and change `src/app/signin/page.tsx` to read `needsProfile` instead of `isNew` (search the file for `isNew`).

- [ ] **Step 8: Failing profile/me test**

`tests/api/profile.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { resetDb } from "../helpers/db";
import { asUser, call } from "../helpers/http";
import { makeUser, makeCompleteUser } from "../helpers/factories";
import { PUT as putProfile } from "@/app/api/profile/route";
import { GET as getMe } from "@/app/api/me/route";

const body = {
  name: "Aisha", email: "Aisha@Example.com", age: 27, gender: "female",
  home: { lat: 12.97111, lng: 77.64111, label: "Indiranagar" },
  work: { lat: 12.93222, lng: 77.62222, label: "Koramangala" },
  transport: "public", interests: ["coffee"], openness: 4, homeBy: null,
};

describe("profile API", () => {
  beforeEach(resetDb);

  it("saves a complete profile and lowercases email", async () => {
    const u = await makeUser();
    await asUser(u.id);
    const res = await call(putProfile, { method: "PUT", body });
    expect(res.status).toBe(200);
    expect(res.json.profile.email).toBe("aisha@example.com");
    expect(res.json.profile.profileComplete).toBe(true);
    const me = await call(getMe);
    expect(me.json.profile.home.lat).toBe(12.97111);
  });

  it("requires gender and email", async () => {
    const u = await makeUser();
    await asUser(u.id);
    expect((await call(putProfile, { method: "PUT", body: { ...body, gender: undefined } })).status).toBe(400);
    expect((await call(putProfile, { method: "PUT", body: { ...body, email: "" } })).status).toBe(400);
  });

  it("409 when the email belongs to someone else", async () => {
    await makeCompleteUser({ email: "taken@example.com" });
    const u = await makeUser();
    await asUser(u.id);
    const res = await call(putProfile, { method: "PUT", body: { ...body, email: "taken@example.com" } });
    expect(res.status).toBe(409);
  });

  it("401 signed out", async () => {
    await asUser(null);
    expect((await call(getMe)).status).toBe(401);
  });
});
```

- [ ] **Step 9: Rewrite `src/app/api/profile/route.ts` and `src/app/api/me/route.ts`**

```ts
// src/app/api/profile/route.ts
import { prisma } from "@/lib/db";
import { route, ok, parseBody, requireUser, HttpError } from "@/lib/http";
import { ProfileSchema } from "@/lib/profile";
import { selfProfile } from "@/lib/serialize";

export const PUT = route(async (req) => {
  const user = await requireUser();
  const p = await parseBody(req, ProfileSchema);

  const clash = await prisma.user.findUnique({ where: { email: p.email } });
  if (clash && clash.id !== user.id) throw new HttpError(409, "That email is already used by another account.");

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: {
      name: p.name, email: p.email, age: p.age, gender: p.gender, homeBy: p.homeBy,
      homeLat: p.home.lat, homeLng: p.home.lng, homeLabel: p.home.label,
      workLat: p.work.lat, workLng: p.work.lng, workLabel: p.work.label,
      transport: p.transport, interests: p.interests, openness: p.openness,
    },
  });
  return ok({ ok: true, profile: selfProfile(updated) });
});
```

```ts
// src/app/api/me/route.ts
import { route, ok, requireUser } from "@/lib/http";
import { selfProfile } from "@/lib/serialize";

export const GET = route(async () => {
  const user = await requireUser();
  return ok({ profile: selfProfile(user) });
});
```

- [ ] **Step 10: Run** — `npx vitest run tests/unit/fakes.test.ts tests/api/auth-otp.test.ts tests/api/profile.test.ts` → PASS. `npx tsc --noEmit` → clean.

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -m "feat: OTP rate limiting, fakes guard, validated profile API"
```

---

### Task 5: Google sign-in and account linking

**Files:**
- Create: `src/lib/google-auth.ts`, `src/app/api/auth/google/route.ts`, `src/app/api/auth/google/callback/route.ts`
- Test: `tests/api/google-auth.test.ts`

**Interfaces:**
- Consumes: `createSession`, `getUserId`, `prisma`, `isProfileComplete`.
- Produces:
  - `google(): Google` (arctic client, redirect `${APP_URL}/api/auth/google/callback`)
  - `resolveGoogleUser(claims: { sub: string; email: string; emailVerified: boolean; name?: string }, currentUserId: string | null): Promise<User>` — throws `HttpError(400, "Your Google email isn't verified.")`; throws `HttpError(409, "That Google account is linked to a different user.")` when linking a `sub` already owned by another user.
  - `GET /api/auth/google?link=1` → 302 to Google, sets `g_state`, `g_verifier`, `g_link` cookies (httpOnly, 10 min).
  - `GET /api/auth/google/callback?code&state` → 302 to `/onboarding` (incomplete) or `/groups`; on error 302 to `/signin?error=google`.

- [ ] **Step 1: Failing linking test**

`tests/api/google-auth.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { resetDb } from "../helpers/db";
import { makeUser, makeCompleteUser } from "../helpers/factories";
import { resolveGoogleUser } from "@/lib/google-auth";
import { prisma } from "@/lib/db";

const claims = { sub: "g-123", email: "Friend@Gmail.com", emailVerified: true, name: "Friend" };

describe("resolveGoogleUser", () => {
  beforeEach(resetDb);

  it("creates a new user with lowercased email", async () => {
    const u = await resolveGoogleUser(claims, null);
    expect(u.googleId).toBe("g-123");
    expect(u.email).toBe("friend@gmail.com");
    expect(u.name).toBe("Friend");
  });

  it("returns the existing user for a known googleId", async () => {
    const a = await resolveGoogleUser(claims, null);
    const b = await resolveGoogleUser(claims, null);
    expect(b.id).toBe(a.id);
  });

  it("links to an existing account with the same email", async () => {
    const existing = await makeCompleteUser({ email: "friend@gmail.com" });
    const u = await resolveGoogleUser(claims, null);
    expect(u.id).toBe(existing.id);
    expect(u.googleId).toBe("g-123");
  });

  it("links to the signed-in user when linking from profile", async () => {
    const me = await makeUser();
    const u = await resolveGoogleUser(claims, me.id);
    expect(u.id).toBe(me.id);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: me.id } })).email).toBe("friend@gmail.com");
  });

  it("refuses to link a Google account owned by someone else", async () => {
    await resolveGoogleUser(claims, null);
    const me = await makeUser();
    await expect(resolveGoogleUser(claims, me.id)).rejects.toThrow(/different user/);
  });

  it("refuses unverified emails", async () => {
    await expect(resolveGoogleUser({ ...claims, emailVerified: false }, null)).rejects.toThrow(/verified/);
  });
});
```

- [ ] **Step 2: Run** — FAIL.

- [ ] **Step 3: Implement `src/lib/google-auth.ts`**

Read `node_modules/arctic/README.md` (or `dist/providers/google.d.ts`) first to confirm the v3 signatures used below.

```ts
import { Google } from "arctic";
import type { User } from "@prisma/client";
import { prisma } from "@/lib/db";
import { HttpError } from "@/lib/http";

export function google() {
  const base = process.env.APP_URL ?? "http://localhost:3000";
  return new Google(
    process.env.GOOGLE_CLIENT_ID ?? "",
    process.env.GOOGLE_CLIENT_SECRET ?? "",
    `${base}/api/auth/google/callback`
  );
}

export interface GoogleClaims {
  sub: string;
  email: string;
  emailVerified: boolean;
  name?: string;
}

export async function resolveGoogleUser(c: GoogleClaims, currentUserId: string | null): Promise<User> {
  if (!c.emailVerified) throw new HttpError(400, "Your Google email isn't verified.");
  const email = c.email.trim().toLowerCase();
  const byGoogle = await prisma.user.findUnique({ where: { googleId: c.sub } });

  if (currentUserId) {
    if (byGoogle && byGoogle.id !== currentUserId) {
      throw new HttpError(409, "That Google account is linked to a different user.");
    }
    const me = await prisma.user.findUniqueOrThrow({ where: { id: currentUserId } });
    const emailOwner = await prisma.user.findUnique({ where: { email } });
    return prisma.user.update({
      where: { id: currentUserId },
      data: {
        googleId: c.sub,
        email: me.email ?? (emailOwner && emailOwner.id !== me.id ? undefined : email),
      },
    });
  }

  if (byGoogle) return byGoogle;

  const byEmail = await prisma.user.findUnique({ where: { email } });
  if (byEmail) return prisma.user.update({ where: { id: byEmail.id }, data: { googleId: c.sub } });

  return prisma.user.create({ data: { googleId: c.sub, email, name: c.name ?? null } });
}
```

- [ ] **Step 4: Implement the two routes**

```ts
// src/app/api/auth/google/route.ts
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { generateState, generateCodeVerifier } from "arctic";
import { google } from "@/lib/google-auth";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const state = generateState();
  const verifier = generateCodeVerifier();
  const authUrl = google().createAuthorizationURL(state, verifier, ["openid", "profile", "email"]);

  const store = await cookies();
  const opts = { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax" as const, path: "/", maxAge: 600 };
  store.set("g_state", state, opts);
  store.set("g_verifier", verifier, opts);
  store.set("g_link", url.searchParams.get("link") === "1" ? "1" : "0", opts);
  return NextResponse.redirect(authUrl);
}
```

```ts
// src/app/api/auth/google/callback/route.ts
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { decodeIdToken } from "arctic";
import { google, resolveGoogleUser } from "@/lib/google-auth";
import { createSession, getUserId } from "@/lib/session";
import { isProfileComplete } from "@/lib/profile";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const base = process.env.APP_URL ?? url.origin;
  const fail = NextResponse.redirect(`${base}/signin?error=google`);

  const store = await cookies();
  const state = store.get("g_state")?.value;
  const verifier = store.get("g_verifier")?.value;
  const linking = store.get("g_link")?.value === "1";
  store.delete("g_state");
  store.delete("g_verifier");
  store.delete("g_link");

  const code = url.searchParams.get("code");
  if (!code || !state || !verifier || url.searchParams.get("state") !== state) return fail;

  try {
    const tokens = await google().validateAuthorizationCode(code, verifier);
    const claims = decodeIdToken(tokens.idToken()) as {
      sub: string; email: string; email_verified: boolean; name?: string;
    };
    const user = await resolveGoogleUser(
      { sub: claims.sub, email: claims.email, emailVerified: claims.email_verified, name: claims.name },
      linking ? await getUserId() : null
    );
    await createSession(user.id);
    if (linking) return NextResponse.redirect(`${base}/profile?linked=google`);
    return NextResponse.redirect(`${base}${isProfileComplete(user) ? "/groups" : "/onboarding"}`);
  } catch (err) {
    console.error("[google] callback failed", err);
    return fail;
  }
}
```

- [ ] **Step 5: Add a test for state mismatch** (append to `tests/api/google-auth.test.ts`)

```ts
import { GET as callback } from "@/app/api/auth/google/callback/route";
import { asUser } from "../helpers/http";

describe("google callback", () => {
  it("redirects to sign-in on state mismatch", async () => {
    await asUser(null);
    (globalThis as any).__jar.set("g_state", "expected");
    (globalThis as any).__jar.set("g_verifier", "v");
    const res = await callback(new Request("http://localhost:3200/api/auth/google/callback?code=c&state=wrong"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/signin?error=google");
  });
});
```

- [ ] **Step 6: Run** — `npx vitest run tests/api/google-auth.test.ts` → PASS.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: Google sign-in with account linking"
```

---

### Task 6: Effective home-by deadline rule

**Files:**
- Create: `src/lib/deadline.ts`
- Test: `tests/unit/deadline.test.ts`

**Interfaces:**
- Consumes: `dayOrderMinutes` from `src/lib/time.ts`.
- Produces: `FEMALE_DEFAULT_HOME_BY = "23:00"`; `effectiveDeadline(user: { homeBy: string | null; gender: Gender | null }, groupHomeBy: string | null): string | null`.

- [ ] **Step 1: Failing test (includes Review Focus #1)**

```ts
import { describe, it, expect } from "vitest";
import { effectiveDeadline } from "@/lib/deadline";

describe("effectiveDeadline", () => {
  it("is null when nothing applies", () => {
    expect(effectiveDeadline({ homeBy: null, gender: "male" }, null)).toBeNull();
  });
  it("uses personal homeBy", () => {
    expect(effectiveDeadline({ homeBy: "22:00", gender: "male" }, null)).toBe("22:00");
  });
  it("defaults women to 23:00 when no personal time is set", () => {
    expect(effectiveDeadline({ homeBy: null, gender: "female" }, null)).toBe("23:00");
  });
  it("lets a personal time replace the female default", () => {
    expect(effectiveDeadline({ homeBy: "23:45", gender: "female" }, null)).toBe("23:45");
  });
  it("takes the earliest of personal and group", () => {
    expect(effectiveDeadline({ homeBy: "22:00", gender: "male" }, "21:30")).toBe("21:30");
    expect(effectiveDeadline({ homeBy: null, gender: "female" }, "23:30")).toBe("23:00");
  });
  it("treats after-midnight times as later than evening times", () => {
    expect(effectiveDeadline({ homeBy: "00:30", gender: "male" }, "23:00")).toBe("23:00");
    expect(effectiveDeadline({ homeBy: "00:30", gender: "male" }, null)).toBe("00:30");
  });
});
```

- [ ] **Step 2: Run** — FAIL.

- [ ] **Step 3: Implement**

```ts
import type { Gender } from "@prisma/client";
import { dayOrderMinutes } from "@/lib/time";

export const FEMALE_DEFAULT_HOME_BY = "23:00";

export function effectiveDeadline(
  user: { homeBy: string | null; gender: Gender | null },
  groupHomeBy: string | null
): string | null {
  const candidates: string[] = [];
  if (user.homeBy) candidates.push(user.homeBy);
  else if (user.gender === "female") candidates.push(FEMALE_DEFAULT_HOME_BY);
  if (groupHomeBy) candidates.push(groupHomeBy);
  if (candidates.length === 0) return null;
  return candidates.reduce((a, b) => (dayOrderMinutes(b) < dayOrderMinutes(a) ? b : a));
}
```

- [ ] **Step 4: Run** → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/deadline.ts tests/unit/deadline.test.ts
git commit -m "feat: effective home-by deadline rule"
```

---

### Task 7: Group admin — roles, invite rotation, member removal, group detail

**Files:**
- Modify: `src/app/api/groups/route.ts`, `src/app/api/groups/[id]/route.ts`, `src/app/api/join/[code]/route.ts`, `src/lib/auth.ts`
- Create: `src/app/api/groups/[id]/invite/route.ts`, `src/app/api/groups/[id]/members/[userId]/route.ts`
- Test: `tests/api/groups.test.ts`

**Interfaces:**
- `GET /api/groups` → `{ groups: { id; name; memberCount; role }[] }`
- `POST /api/groups {name}` → `{ ok, group: { id } }` (creator membership `role: admin`; requires complete profile)
- `GET /api/groups/[id]` → `{ group: { id; name; inviteCode; myRole; members: PublicMember[] }, outings: OutingSummary[] }` where `OutingSummary = { id; title; status; date: string|null; rangeStart; rangeEnd; goingCount; createdAt }`
- `POST /api/groups/[id]/invite` (admin) → `{ inviteCode }`
- `DELETE /api/groups/[id]/members/[userId]` (admin; cannot remove self) → `{ ok }`
- `GET /api/join/[code]` → `{ group: { id; name; memberCount } }` (no member names to non-members)
- `POST /api/join/[code]` → `{ ok, groupId }` (requires complete profile — the join page sends incomplete users to onboarding first)

- [ ] **Step 1: Failing tests**

`tests/api/groups.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { resetDb } from "../helpers/db";
import { asUser, call } from "../helpers/http";
import { makeCompleteUser, makeGroup, makeUser } from "../helpers/factories";
import { GET as listGroups, POST as createGroup } from "@/app/api/groups/route";
import { GET as getGroup } from "@/app/api/groups/[id]/route";
import { POST as rotate } from "@/app/api/groups/[id]/invite/route";
import { DELETE as removeMember } from "@/app/api/groups/[id]/members/[userId]/route";
import { GET as previewJoin, POST as join } from "@/app/api/join/[code]/route";
import { prisma } from "@/lib/db";

describe("groups API", () => {
  beforeEach(resetDb);

  it("creator becomes admin; incomplete users cannot create", async () => {
    const u = await makeCompleteUser();
    await asUser(u.id);
    const res = await call(createGroup, { method: "POST", body: { name: "Weekenders" } });
    expect(res.status).toBe(200);
    const m = await prisma.membership.findFirstOrThrow({ where: { groupId: res.json.group.id } });
    expect(m.role).toBe("admin");

    const inc = await makeUser();
    await asUser(inc.id);
    expect((await call(createGroup, { method: "POST", body: { name: "X" } })).status).toBe(403);
  });

  it("lists only my groups with role", async () => {
    const a = await makeCompleteUser();
    const b = await makeCompleteUser();
    await makeGroup(a.id);
    await makeGroup(b.id);
    await asUser(a.id);
    const res = await call(listGroups);
    expect(res.json.groups).toHaveLength(1);
    expect(res.json.groups[0].role).toBe("admin");
  });

  it("join preview hides member names; join works and is idempotent", async () => {
    const a = await makeCompleteUser({ name: "Secret Name" });
    const g = await makeGroup(a.id);
    const b = await makeCompleteUser();
    await asUser(b.id);
    const preview = await call(previewJoin, { params: { code: g.inviteCode.toLowerCase() } });
    expect(preview.status).toBe(200);
    expect(JSON.stringify(preview.json)).not.toContain("Secret Name");
    expect((await call(join, { method: "POST", params: { code: g.inviteCode } })).status).toBe(200);
    expect((await call(join, { method: "POST", params: { code: g.inviteCode } })).status).toBe(200);
    expect(await prisma.membership.count({ where: { groupId: g.id } })).toBe(2);
  });

  it("rotating the invite kills the old code", async () => {
    const a = await makeCompleteUser();
    const g = await makeGroup(a.id);
    await asUser(a.id);
    const res = await call(rotate, { method: "POST", params: { id: g.id } });
    expect(res.json.inviteCode).not.toBe(g.inviteCode);
    const b = await makeCompleteUser();
    await asUser(b.id);
    expect((await call(join, { method: "POST", params: { code: g.inviteCode } })).status).toBe(404);
  });

  it("admin removes a member who then gets 404 (Review Focus #4)", async () => {
    const a = await makeCompleteUser();
    const b = await makeCompleteUser();
    const g = await makeGroup(a.id, [b.id]);
    await asUser(b.id);
    expect((await call(removeMember, { method: "DELETE", params: { id: g.id, userId: a.id } })).status).toBe(403);
    await asUser(a.id);
    expect((await call(removeMember, { method: "DELETE", params: { id: g.id, userId: a.id } })).status).toBe(400);
    expect((await call(removeMember, { method: "DELETE", params: { id: g.id, userId: b.id } })).status).toBe(200);
    await asUser(b.id);
    expect((await call(getGroup, { params: { id: g.id } })).status).toBe(404);
  });

  it("group detail never includes exact coordinates", async () => {
    const a = await makeCompleteUser({ homeLat: 12.97123, homeLng: 77.64123, workLat: 12.93456, workLng: 77.62456 });
    const g = await makeGroup(a.id);
    await asUser(a.id);
    const res = await call(getGroup, { params: { id: g.id } });
    const s = JSON.stringify(res.json);
    for (const v of ["12.97123", "77.64123", "12.93456", "77.62456"]) expect(s).not.toContain(v);
    expect(res.json.group.members[0].homeArea).toEqual({ lat: 12.97, lng: 77.64 });
  });
});
```

- [ ] **Step 2: Run** — FAIL.

- [ ] **Step 3: Implement routes**

In `src/lib/auth.ts`, keep `makeInviteCode` and delete `currentUser` (replaced by `requireUser`); fix any importers (`grep -rn currentUser src`).

```ts
// src/app/api/groups/route.ts
import { z } from "zod";
import { prisma } from "@/lib/db";
import { route, ok, parseBody, requireUser, requireCompleteUser, HttpError } from "@/lib/http";
import { makeInviteCode } from "@/lib/auth";

export const GET = route(async () => {
  const user = await requireUser();
  const memberships = await prisma.membership.findMany({
    where: { userId: user.id },
    include: { group: { include: { _count: { select: { memberships: true } } } } },
    orderBy: { joinedAt: "desc" },
  });
  return ok({
    groups: memberships.map((m) => ({
      id: m.group.id,
      name: m.group.name,
      memberCount: m.group._count.memberships,
      role: m.role,
    })),
  });
});

const Create = z.object({ name: z.string().trim().min(1, "Name your group.").max(60) });

export const POST = route(async (req) => {
  const user = await requireCompleteUser();
  const { name } = await parseBody(req, Create);
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const group = await prisma.group.create({
        data: {
          name,
          inviteCode: makeInviteCode(),
          createdById: user.id,
          memberships: { create: { userId: user.id, role: "admin" } },
        },
      });
      return ok({ ok: true, group: { id: group.id } });
    } catch {
      // invite code collision — retry
    }
  }
  throw new HttpError(500, "Couldn't create the group. Try again.");
});
```

```ts
// src/app/api/groups/[id]/route.ts
import { prisma } from "@/lib/db";
import { route, ok, requireUser, requireMember } from "@/lib/http";
import { publicMember } from "@/lib/serialize";

export const GET = route<{ id: string }>(async (_req, { params }) => {
  const user = await requireUser();
  const { id } = await params;
  const { group, membership } = await requireMember(id, user.id);

  const memberships = await prisma.membership.findMany({
    where: { groupId: id },
    include: { user: true },
    orderBy: { joinedAt: "asc" },
  });
  const outings = await prisma.outing.findMany({
    where: { groupId: id },
    orderBy: { createdAt: "desc" },
    include: { rsvps: { where: { status: "going" }, select: { id: true } } },
  });

  return ok({
    group: {
      id: group.id,
      name: group.name,
      inviteCode: group.inviteCode,
      myRole: membership.role,
      members: memberships.map((m) => publicMember(m.user, m.role)),
    },
    outings: outings.map((o) => ({
      id: o.id, title: o.title, status: o.status, date: o.date,
      rangeStart: o.rangeStart, rangeEnd: o.rangeEnd,
      goingCount: o.rsvps.length, createdAt: o.createdAt,
    })),
  });
});
```

```ts
// src/app/api/groups/[id]/invite/route.ts
import { prisma } from "@/lib/db";
import { route, ok, requireUser, requireAdmin, HttpError } from "@/lib/http";
import { makeInviteCode } from "@/lib/auth";

export const POST = route<{ id: string }>(async (_req, { params }) => {
  const user = await requireUser();
  const { id } = await params;
  await requireAdmin(id, user.id);
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const g = await prisma.group.update({ where: { id }, data: { inviteCode: makeInviteCode() } });
      return ok({ inviteCode: g.inviteCode });
    } catch {
      // collision — retry
    }
  }
  throw new HttpError(500, "Couldn't make a new link. Try again.");
});
```

```ts
// src/app/api/groups/[id]/members/[userId]/route.ts
import { prisma } from "@/lib/db";
import { route, ok, requireUser, requireAdmin, HttpError } from "@/lib/http";

export const DELETE = route<{ id: string; userId: string }>(async (_req, { params }) => {
  const user = await requireUser();
  const { id, userId } = await params;
  await requireAdmin(id, user.id);
  if (userId === user.id) throw new HttpError(400, "You can't remove yourself.");
  const res = await prisma.membership.deleteMany({ where: { groupId: id, userId } });
  if (res.count === 0) throw new HttpError(404, "Not found.");
  return ok({ ok: true });
});
```

```ts
// src/app/api/join/[code]/route.ts
import { prisma } from "@/lib/db";
import { route, ok, requireUser, requireCompleteUser, HttpError } from "@/lib/http";

async function findByCode(code: string) {
  const group = await prisma.group.findUnique({
    where: { inviteCode: code.toUpperCase() },
    include: { _count: { select: { memberships: true } } },
  });
  if (!group) throw new HttpError(404, "Invite not found.");
  return group;
}

export const GET = route<{ code: string }>(async (_req, { params }) => {
  await requireUser();
  const group = await findByCode((await params).code);
  return ok({ group: { id: group.id, name: group.name, memberCount: group._count.memberships } });
});

export const POST = route<{ code: string }>(async (_req, { params }) => {
  const user = await requireCompleteUser();
  const group = await findByCode((await params).code);
  await prisma.membership.upsert({
    where: { userId_groupId: { userId: user.id, groupId: group.id } },
    create: { userId: user.id, groupId: group.id, role: "member" },
    update: {},
  });
  return ok({ ok: true, groupId: group.id });
});
```

Update `src/app/join/[code]/page.tsx`: it previously rendered `group.members`; render `memberCount` instead ("{n} friends are in"). If `GET` returns 401, redirect to `/signin?next=/join/<code>`; if `POST` returns 403 "Finish your profile first.", redirect to `/onboarding?next=/join/<code>`.

- [ ] **Step 4: Run** — `npx vitest run tests/api/groups.test.ts` → PASS; `npx tsc --noEmit` → clean.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: group roles, invite rotation, member removal, private group detail"
```

---
## Phase B — Providers and Engine

### Task 8: Engine types and geo helpers

**Files:**
- Create: `src/lib/engine/types.ts`, `src/lib/engine/geo.ts`
- Test: `tests/unit/geo.test.ts`

**Interfaces:**
- Produces (`types.ts`) — every later engine/provider task uses exactly these names:

```ts
export const SLOT_KINDS = [
  "cafe", "restaurant", "gaming", "cinema", "beach",
  "park", "museum", "mall", "viewpoint", "street_food",
] as const;
export type SlotKind = (typeof SLOT_KINDS)[number];
export type Transport = "public" | "own";
export const THEMES = ["relaxed", "adventurous", "foodie"] as const;
export type Theme = (typeof THEMES)[number];

export interface LatLng { lat: number; lng: number }

export interface Attendee {
  id: string;
  name: string;
  home: LatLng;
  homeLabel: string;
  transport: Transport;
  interests: string[];
  openness: number; // 1–5
  deadline: string | null; // effective "HH:MM"
}

export interface Slot { startTime: string; durationMin: number; kind: SlotKind; vibe: string }
export interface OpeningWindow { open: string; close: string } // "HH:MM"

export interface Venue {
  id: string;
  name: string;
  lat: number;
  lng: number;
  kind: SlotKind;
  rating: number | null;      // 0–5
  priceLevel: 1 | 2 | 3 | 4 | null;
  opening: OpeningWindow | null;
  address: string | null;
  source: "osm" | "google" | "fake";
}

export interface Film { id: number; title: string; genres: string[]; rating: number; posterUrl: string | null }

export interface Stop { slot: Slot; venue: Venue; film: Film | null; startsAt: string; endsAt: string } // ISO

export interface RouteResult {
  distanceM: number;
  durationS: number;
  approximate: boolean;            // true when transit is estimated
  noService: boolean;              // true when transit has no route at that time
  geometry: [number, number][] | null; // [lat, lng]
}

export type LegEnd = "home" | number; // number = stop index
export interface Leg {
  attendeeId: string;
  from: LegEnd;
  to: LegEnd;
  mode: Transport;
  departAt: string; // ISO
  arriveAt: string; // ISO
  route: RouteResult;
}

export interface HomeByEntry {
  attendeeId: string;
  deadline: string | null;
  arriveHomeAt: string; // ISO
  ok: boolean;
  reason: "late" | "no_service" | null;
}

export interface CostLine { attendeeId: string; entry: number; food: number; travel: number; total: number } // paise

export interface Swot { strengths: string[]; weaknesses: string[]; opportunities: string[]; threats: string[] }
export interface Narrative { summary: string; swot: Swot }

export interface Evaluated {
  routes: Leg[];
  homeByReport: HomeByEntry[];
  costs: CostLine[];
  narrative: Narrative | null;
  approximateTransit: boolean;
}
export interface OptionResult extends Evaluated { theme: Theme; stops: Stop[] }

export type ProgressStep = "sketching" | "finding_venues" | "routing" | "checking_home" | "costing" | "writing";
```

- Produces (`geo.ts`): `haversineM(a: LatLng, b: LatLng): number`; `SPEED_KMH: Record<Transport, number>` (`public: 18, own: 25`); `estimateMinutes(a: LatLng, b: LatLng, mode: Transport): number`; `decodePolyline(encoded: string): [number, number][]`.

- [ ] **Step 1: Write `src/lib/engine/types.ts`** exactly as above.

- [ ] **Step 2: Failing geo test**

```ts
import { describe, it, expect } from "vitest";
import { haversineM, estimateMinutes, decodePolyline } from "@/lib/engine/geo";

const indiranagar = { lat: 12.9719, lng: 77.6412 };
const koramangala = { lat: 12.9352, lng: 77.6245 };

describe("geo", () => {
  it("measures distance in metres", () => {
    const d = haversineM(indiranagar, koramangala);
    expect(d).toBeGreaterThan(4000);
    expect(d).toBeLessThan(5000);
  });
  it("estimates public transport slower than own vehicle", () => {
    expect(estimateMinutes(indiranagar, koramangala, "public")).toBeGreaterThan(
      estimateMinutes(indiranagar, koramangala, "own")
    );
    expect(estimateMinutes(indiranagar, indiranagar, "own")).toBe(5);
  });
  it("decodes Google encoded polylines", () => {
    // Example from Google's polyline algorithm docs.
    expect(decodePolyline("_p~iF~ps|U_ulLnnqC_mqNvxq`@")).toEqual([
      [38.5, -120.2], [40.7, -120.95], [43.252, -126.453],
    ]);
  });
});
```

- [ ] **Step 3: Run** — FAIL.

- [ ] **Step 4: Implement `src/lib/engine/geo.ts`**

```ts
import type { LatLng, Transport } from "./types";

const R = 6_371_000;
const rad = (d: number) => (d * Math.PI) / 180;

export function haversineM(a: LatLng, b: LatLng): number {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export const SPEED_KMH: Record<Transport, number> = { public: 18, own: 25 };
const OVERHEAD_MIN: Record<Transport, number> = { public: 10, own: 5 };
const DETOUR = 1.3; // roads are not straight lines

/** Cheap, network-free travel estimate used for scoring candidates. */
export function estimateMinutes(a: LatLng, b: LatLng, mode: Transport): number {
  const km = (haversineM(a, b) / 1000) * DETOUR;
  return Math.round((km / SPEED_KMH[mode]) * 60 + OVERHEAD_MIN[mode]);
}

export function decodePolyline(encoded: string): [number, number][] {
  const points: [number, number][] = [];
  let index = 0, lat = 0, lng = 0;
  while (index < encoded.length) {
    for (const which of [0, 1]) {
      let result = 0, shift = 0, b: number;
      do {
        b = encoded.charCodeAt(index++) - 63;
        result |= (b & 0x1f) << shift;
        shift += 5;
      } while (b >= 0x20);
      const delta = result & 1 ? ~(result >> 1) : result >> 1;
      if (which === 0) lat += delta; else lng += delta;
    }
    points.push([lat / 1e5, lng / 1e5]);
  }
  return points;
}
```

- [ ] **Step 5: Run** → PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/engine tests/unit/geo.test.ts
git commit -m "feat: engine types and geo helpers"
```

---

### Task 9: Provider interfaces, day templates, fakes, route cache, fallback

**Files:**
- Create: `src/lib/providers/types.ts`, `src/lib/engine/templates.ts`, `src/lib/providers/fake.ts`, `src/lib/providers/cache.ts`, `src/lib/providers/fallback.ts`
- Test: `tests/unit/providers-core.test.ts`

**Interfaces:**
- Produces (`providers/types.ts`):

```ts
import type { ZodType } from "zod";
import type { Film, LatLng, RouteResult, SlotKind, Transport, Venue } from "@/lib/engine/types";

export interface PlacesProvider {
  readonly name: string;
  search(center: LatLng, radiusM: number, kind: SlotKind): Promise<Venue[]>;
}
export interface RoutesProvider {
  readonly name: string;
  route(from: LatLng, to: LatLng, mode: Transport, departAt: Date): Promise<RouteResult>;
}
export interface MoviesProvider {
  nowPlaying(region: string): Promise<Film[]>;
}
export interface LlmRequest<T> {
  task: "sketch" | "narrate";
  system: string;
  user: string;
  schema: ZodType<T>;
}
export interface LlmProvider {
  json<T>(req: LlmRequest<T>): Promise<T>;
}
export interface Providers {
  places: PlacesProvider;
  routes: RoutesProvider;
  movies: MoviesProvider;
  llm: LlmProvider;
}
export class ProviderError extends Error {}
```

- Produces (`engine/templates.ts`): `templateDay(theme: Theme): Slot[]`.
- Produces (`providers/fake.ts`): `fakeProviders(overrides?: Partial<Providers>): Providers`; `FakePlaces`, `FakeRoutes`, `FakeMovies`, `FakeLlm` classes. `FakePlaces` accepts `emptyKinds?: SlotKind[]` to simulate no results.
- Produces (`providers/cache.ts`): `cachedRoutes(inner: RoutesProvider, ttlMs = 24 * 3600_000): RoutesProvider` (backed by `RouteCache`).
- Produces (`providers/fallback.ts`): `retryOnce<T>(fn: () => Promise<T>): Promise<T>`; `placesWithFallback(primary: PlacesProvider, fallback: PlacesProvider | null): PlacesProvider`; `routesWithFallback(primary: RoutesProvider, fallback: RoutesProvider | null): RoutesProvider`.

- [ ] **Step 1: Write `src/lib/providers/types.ts`** as above.

- [ ] **Step 2: Write `src/lib/engine/templates.ts`**

```ts
import type { Slot, Theme } from "./types";

// Fallback days when the AI sketch fails. Times are city-local.
const TEMPLATES: Record<Theme, Slot[]> = {
  relaxed: [
    { startTime: "10:30", durationMin: 90, kind: "cafe", vibe: "Slow coffee to start" },
    { startTime: "12:30", durationMin: 90, kind: "restaurant", vibe: "Long lunch" },
    { startTime: "14:30", durationMin: 90, kind: "park", vibe: "Walk it off" },
    { startTime: "17:30", durationMin: 150, kind: "cinema", vibe: "Evening movie" },
  ],
  adventurous: [
    { startTime: "09:00", durationMin: 150, kind: "beach", vibe: "Morning by the water" },
    { startTime: "12:00", durationMin: 60, kind: "street_food", vibe: "Quick local bites" },
    { startTime: "13:30", durationMin: 120, kind: "museum", vibe: "Something new" },
    { startTime: "16:00", durationMin: 60, kind: "viewpoint", vibe: "Sunset spot" },
    { startTime: "17:30", durationMin: 90, kind: "restaurant", vibe: "Early dinner" },
  ],
  foodie: [
    { startTime: "11:00", durationMin: 60, kind: "cafe", vibe: "Brunch coffee" },
    { startTime: "12:30", durationMin: 120, kind: "restaurant", vibe: "The big lunch" },
    { startTime: "15:00", durationMin: 120, kind: "mall", vibe: "Browse and snack" },
    { startTime: "17:30", durationMin: 90, kind: "street_food", vibe: "Evening street food" },
  ],
};

export function templateDay(theme: Theme): Slot[] {
  return TEMPLATES[theme].map((s) => ({ ...s }));
}
```

- [ ] **Step 3: Write `src/lib/providers/fake.ts`**

```ts
import type { Film, LatLng, Narrative, RouteResult, SlotKind, Theme, Transport, Venue } from "@/lib/engine/types";
import { THEMES } from "@/lib/engine/types";
import { estimateMinutes, haversineM } from "@/lib/engine/geo";
import { templateDay } from "@/lib/engine/templates";
import type { LlmProvider, LlmRequest, MoviesProvider, PlacesProvider, Providers, RoutesProvider } from "./types";

// Deterministic stand-ins for tests and E2E. No network.

export class FakePlaces implements PlacesProvider {
  readonly name = "fake";
  constructor(private opts: { emptyKinds?: SlotKind[] } = {}) {}
  async search(center: LatLng, _radiusM: number, kind: SlotKind): Promise<Venue[]> {
    if (this.opts.emptyKinds?.includes(kind)) return [];
    return [0, 1, 2, 3].map((i) => ({
      id: `fake-${kind}-${i}`,
      name: `${kind.replace("_", " ")} spot ${i + 1}`,
      lat: center.lat + (i - 1.5) * 0.004,
      lng: center.lng + (i % 2 ? 0.003 : -0.003),
      kind,
      rating: 3.8 + i * 0.3,
      priceLevel: ((i % 3) + 1) as 1 | 2 | 3,
      opening: { open: "08:00", close: "23:30" },
      address: `${i + 1} Fake Street`,
      source: "fake" as const,
    }));
  }
}

export class FakeRoutes implements RoutesProvider {
  readonly name = "fake";
  calls = 0;
  constructor(private opts: { slowFactor?: number; noServiceAfter?: Date } = {}) {}
  async route(from: LatLng, to: LatLng, mode: Transport, departAt: Date): Promise<RouteResult> {
    this.calls++;
    const noService = mode === "public" && !!this.opts.noServiceAfter && departAt >= this.opts.noServiceAfter;
    return {
      distanceM: Math.round(haversineM(from, to) * 1.3),
      durationS: estimateMinutes(from, to, mode) * 60 * (this.opts.slowFactor ?? 1),
      approximate: false,
      noService,
      geometry: [[from.lat, from.lng], [to.lat, to.lng]],
    };
  }
}

export class FakeMovies implements MoviesProvider {
  async nowPlaying(): Promise<Film[]> {
    return [
      { id: 1, title: "Monsoon Heist", genres: ["Action", "Thriller"], rating: 7.4, posterUrl: null },
      { id: 2, title: "Chai & Chaos", genres: ["Comedy"], rating: 6.9, posterUrl: null },
      { id: 3, title: "Deep Field", genres: ["Documentary"], rating: 8.1, posterUrl: null },
    ];
  }
}

export class FakeLlm implements LlmProvider {
  constructor(private opts: { failSketch?: boolean; failNarrate?: boolean } = {}) {}
  async json<T>(req: LlmRequest<T>): Promise<T> {
    if (req.task === "sketch") {
      if (this.opts.failSketch) throw new Error("fake sketch failure");
      const theme = (THEMES.find((t) => req.user.includes(`Theme: ${t}`)) ?? "relaxed") as Theme;
      return req.schema.parse({ slots: templateDay(theme) });
    }
    if (this.opts.failNarrate) throw new Error("fake narrate failure");
    const n: Narrative = {
      summary: "A fair day out with short trips for everyone.",
      swot: {
        strengths: ["Everyone travels under an hour"],
        weaknesses: ["Busy on weekends"],
        opportunities: ["Try the new place nearby"],
        threats: ["Evening traffic"],
      },
    };
    return req.schema.parse(n);
  }
}

export function fakeProviders(overrides: Partial<Providers> = {}): Providers {
  return {
    places: new FakePlaces(),
    routes: new FakeRoutes(),
    movies: new FakeMovies(),
    llm: new FakeLlm(),
    ...overrides,
  };
}
```

- [ ] **Step 4: Write `src/lib/providers/fallback.ts` and `src/lib/providers/cache.ts`**

```ts
// src/lib/providers/fallback.ts
import type { PlacesProvider, RoutesProvider } from "./types";

export async function retryOnce<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch {
    return fn();
  }
}

export function placesWithFallback(primary: PlacesProvider, fallback: PlacesProvider | null): PlacesProvider {
  return {
    name: fallback ? `${primary.name}+${fallback.name}` : primary.name,
    async search(center, radiusM, kind) {
      try {
        return await retryOnce(() => primary.search(center, radiusM, kind));
      } catch (err) {
        if (!fallback) throw err;
        console.warn(`[places] ${primary.name} failed, falling back`, err);
        return retryOnce(() => fallback.search(center, radiusM, kind));
      }
    },
  };
}

export function routesWithFallback(primary: RoutesProvider, fallback: RoutesProvider | null): RoutesProvider {
  return {
    name: fallback ? `${primary.name}+${fallback.name}` : primary.name,
    async route(from, to, mode, departAt) {
      try {
        return await retryOnce(() => primary.route(from, to, mode, departAt));
      } catch (err) {
        if (!fallback) throw err;
        console.warn(`[routes] ${primary.name} failed, falling back`, err);
        return retryOnce(() => fallback.route(from, to, mode, departAt));
      }
    },
  };
}
```

```ts
// src/lib/providers/cache.ts
import { prisma } from "@/lib/db";
import type { RouteResult } from "@/lib/engine/types";
import { localDate, localHHMM } from "@/lib/time";
import type { RoutesProvider } from "./types";

const k = (n: number) => n.toFixed(4);

export function cachedRoutes(inner: RoutesProvider, ttlMs = 24 * 3600_000): RoutesProvider {
  return {
    name: inner.name,
    async route(from, to, mode, departAt) {
      const hour = localHHMM(departAt).slice(0, 2);
      const key = [inner.name, mode, k(from.lat), k(from.lng), k(to.lat), k(to.lng), localDate(departAt), hour].join(":");
      const hit = await prisma.routeCache.findUnique({ where: { key } });
      if (hit && hit.expiresAt > new Date()) return hit.result as unknown as RouteResult;
      const result = await inner.route(from, to, mode, departAt);
      await prisma.routeCache.upsert({
        where: { key },
        create: { key, result: result as object, expiresAt: new Date(Date.now() + ttlMs) },
        update: { result: result as object, expiresAt: new Date(Date.now() + ttlMs) },
      });
      return result;
    },
  };
}
```

- [ ] **Step 5: Failing test**

`tests/unit/providers-core.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import { resetDb } from "../helpers/db";
import { cachedRoutes } from "@/lib/providers/cache";
import { placesWithFallback, routesWithFallback } from "@/lib/providers/fallback";
import { FakePlaces, FakeRoutes } from "@/lib/providers/fake";
import { templateDay } from "@/lib/engine/templates";
import type { PlacesProvider, RoutesProvider } from "@/lib/providers/types";

const a = { lat: 12.97, lng: 77.64 };
const b = { lat: 12.93, lng: 77.62 };
const when = new Date("2026-10-18T05:00:00Z");

describe("provider plumbing", () => {
  beforeEach(resetDb);

  it("caches routes for 24h", async () => {
    const inner = new FakeRoutes();
    const cached = cachedRoutes(inner);
    await cached.route(a, b, "own", when);
    await cached.route(a, b, "own", when);
    expect(inner.calls).toBe(1);
  });

  it("retries once, then falls back", async () => {
    const broken: PlacesProvider = { name: "broken", search: vi.fn(async () => { throw new Error("down"); }) };
    const p = placesWithFallback(broken, new FakePlaces());
    const res = await p.search(a, 5000, "cafe");
    expect(res.length).toBeGreaterThan(0);
    expect(broken.search).toHaveBeenCalledTimes(2);
  });

  it("throws when there is no fallback", async () => {
    const broken: RoutesProvider = { name: "broken", route: async () => { throw new Error("down"); } };
    await expect(routesWithFallback(broken, null).route(a, b, "own", when)).rejects.toThrow("down");
  });

  it("templates exist for every theme and are copies", () => {
    const t = templateDay("relaxed");
    t[0].kind = "beach";
    expect(templateDay("relaxed")[0].kind).toBe("cafe");
    expect(templateDay("adventurous").length).toBeGreaterThanOrEqual(3);
  });
});
```

- [ ] **Step 6: Run** — `npx vitest run tests/unit/providers-core.test.ts` → PASS.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: provider interfaces, fakes, route cache, fallback"
```

---

### Task 10: Free providers — Overpass, OSRM, TMDB (with contract tests)

**Files:**
- Create: `src/lib/providers/osm.ts`, `src/lib/providers/osrm.ts`, `src/lib/providers/tmdb.ts`
- Create fixtures: `tests/providers/fixtures/overpass-cafe.json`, `osrm-route.json`, `tmdb-now-playing.json`
- Create: `tests/providers/contract.ts`, `tests/providers/free.test.ts`

**Interfaces:**
- Produces: `class OverpassPlaces implements PlacesProvider` (`constructor(fetchFn = fetch, url = process.env.OVERPASS_URL ?? "https://overpass-api.de/api/interpreter")`), `parseOpeningHours(raw: string | undefined): OpeningWindow | null`, `class OsrmRoutes implements RoutesProvider` (`constructor(fetchFn = fetch, base = process.env.OSRM_URL ?? "https://router.project-osrm.org")`), `TRANSIT_FACTOR = 1.6`, `TRANSIT_EXTRA_S = 900`, `class TmdbMovies implements MoviesProvider` (`constructor(apiKey: string, fetchFn = fetch)`).
- Produces (`tests/providers/contract.ts`): `placesContract(make: () => PlacesProvider)`, `routesContract(make: () => RoutesProvider)` — shared assertions reused for Google in Task 11.

- [ ] **Step 1: Fixtures**

`tests/providers/fixtures/overpass-cafe.json`:

```json
{
  "elements": [
    { "type": "node", "id": 101, "lat": 12.9721, "lon": 77.6405,
      "tags": { "amenity": "cafe", "name": "Third Wave Coffee", "opening_hours": "Mo-Su 08:00-23:00", "addr:street": "100 Feet Road" } },
    { "type": "way", "id": 202, "center": { "lat": 12.9701, "lon": 77.6399 },
      "tags": { "amenity": "cafe", "name": "Dyu Art Cafe", "opening_hours": "Tu-Su 10:00-22:30; Mo off" } },
    { "type": "node", "id": 303, "lat": 12.9711, "lon": 77.6411, "tags": { "amenity": "cafe" } }
  ]
}
```

`tests/providers/fixtures/osrm-route.json`:

```json
{ "code": "Ok", "routes": [ { "distance": 5230.4, "duration": 812.7,
  "geometry": { "type": "LineString", "coordinates": [[77.6412, 12.9719], [77.6330, 12.9530], [77.6245, 12.9352]] } } ] }
```

`tests/providers/fixtures/tmdb-now-playing.json`:

```json
{ "results": [
  { "id": 9001, "title": "Monsoon Heist", "genre_ids": [28, 53], "vote_average": 7.4, "poster_path": "/abc.jpg" },
  { "id": 9002, "title": "Chai & Chaos", "genre_ids": [35], "vote_average": 6.9, "poster_path": null }
] }
```

- [ ] **Step 2: Shared contract (`tests/providers/contract.ts`)**

```ts
import { it, expect } from "vitest";
import type { PlacesProvider, RoutesProvider } from "@/lib/providers/types";

export function placesContract(make: () => PlacesProvider) {
  it("returns named venues of the requested kind with coordinates", async () => {
    const venues = await make().search({ lat: 12.97, lng: 77.64 }, 3000, "cafe");
    expect(venues.length).toBeGreaterThan(0);
    for (const v of venues) {
      expect(v.name.length).toBeGreaterThan(0);
      expect(v.kind).toBe("cafe");
      expect(Number.isFinite(v.lat) && Number.isFinite(v.lng)).toBe(true);
      expect(v.rating === null || (v.rating >= 0 && v.rating <= 5)).toBe(true);
      expect([null, 1, 2, 3, 4]).toContain(v.priceLevel);
    }
  });
}

export function routesContract(make: () => RoutesProvider, opts: { transitApproximate: boolean }) {
  const from = { lat: 12.9719, lng: 77.6412 };
  const to = { lat: 12.9352, lng: 77.6245 };
  const at = new Date("2026-10-18T05:00:00Z");

  it("returns positive distance and duration for own vehicle", async () => {
    const r = await make().route(from, to, "own", at);
    expect(r.distanceM).toBeGreaterThan(0);
    expect(r.durationS).toBeGreaterThan(0);
    expect(r.noService).toBe(false);
  });

  it(`marks public transport approximate=${opts.transitApproximate}`, async () => {
    const r = await make().route(from, to, "public", at);
    expect(r.approximate).toBe(opts.transitApproximate);
    expect(r.durationS).toBeGreaterThan(0);
  });
}
```

- [ ] **Step 3: Failing test (`tests/providers/free.test.ts`)**

```ts
import { describe, it, expect } from "vitest";
import overpass from "./fixtures/overpass-cafe.json";
import osrm from "./fixtures/osrm-route.json";
import tmdb from "./fixtures/tmdb-now-playing.json";
import { placesContract, routesContract } from "./contract";
import { OverpassPlaces, parseOpeningHours } from "@/lib/providers/osm";
import { OsrmRoutes } from "@/lib/providers/osrm";
import { TmdbMovies } from "@/lib/providers/tmdb";

const jsonFetch = (body: unknown, status = 200) =>
  (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;

describe("OverpassPlaces", () => {
  placesContract(() => new OverpassPlaces(jsonFetch(overpass)));

  it("skips unnamed elements and reads way centres", async () => {
    const v = await new OverpassPlaces(jsonFetch(overpass)).search({ lat: 12.97, lng: 77.64 }, 3000, "cafe");
    expect(v.map((x) => x.name)).toEqual(["Third Wave Coffee", "Dyu Art Cafe"]);
    expect(v[1].lat).toBe(12.9701);
    expect(v[0].id).toBe("osm-node-101");
  });

  it("throws ProviderError on HTTP errors", async () => {
    await expect(new OverpassPlaces(jsonFetch({}, 504)).search({ lat: 1, lng: 1 }, 1000, "cafe")).rejects.toThrow(/overpass/i);
  });

  it("parses simple opening hours only", () => {
    expect(parseOpeningHours("Mo-Su 08:00-23:00")).toEqual({ open: "08:00", close: "23:00" });
    expect(parseOpeningHours("10:00-22:30")).toEqual({ open: "10:00", close: "22:30" });
    expect(parseOpeningHours("Tu-Su 10:00-22:30; Mo off")).toBeNull();
    expect(parseOpeningHours(undefined)).toBeNull();
  });
});

describe("OsrmRoutes", () => {
  routesContract(() => new OsrmRoutes(jsonFetch(osrm)), { transitApproximate: true });

  it("estimates transit as driving x1.6 + 15 min", async () => {
    const r = await new OsrmRoutes(jsonFetch(osrm)).route({ lat: 1, lng: 1 }, { lat: 2, lng: 2 }, "public", new Date());
    expect(r.durationS).toBe(Math.round(812.7 * 1.6 + 900));
    expect(r.geometry?.[0]).toEqual([12.9719, 77.6412]);
  });

  it("throws on code != Ok", async () => {
    await expect(new OsrmRoutes(jsonFetch({ code: "NoRoute" })).route({ lat: 1, lng: 1 }, { lat: 2, lng: 2 }, "own", new Date())).rejects.toThrow(/osrm/i);
  });
});

describe("TmdbMovies", () => {
  it("maps genres and posters", async () => {
    const films = await new TmdbMovies("k", jsonFetch(tmdb)).nowPlaying("IN");
    expect(films[0]).toEqual({
      id: 9001, title: "Monsoon Heist", genres: ["Action", "Thriller"], rating: 7.4,
      posterUrl: "https://image.tmdb.org/t/p/w342/abc.jpg",
    });
    expect(films[1].posterUrl).toBeNull();
  });
});
```

Add `"resolveJsonModule": true` is already in tsconfig — fixture imports work.

- [ ] **Step 4: Run** — FAIL (modules missing).

- [ ] **Step 5: Implement `src/lib/providers/osm.ts`**

```ts
import type { LatLng, OpeningWindow, SlotKind, Venue } from "@/lib/engine/types";
import { HHMM_RE } from "@/lib/time";
import { ProviderError, type PlacesProvider } from "./types";

const OSM_TAGS: Record<SlotKind, string[]> = {
  cafe: ["amenity=cafe"],
  restaurant: ["amenity=restaurant"],
  gaming: ["leisure=amusement_arcade", "leisure=bowling_alley", "amenity=internet_cafe"],
  cinema: ["amenity=cinema"],
  beach: ["natural=beach"],
  park: ["leisure=park"],
  museum: ["tourism=museum"],
  mall: ["shop=mall"],
  viewpoint: ["tourism=viewpoint"],
  street_food: ["amenity=fast_food", "amenity=food_court"],
};

/** Only "HH:MM-HH:MM" or "Mo-Su HH:MM-HH:MM"; anything richer is "unknown". */
export function parseOpeningHours(raw: string | undefined): OpeningWindow | null {
  if (!raw) return null;
  const m = raw.trim().match(/^(?:Mo-Su\s+)?(\d{2}:\d{2})-(\d{2}:\d{2})$/);
  if (!m || !HHMM_RE.test(m[1]) || !HHMM_RE.test(m[2])) return null;
  return { open: m[1], close: m[2] };
}

interface OverpassElement {
  type: string;
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

export class OverpassPlaces implements PlacesProvider {
  readonly name = "osm";
  constructor(
    private fetchFn: typeof fetch = fetch,
    private url = process.env.OVERPASS_URL ?? "https://overpass-api.de/api/interpreter"
  ) {}

  async search(center: LatLng, radiusM: number, kind: SlotKind): Promise<Venue[]> {
    const around = `(around:${Math.round(radiusM)},${center.lat},${center.lng})`;
    const parts = OSM_TAGS[kind].map((t) => {
      const [k, v] = t.split("=");
      return `nwr["${k}"="${v}"]${around};`;
    });
    const query = `[out:json][timeout:20];(${parts.join("")});out center tags 40;`;
    const res = await this.fetchFn(this.url, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: `data=${encodeURIComponent(query)}`,
    });
    if (!res.ok) throw new ProviderError(`overpass HTTP ${res.status}`);
    const body = (await res.json()) as { elements?: OverpassElement[] };

    return (body.elements ?? []).flatMap((el): Venue[] => {
      const name = el.tags?.name;
      const lat = el.lat ?? el.center?.lat;
      const lng = el.lon ?? el.center?.lon;
      if (!name || lat == null || lng == null) return [];
      return [{
        id: `osm-${el.type}-${el.id}`,
        name,
        lat,
        lng,
        kind,
        rating: null,
        priceLevel: null,
        opening: parseOpeningHours(el.tags?.opening_hours),
        address: el.tags?.["addr:street"] ?? null,
        source: "osm",
      }];
    });
  }
}
```

- [ ] **Step 6: Implement `src/lib/providers/osrm.ts`**

```ts
import type { LatLng, RouteResult, Transport } from "@/lib/engine/types";
import { ProviderError, type RoutesProvider } from "./types";

export const TRANSIT_FACTOR = 1.6;
export const TRANSIT_EXTRA_S = 900;

export class OsrmRoutes implements RoutesProvider {
  readonly name = "osrm";
  constructor(
    private fetchFn: typeof fetch = fetch,
    private base = process.env.OSRM_URL ?? "https://router.project-osrm.org"
  ) {}

  async route(from: LatLng, to: LatLng, mode: Transport, _departAt: Date): Promise<RouteResult> {
    const coords = `${from.lng},${from.lat};${to.lng},${to.lat}`;
    const res = await this.fetchFn(`${this.base}/route/v1/driving/${coords}?overview=simplified&geometries=geojson`);
    if (!res.ok) throw new ProviderError(`osrm HTTP ${res.status}`);
    const body = (await res.json()) as {
      code: string;
      routes?: { distance: number; duration: number; geometry: { coordinates: [number, number][] } }[];
    };
    const r = body.routes?.[0];
    if (body.code !== "Ok" || !r) throw new ProviderError(`osrm ${body.code}`);

    const transit = mode === "public";
    return {
      distanceM: Math.round(r.distance),
      durationS: transit ? Math.round(r.duration * TRANSIT_FACTOR + TRANSIT_EXTRA_S) : Math.round(r.duration),
      approximate: transit,
      noService: false,
      geometry: r.geometry.coordinates.map(([lng, lat]) => [lat, lng]),
    };
  }
}
```

- [ ] **Step 7: Implement `src/lib/providers/tmdb.ts`**

```ts
import type { Film } from "@/lib/engine/types";
import { ProviderError, type MoviesProvider } from "./types";

// TMDB movie genre ids are stable; avoids an extra request.
const GENRES: Record<number, string> = {
  28: "Action", 12: "Adventure", 16: "Animation", 35: "Comedy", 80: "Crime",
  99: "Documentary", 18: "Drama", 10751: "Family", 14: "Fantasy", 36: "History",
  27: "Horror", 10402: "Music", 9648: "Mystery", 10749: "Romance",
  878: "Science Fiction", 53: "Thriller", 10752: "War", 37: "Western",
};

export class TmdbMovies implements MoviesProvider {
  constructor(private apiKey: string, private fetchFn: typeof fetch = fetch) {}

  async nowPlaying(region: string): Promise<Film[]> {
    const url = new URL("https://api.themoviedb.org/3/movie/now_playing");
    url.searchParams.set("region", region);
    url.searchParams.set("language", "en-IN");
    url.searchParams.set("page", "1");
    url.searchParams.set("api_key", this.apiKey);
    const res = await this.fetchFn(url);
    if (!res.ok) throw new ProviderError(`tmdb HTTP ${res.status}`);
    const body = (await res.json()) as {
      results?: { id: number; title: string; genre_ids: number[]; vote_average: number; poster_path: string | null }[];
    };
    return (body.results ?? []).map((m) => ({
      id: m.id,
      title: m.title,
      genres: m.genre_ids.map((g) => GENRES[g]).filter(Boolean),
      rating: m.vote_average,
      posterUrl: m.poster_path ? `https://image.tmdb.org/t/p/w342${m.poster_path}` : null,
    }));
  }
}
```

- [ ] **Step 8: Run** — `npx vitest run tests/providers/free.test.ts` → PASS.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: OSM places, OSRM routes, TMDB movies providers"
```

---

### Task 11: Google providers, Groq LLM provider, provider selection

**Files:**
- Create: `src/lib/providers/google.ts`, `src/lib/providers/groq.ts`, `src/lib/providers/index.ts`
- Create fixtures: `tests/providers/fixtures/google-places-cafe.json`, `google-routes-drive.json`, `google-routes-transit-empty.json`
- Create: `tests/providers/google.test.ts`, `tests/providers/groq.test.ts`, `tests/providers/select.test.ts`
- Create: `vitest.live.config.mts`, `tests/live/providers.live.test.ts`

**Interfaces:**
- Produces: `class GooglePlaces implements PlacesProvider` (`constructor(apiKey: string, fetchFn = fetch)`), `class GoogleRoutes implements RoutesProvider` (`constructor(apiKey: string, fetchFn = fetch)`), `class GroqLlm implements LlmProvider` (`constructor(client: GroqLike = new Groq(...), model = "llama-3.3-70b-versatile")`, where `GroqLike = { chat: { completions: { create(args: object): Promise<{ choices: { message: { content: string | null } }[] }> } } }`), `getProviders(): Providers`.

- [ ] **Step 1: Fixtures**

`google-places-cafe.json`:

```json
{ "places": [
  { "id": "ChIJ1", "displayName": { "text": "Third Wave Coffee" }, "location": { "latitude": 12.9721, "longitude": 77.6405 },
    "rating": 4.3, "priceLevel": "PRICE_LEVEL_MODERATE", "formattedAddress": "100 Feet Rd, Indiranagar",
    "regularOpeningHours": { "periods": [ { "open": { "day": 0, "hour": 8, "minute": 0 }, "close": { "day": 0, "hour": 23, "minute": 0 } } ] } },
  { "id": "ChIJ2", "displayName": { "text": "Dyu Art Cafe" }, "location": { "latitude": 12.9701, "longitude": 77.6399 }, "rating": 4.6 }
] }
```

`google-routes-drive.json`:

```json
{ "routes": [ { "distanceMeters": 5480, "duration": "1260s", "polyline": { "encodedPolyline": "_p~iF~ps|U_ulLnnqC_mqNvxq`@" } } ] }
```

`google-routes-transit-empty.json`:

```json
{}
```

- [ ] **Step 2: Failing tests**

`tests/providers/google.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import places from "./fixtures/google-places-cafe.json";
import drive from "./fixtures/google-routes-drive.json";
import empty from "./fixtures/google-routes-transit-empty.json";
import { placesContract, routesContract } from "./contract";
import { GooglePlaces, GoogleRoutes } from "@/lib/providers/google";

const jsonFetch = (body: unknown, status = 200) =>
  vi.fn(async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;

describe("GooglePlaces", () => {
  placesContract(() => new GooglePlaces("k", jsonFetch(places)));

  it("maps price level, rating, opening", async () => {
    const v = await new GooglePlaces("k", jsonFetch(places)).search({ lat: 12.97, lng: 77.64 }, 3000, "cafe");
    expect(v[0]).toMatchObject({ id: "google-ChIJ1", priceLevel: 2, rating: 4.3, opening: { open: "08:00", close: "23:00" }, source: "google" });
    expect(v[1].priceLevel).toBeNull();
  });

  it("sends the key and field mask", async () => {
    const f = jsonFetch(places);
    await new GooglePlaces("secret", f).search({ lat: 1, lng: 1 }, 1000, "cinema");
    const [, init] = (f as any).mock.calls[0];
    expect(init.headers["X-Goog-Api-Key"]).toBe("secret");
    expect(JSON.parse(init.body).includedTypes).toEqual(["movie_theater"]);
  });
});

describe("GoogleRoutes", () => {
  routesContract(() => new GoogleRoutes("k", jsonFetch(drive)), { transitApproximate: false });

  it("parses duration and polyline", async () => {
    const r = await new GoogleRoutes("k", jsonFetch(drive)).route({ lat: 1, lng: 1 }, { lat: 2, lng: 2 }, "own", new Date());
    expect(r).toMatchObject({ distanceM: 5480, durationS: 1260, approximate: false, noService: false });
    expect(r.geometry?.[0]).toEqual([38.5, -120.2]);
  });

  it("reports noService when transit has no route", async () => {
    const r = await new GoogleRoutes("k", jsonFetch(empty)).route({ lat: 1, lng: 1 }, { lat: 2, lng: 2 }, "public", new Date());
    expect(r.noService).toBe(true);
  });

  it("throws when driving has no route", async () => {
    await expect(new GoogleRoutes("k", jsonFetch(empty)).route({ lat: 1, lng: 1 }, { lat: 2, lng: 2 }, "own", new Date())).rejects.toThrow(/google/i);
  });
});
```

`tests/providers/groq.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { z } from "zod";
import { GroqLlm } from "@/lib/providers/groq";

const client = (...contents: string[]) => {
  const create = vi.fn();
  contents.forEach((c) => create.mockResolvedValueOnce({ choices: [{ message: { content: c } }] }));
  return { chat: { completions: { create } } };
};
const schema = z.object({ summary: z.string() });

describe("GroqLlm", () => {
  it("returns validated JSON", async () => {
    const llm = new GroqLlm(client('{"summary":"hi"}'));
    expect(await llm.json({ task: "narrate", system: "s", user: "u", schema })).toEqual({ summary: "hi" });
  });
  it("retries once on invalid output", async () => {
    const c = client("not json", '{"summary":"ok"}');
    expect(await new GroqLlm(c).json({ task: "narrate", system: "s", user: "u", schema })).toEqual({ summary: "ok" });
    expect(c.chat.completions.create).toHaveBeenCalledTimes(2);
  });
  it("throws after two invalid outputs", async () => {
    await expect(new GroqLlm(client("{}", "{}")).json({ task: "narrate", system: "s", user: "u", schema })).rejects.toThrow(/invalid/i);
  });
});
```

`tests/providers/select.test.ts`:

```ts
import { describe, it, expect, afterEach, vi } from "vitest";
import { getProviders } from "@/lib/providers";

describe("getProviders", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("uses fakes under WAYPOINT_FAKES", () => {
    expect(getProviders().places.name).toBe("fake");
  });
  it("uses OSM/OSRM without a Google key", () => {
    vi.stubEnv("WAYPOINT_FAKES", "");
    vi.stubEnv("GOOGLE_MAPS_API_KEY", "");
    const p = getProviders();
    expect(p.places.name).toBe("osm");
    expect(p.routes.name).toBe("osrm");
  });
  it("prefers Google with free fallback when keyed", () => {
    vi.stubEnv("WAYPOINT_FAKES", "");
    vi.stubEnv("GOOGLE_MAPS_API_KEY", "abc");
    const p = getProviders();
    expect(p.places.name).toBe("google+osm");
    expect(p.routes.name).toBe("google+osrm");
  });
});
```

- [ ] **Step 3: Run** — FAIL.

- [ ] **Step 4: Implement `src/lib/providers/google.ts`**

```ts
import type { LatLng, RouteResult, SlotKind, Transport, Venue } from "@/lib/engine/types";
import { decodePolyline } from "@/lib/engine/geo";
import { ProviderError, type PlacesProvider, type RoutesProvider } from "./types";

const PLACE_TYPES: Record<SlotKind, string[]> = {
  cafe: ["cafe"],
  restaurant: ["restaurant"],
  gaming: ["amusement_center", "bowling_alley"],
  cinema: ["movie_theater"],
  beach: ["beach"],
  park: ["park"],
  museum: ["museum"],
  mall: ["shopping_mall"],
  viewpoint: ["tourist_attraction"],
  street_food: ["fast_food_restaurant", "food_court"],
};

const PRICE: Record<string, 1 | 2 | 3 | 4> = {
  PRICE_LEVEL_FREE: 1,
  PRICE_LEVEL_INEXPENSIVE: 1,
  PRICE_LEVEL_MODERATE: 2,
  PRICE_LEVEL_EXPENSIVE: 3,
  PRICE_LEVEL_VERY_EXPENSIVE: 4,
};

const hhmm = (h: number, m: number) => `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;

interface GPlace {
  id: string;
  displayName?: { text: string };
  location?: { latitude: number; longitude: number };
  rating?: number;
  priceLevel?: string;
  formattedAddress?: string;
  regularOpeningHours?: { periods?: { open: { hour: number; minute: number }; close?: { hour: number; minute: number } }[] };
}

export class GooglePlaces implements PlacesProvider {
  readonly name = "google";
  constructor(private apiKey: string, private fetchFn: typeof fetch = fetch) {}

  async search(center: LatLng, radiusM: number, kind: SlotKind): Promise<Venue[]> {
    const res = await this.fetchFn("https://places.googleapis.com/v1/places:searchNearby", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "X-Goog-Api-Key": this.apiKey,
        "X-Goog-FieldMask":
          "places.id,places.displayName,places.location,places.rating,places.priceLevel,places.formattedAddress,places.regularOpeningHours",
      },
      body: JSON.stringify({
        includedTypes: PLACE_TYPES[kind],
        maxResultCount: 20,
        locationRestriction: {
          circle: { center: { latitude: center.lat, longitude: center.lng }, radius: Math.min(radiusM, 50_000) },
        },
      }),
    });
    if (!res.ok) throw new ProviderError(`google places HTTP ${res.status}`);
    const body = (await res.json()) as { places?: GPlace[] };

    return (body.places ?? []).flatMap((p): Venue[] => {
      if (!p.displayName?.text || !p.location) return [];
      const period = p.regularOpeningHours?.periods?.[0];
      return [{
        id: `google-${p.id}`,
        name: p.displayName.text,
        lat: p.location.latitude,
        lng: p.location.longitude,
        kind,
        rating: p.rating ?? null,
        priceLevel: p.priceLevel ? PRICE[p.priceLevel] ?? null : null,
        opening: period?.close
          ? { open: hhmm(period.open.hour, period.open.minute), close: hhmm(period.close.hour, period.close.minute) }
          : null,
        address: p.formattedAddress ?? null,
        source: "google",
      }];
    });
  }
}

export class GoogleRoutes implements RoutesProvider {
  readonly name = "google";
  constructor(private apiKey: string, private fetchFn: typeof fetch = fetch) {}

  async route(from: LatLng, to: LatLng, mode: Transport, departAt: Date): Promise<RouteResult> {
    const transit = mode === "public";
    const res = await this.fetchFn("https://routes.googleapis.com/directions/v2:computeRoutes", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "X-Goog-Api-Key": this.apiKey,
        "X-Goog-FieldMask": "routes.distanceMeters,routes.duration,routes.polyline.encodedPolyline",
      },
      body: JSON.stringify({
        origin: { location: { latLng: { latitude: from.lat, longitude: from.lng } } },
        destination: { location: { latLng: { latitude: to.lat, longitude: to.lng } } },
        travelMode: transit ? "TRANSIT" : "DRIVE",
        ...(transit ? {} : { routingPreference: "TRAFFIC_AWARE" }),
        departureTime: departAt.toISOString(),
      }),
    });
    if (!res.ok) throw new ProviderError(`google routes HTTP ${res.status}`);
    const body = (await res.json()) as {
      routes?: { distanceMeters?: number; duration?: string; polyline?: { encodedPolyline?: string } }[];
    };
    const r = body.routes?.[0];
    if (!r) {
      if (transit) return { distanceM: 0, durationS: 0, approximate: false, noService: true, geometry: null };
      throw new ProviderError("google routes: no route");
    }
    return {
      distanceM: r.distanceMeters ?? 0,
      durationS: Number.parseInt(r.duration ?? "0", 10),
      approximate: false,
      noService: false,
      geometry: r.polyline?.encodedPolyline ? decodePolyline(r.polyline.encodedPolyline) : null,
    };
  }
}
```

- [ ] **Step 5: Implement `src/lib/providers/groq.ts`**

```ts
import Groq from "groq-sdk";
import { ProviderError, type LlmProvider, type LlmRequest } from "./types";

export interface GroqLike {
  chat: { completions: { create(args: object): Promise<{ choices: { message: { content: string | null } }[] }> } };
}

export class GroqLlm implements LlmProvider {
  constructor(
    private client: GroqLike = new Groq({ apiKey: process.env.GROQ_API_KEY }) as unknown as GroqLike,
    private model = "llama-3.3-70b-versatile"
  ) {}

  async json<T>(req: LlmRequest<T>): Promise<T> {
    let lastErr: unknown;
    for (let attempt = 0; attempt < 2; attempt++) {
      const completion = await this.client.chat.completions.create({
        model: this.model,
        temperature: req.task === "sketch" ? 0.8 : 0.4,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: req.system },
          { role: "user", content: req.user },
        ],
      });
      try {
        return req.schema.parse(JSON.parse(completion.choices[0]?.message.content ?? ""));
      } catch (err) {
        lastErr = err;
      }
    }
    throw new ProviderError(`LLM returned invalid output: ${String(lastErr)}`);
  }
}
```

- [ ] **Step 6: Implement `src/lib/providers/index.ts`**

```ts
import { fakesEnabled } from "@/lib/fakes";
import { fakeProviders } from "./fake";
import { OverpassPlaces } from "./osm";
import { OsrmRoutes } from "./osrm";
import { TmdbMovies } from "./tmdb";
import { GooglePlaces, GoogleRoutes } from "./google";
import { GroqLlm } from "./groq";
import { cachedRoutes } from "./cache";
import { placesWithFallback, routesWithFallback } from "./fallback";
import type { Providers } from "./types";

export type { Providers } from "./types";

export function getProviders(): Providers {
  if (fakesEnabled()) return fakeProviders();

  const osm = new OverpassPlaces();
  const osrm = new OsrmRoutes();
  const key = process.env.GOOGLE_MAPS_API_KEY;

  const places = key ? placesWithFallback(new GooglePlaces(key), osm) : placesWithFallback(osm, null);
  const routes = key ? routesWithFallback(new GoogleRoutes(key), osrm) : routesWithFallback(osrm, null);

  return {
    places,
    routes: cachedRoutes(routes),
    movies: new TmdbMovies(process.env.TMDB_API_KEY ?? ""),
    llm: new GroqLlm(),
  };
}
```

- [ ] **Step 7: Live suite (optional, keyed)**

`vitest.live.config.mts`:

```ts
import { defineConfig, loadEnv } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

const env = loadEnv("development", process.cwd(), "");

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
    include: ["tests/live/**/*.test.ts"],
    testTimeout: 30_000,
    env: {
      GOOGLE_MAPS_API_KEY: env.GOOGLE_MAPS_API_KEY ?? "",
      TMDB_API_KEY: env.TMDB_API_KEY ?? "",
      GROQ_API_KEY: env.GROQ_API_KEY ?? "",
    },
  },
});
```

`tests/live/providers.live.test.ts`:

```ts
import { describe } from "vitest";
import { placesContract, routesContract } from "../providers/contract";
import { OverpassPlaces } from "@/lib/providers/osm";
import { OsrmRoutes } from "@/lib/providers/osrm";
import { GooglePlaces, GoogleRoutes } from "@/lib/providers/google";

describe("live OSM", () => placesContract(() => new OverpassPlaces()));
describe("live OSRM", () => routesContract(() => new OsrmRoutes(), { transitApproximate: true }));

const key = process.env.GOOGLE_MAPS_API_KEY;
describe.skipIf(!key)("live Google Places", () => placesContract(() => new GooglePlaces(key!)));
describe.skipIf(!key)("live Google Routes", () => routesContract(() => new GoogleRoutes(key!), { transitApproximate: false }));
```

Note: the live Google Routes test uses a fixed 2026-10-18 departure; if that date is in the past when run, update `at` in `tests/providers/contract.ts` to a future date.

- [ ] **Step 8: Run** — `npx vitest run tests/providers` → PASS. (`npm run test:live` is manual, needs network.)

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: Google places/routes, Groq LLM provider, provider selection"
```

---

### Task 12: `pickDate` and `meetingArea`

**Files:**
- Create: `src/lib/engine/pickDate.ts`, `src/lib/engine/meetingArea.ts`
- Test: `tests/unit/pickDate.test.ts`, `tests/unit/meetingArea.test.ts`

**Interfaces:**
- Produces:
  - `interface RankedDate { date: string; freeUserIds: string[]; freeCount: number; incompleteFreeCount: number }`
  - `pickDate(input: { dates: string[]; availability: { userId: string; date: string; free: boolean }[]; memberIds: string[]; incompleteIds: string[] }): RankedDate[]` — sorted by `freeCount` desc, then `incompleteFreeCount` asc, then date asc. Ignores non-members and dates outside `dates`.
  - `meetingArea(attendees: Pick<Attendee, "home" | "transport">[]): LatLng` — minimises the maximum estimated travel time over a 9×9 grid spanning the attendees' homes; ties broken by lower total time.

- [ ] **Step 1: Failing tests**

`tests/unit/pickDate.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { pickDate } from "@/lib/engine/pickDate";

const dates = ["2026-10-17", "2026-10-18", "2026-10-19"];

describe("pickDate", () => {
  it("ranks by number of free members", () => {
    const r = pickDate({
      dates, memberIds: ["a", "b", "c"], incompleteIds: [],
      availability: [
        { userId: "a", date: "2026-10-18", free: true },
        { userId: "b", date: "2026-10-18", free: true },
        { userId: "a", date: "2026-10-17", free: true },
        { userId: "c", date: "2026-10-19", free: false },
      ],
    });
    expect(r.map((d) => d.date)).toEqual(["2026-10-18", "2026-10-17", "2026-10-19"]);
    expect(r[0].freeUserIds.sort()).toEqual(["a", "b"]);
  });

  it("breaks ties by fewer incomplete profiles, then earlier date", () => {
    const r = pickDate({
      dates, memberIds: ["a", "b"], incompleteIds: ["b"],
      availability: [
        { userId: "b", date: "2026-10-17", free: true },
        { userId: "a", date: "2026-10-18", free: true },
        { userId: "a", date: "2026-10-19", free: true },
      ],
    });
    expect(r.map((d) => d.date)).toEqual(["2026-10-18", "2026-10-19", "2026-10-17"]);
  });

  it("ignores non-members and out-of-range dates", () => {
    const r = pickDate({
      dates: ["2026-10-17"], memberIds: ["a"], incompleteIds: [],
      availability: [
        { userId: "zz", date: "2026-10-17", free: true },
        { userId: "a", date: "2026-11-01", free: true },
      ],
    });
    expect(r).toEqual([{ date: "2026-10-17", freeUserIds: [], freeCount: 0, incompleteFreeCount: 0 }]);
  });
});
```

`tests/unit/meetingArea.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { meetingArea } from "@/lib/engine/meetingArea";
import { estimateMinutes } from "@/lib/engine/geo";

describe("meetingArea", () => {
  it("returns the home for a single attendee", () => {
    expect(meetingArea([{ home: { lat: 12.9, lng: 77.6 }, transport: "own" }])).toEqual({ lat: 12.9, lng: 77.6 });
  });

  it("pulls toward the slower traveller instead of the plain midpoint", () => {
    const pub = { home: { lat: 12.90, lng: 77.60 }, transport: "public" as const };
    const own = { home: { lat: 13.00, lng: 77.70 }, transport: "own" as const };
    const c = meetingArea([pub, own]);
    const tPub = estimateMinutes(pub.home, c, "public");
    const tOwn = estimateMinutes(own.home, c, "own");
    expect(Math.abs(tPub - tOwn)).toBeLessThanOrEqual(6);
    expect(c.lat).toBeLessThan(12.95); // closer to the public-transport user
  });
});
```

- [ ] **Step 2: Run** — FAIL.

- [ ] **Step 3: Implement**

```ts
// src/lib/engine/pickDate.ts
export interface RankedDate {
  date: string;
  freeUserIds: string[];
  freeCount: number;
  incompleteFreeCount: number;
}

export function pickDate(input: {
  dates: string[];
  availability: { userId: string; date: string; free: boolean }[];
  memberIds: string[];
  incompleteIds: string[];
}): RankedDate[] {
  const members = new Set(input.memberIds);
  const incomplete = new Set(input.incompleteIds);
  return input.dates
    .map((date) => {
      const freeUserIds = input.availability
        .filter((a) => a.date === date && a.free && members.has(a.userId))
        .map((a) => a.userId);
      return {
        date,
        freeUserIds,
        freeCount: freeUserIds.length,
        incompleteFreeCount: freeUserIds.filter((id) => incomplete.has(id)).length,
      };
    })
    .sort(
      (a, b) =>
        b.freeCount - a.freeCount ||
        a.incompleteFreeCount - b.incompleteFreeCount ||
        a.date.localeCompare(b.date)
    );
}
```

```ts
// src/lib/engine/meetingArea.ts
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
```

- [ ] **Step 4: Run** → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/engine/pickDate.ts src/lib/engine/meetingArea.ts tests/unit/pickDate.test.ts tests/unit/meetingArea.test.ts
git commit -m "feat: date ranking and fair meeting area"
```

---

### Task 13: `sketchDay` (AI day shape with template fallback)

**Files:**
- Create: `src/lib/engine/sketchDay.ts`
- Test: `tests/unit/sketchDay.test.ts`

**Interfaces:**
- Consumes: `LlmProvider`, `templateDay`, `dayOrderMinutes`, `HHMM_RE`.
- Produces:
  - `SketchSchema` (zod) `{ slots: Slot[] (3–5) }`
  - `sanitizeSlots(slots: Slot[], earliestDeadline: string | null): Slot[]` — sorts by time, drops slots starting before 07:00, drops overlaps (a slot starting before the previous one ends), drops slots ending after `earliestDeadline` minus 60 minutes.
  - `sketchDay(llm: LlmProvider, ctx: SketchContext): Promise<{ slots: Slot[]; usedTemplate: boolean }>` with `SketchContext = { theme: Theme; date: string; attendees: Attendee[] }`. Falls back to `sanitizeSlots(templateDay(theme), …)` when the LLM throws or fewer than 2 slots survive.

- [ ] **Step 1: Failing test**

```ts
import { describe, it, expect } from "vitest";
import { sketchDay, sanitizeSlots } from "@/lib/engine/sketchDay";
import { FakeLlm } from "@/lib/providers/fake";
import type { Attendee, Slot } from "@/lib/engine/types";
import type { LlmProvider } from "@/lib/providers/types";

const att = (o: Partial<Attendee> = {}): Attendee => ({
  id: "a", name: "A", home: { lat: 12.97, lng: 77.64 }, homeLabel: "Indiranagar",
  transport: "public", interests: ["coffee"], openness: 3, deadline: null, ...o,
});
const s = (startTime: string, durationMin: number, kind: Slot["kind"] = "cafe"): Slot => ({ startTime, durationMin, kind, vibe: "x" });

describe("sanitizeSlots", () => {
  it("sorts, drops early starts and overlaps", () => {
    const out = sanitizeSlots([s("13:00", 60), s("06:00", 60), s("10:00", 120), s("11:30", 60)], null);
    expect(out.map((x) => x.startTime)).toEqual(["10:00", "13:00"]);
  });
  it("drops slots ending within an hour of the earliest deadline", () => {
    const out = sanitizeSlots([s("10:00", 60), s("20:00", 150)], "22:00");
    expect(out.map((x) => x.startTime)).toEqual(["10:00"]);
  });
});

describe("sketchDay", () => {
  it("uses the LLM sketch for the theme", async () => {
    const r = await sketchDay(new FakeLlm(), { theme: "foodie", date: "2026-10-18", attendees: [att()] });
    expect(r.usedTemplate).toBe(false);
    expect(r.slots[0].kind).toBe("cafe");
  });

  it("falls back to the template when the LLM fails", async () => {
    const r = await sketchDay(new FakeLlm({ failSketch: true }), { theme: "adventurous", date: "2026-10-18", attendees: [att()] });
    expect(r.usedTemplate).toBe(true);
    expect(r.slots[0].kind).toBe("beach");
  });

  it("falls back when fewer than 2 slots survive sanitizing", async () => {
    const llm: LlmProvider = {
      json: async (req) => req.schema.parse({ slots: [s("06:00", 60), s("06:30", 60), s("06:45", 60)] }),
    };
    const r = await sketchDay(llm, { theme: "relaxed", date: "2026-10-18", attendees: [att()] });
    expect(r.usedTemplate).toBe(true);
  });

  it("puts the theme and earliest deadline in the prompt", async () => {
    let seen = "";
    const llm: LlmProvider = { json: async (req) => { seen = req.user; throw new Error("x"); } };
    await sketchDay(llm, { theme: "relaxed", date: "2026-10-18", attendees: [att({ deadline: "22:30" })] });
    expect(seen).toContain("Theme: relaxed");
    expect(seen).toContain("22:30");
  });
});
```

- [ ] **Step 2: Run** — FAIL.

- [ ] **Step 3: Implement `src/lib/engine/sketchDay.ts`**

```ts
import { z } from "zod";
import type { LlmProvider } from "@/lib/providers/types";
import { HHMM_RE, dayOrderMinutes } from "@/lib/time";
import { templateDay } from "./templates";
import { SLOT_KINDS, type Attendee, type Slot, type Theme } from "./types";

export const SketchSchema = z.object({
  slots: z
    .array(
      z.object({
        startTime: z.string().regex(HHMM_RE),
        durationMin: z.number().int().min(30).max(240),
        kind: z.enum(SLOT_KINDS),
        vibe: z.string().max(140),
      })
    )
    .min(3)
    .max(5),
});

export interface SketchContext {
  theme: Theme;
  date: string;
  attendees: Attendee[];
}

const EARLIEST_START = dayOrderMinutes("07:00");

export function sanitizeSlots(slots: Slot[], earliestDeadline: string | null): Slot[] {
  const latestEnd = earliestDeadline ? dayOrderMinutes(earliestDeadline) - 60 : Infinity;
  const sorted = [...slots].sort((a, b) => dayOrderMinutes(a.startTime) - dayOrderMinutes(b.startTime));
  const out: Slot[] = [];
  let prevEnd = -Infinity;
  for (const slot of sorted) {
    const start = dayOrderMinutes(slot.startTime);
    const end = start + slot.durationMin;
    if (start < EARLIEST_START || start < prevEnd || end > latestEnd) continue;
    out.push(slot);
    prevEnd = end;
  }
  return out;
}

function earliest(attendees: Attendee[]): string | null {
  const ds = attendees.map((a) => a.deadline).filter((d): d is string => !!d);
  if (ds.length === 0) return null;
  return ds.reduce((a, b) => (dayOrderMinutes(b) < dayOrderMinutes(a) ? b : a));
}

const SYSTEM = `You plan a day out for a group of friends in one Indian city.
Return ONLY JSON: {"slots":[{"startTime":"HH:MM","durationMin":number,"kind":string,"vibe":string}]}
- 3 to 5 slots, in time order, no overlaps, leave 30+ minutes between slots for travel.
- kind must be one of: ${SLOT_KINDS.join(", ")}.
- vibe is one short phrase (max 12 words).
- The last slot must end at least 90 minutes before the earliest home-by time, if one is given.`;

export async function sketchDay(
  llm: LlmProvider,
  ctx: SketchContext
): Promise<{ slots: Slot[]; usedTemplate: boolean }> {
  const deadline = earliest(ctx.attendees);
  const interests = [...new Set(ctx.attendees.flatMap((a) => a.interests))];
  const openness = ctx.attendees.reduce((s, a) => s + a.openness, 0) / ctx.attendees.length;
  const user = [
    `Theme: ${ctx.theme}`,
    `Date: ${ctx.date}`,
    `Group size: ${ctx.attendees.length}`,
    `Shared interests: ${interests.join(", ") || "none listed"}`,
    `Average openness to new places (1-5): ${openness.toFixed(1)}`,
    `Public transport users: ${ctx.attendees.filter((a) => a.transport === "public").length}`,
    `Earliest home-by time: ${deadline ?? "none"}`,
  ].join("\n");

  try {
    const res = await llm.json({ task: "sketch", system: SYSTEM, user, schema: SketchSchema });
    const slots = sanitizeSlots(res.slots, deadline);
    if (slots.length >= 2) return { slots, usedTemplate: false };
  } catch (err) {
    console.warn("[engine] sketch failed, using template", err);
  }
  return { slots: sanitizeSlots(templateDay(ctx.theme), deadline), usedTemplate: true };
}
```

- [ ] **Step 4: Run** → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/engine/sketchDay.ts tests/unit/sketchDay.test.ts
git commit -m "feat: AI day sketch with sanitizing and template fallback"
```

---

### Task 14: `fillSlot` — real venue selection and film pairing

**Files:**
- Create: `src/lib/engine/fillSlot.ts`
- Test: `tests/unit/fillSlot.test.ts`

**Interfaces:**
- Consumes: `PlacesProvider`, `estimateMinutes`, `atLocal`, `addMinutes`, `dayOrderMinutes`.
- Produces:
  - `SEARCH_RADIUS_M: Record<SlotKind, number>`
  - `KIND_INTERESTS: Record<SlotKind, string[]>`
  - `isOpenDuring(opening: OpeningWindow | null, start: string, durationMin: number): boolean` (unknown → true)
  - `scoreVenue(venue: Venue, attendees: Attendee[]): number` (0–100)
  - `pickFilm(films: Film[], attendees: Attendee[]): Film | null`
  - `fillSlot(args: { places: PlacesProvider; slot: Slot; date: string; area: LatLng; attendees: Attendee[]; usedIds: Set<string>; films: Film[] }): Promise<Stop | null>`

- [ ] **Step 1: Failing test**

```ts
import { describe, it, expect } from "vitest";
import { fillSlot, scoreVenue, isOpenDuring, pickFilm } from "@/lib/engine/fillSlot";
import { FakePlaces, FakeMovies } from "@/lib/providers/fake";
import type { Attendee, Venue } from "@/lib/engine/types";

const att = (id: string, lat: number, lng: number, o: Partial<Attendee> = {}): Attendee => ({
  id, name: id, home: { lat, lng }, homeLabel: id, transport: "public",
  interests: ["coffee"], openness: 3, deadline: null, ...o,
});
const venue = (o: Partial<Venue>): Venue => ({
  id: "v", name: "V", lat: 12.95, lng: 77.62, kind: "cafe", rating: 4, priceLevel: 2,
  opening: null, address: null, source: "fake", ...o,
});
const group = [att("a", 12.90, 77.60), att("b", 13.00, 77.65)];

describe("fillSlot helpers", () => {
  it("treats unknown hours as open and respects known hours", () => {
    expect(isOpenDuring(null, "10:00", 60)).toBe(true);
    expect(isOpenDuring({ open: "11:00", close: "22:00" }, "10:00", 60)).toBe(false);
    expect(isOpenDuring({ open: "08:00", close: "00:30" }, "22:00", 120)).toBe(true);
  });

  it("scores a fair, central venue above a lopsided one", () => {
    const central = venue({ lat: 12.95, lng: 77.625 });
    const lopsided = venue({ lat: 12.90, lng: 77.60 });
    expect(scoreVenue(central, group)).toBeGreaterThan(scoreVenue(lopsided, group));
  });

  it("rewards interest match", () => {
    const coffee = scoreVenue(venue({ kind: "cafe" }), group);
    const museum = scoreVenue(venue({ kind: "museum" }), group);
    expect(coffee).toBeGreaterThan(museum);
  });

  it("picks the film matching interests", async () => {
    const films = await new FakeMovies().nowPlaying();
    expect(pickFilm(films, [att("a", 0, 0, { interests: ["photography"] })])?.title).toBe("Deep Field");
    expect(pickFilm([], group)).toBeNull();
  });
});

describe("fillSlot", () => {
  it("returns a stop with timings and skips used venues", async () => {
    const used = new Set(["fake-cafe-3"]);
    const stop = await fillSlot({
      places: new FakePlaces(), slot: { startTime: "10:00", durationMin: 90, kind: "cafe", vibe: "x" },
      date: "2026-10-18", area: { lat: 12.95, lng: 77.62 }, attendees: group, usedIds: used, films: [],
    });
    expect(stop).not.toBeNull();
    expect(stop!.venue.id).not.toBe("fake-cafe-3");
    expect(stop!.startsAt).toBe("2026-10-18T04:30:00.000Z");
    expect(stop!.endsAt).toBe("2026-10-18T06:00:00.000Z");
    expect(stop!.film).toBeNull();
  });

  it("pairs a film with cinema slots", async () => {
    const stop = await fillSlot({
      places: new FakePlaces(), slot: { startTime: "18:00", durationMin: 150, kind: "cinema", vibe: "x" },
      date: "2026-10-18", area: { lat: 12.95, lng: 77.62 }, attendees: group, usedIds: new Set(),
      films: await new FakeMovies().nowPlaying(),
    });
    expect(stop!.film).not.toBeNull();
  });

  it("returns null when nothing is found", async () => {
    const stop = await fillSlot({
      places: new FakePlaces({ emptyKinds: ["beach"] }), slot: { startTime: "09:00", durationMin: 120, kind: "beach", vibe: "x" },
      date: "2026-10-18", area: { lat: 12.95, lng: 77.62 }, attendees: group, usedIds: new Set(), films: [],
    });
    expect(stop).toBeNull();
  });
});
```

- [ ] **Step 2: Run** — FAIL.

- [ ] **Step 3: Implement `src/lib/engine/fillSlot.ts`**

```ts
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
```

- [ ] **Step 4: Run** → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/engine/fillSlot.ts tests/unit/fillSlot.test.ts
git commit -m "feat: venue scoring, slot filling, film pairing"
```

---

### Task 15: `routeAll`, `checkHomeBy`, `repair`

**Files:**
- Create: `src/lib/engine/routeAll.ts`, `src/lib/engine/homeBy.ts`
- Test: `tests/unit/routeAll.test.ts`, `tests/unit/homeBy.test.ts`

**Interfaces:**
- Produces:
  - `routeAll(args: { routes: RoutesProvider; stops: Stop[]; attendees: Attendee[] }): Promise<Leg[]>` — per attendee: `home→0` (arrives exactly at stop 0 start), `i→i+1` (departs at stop i end), `last→home` (departs at last stop end). Attendees routed in parallel.
  - `checkHomeBy(args: { legs: Leg[]; attendees: Attendee[]; date: string }): HomeByEntry[]`
  - `repair(stops: Stop[]): Stop[] | null` — drops the last stop when there are 2+; else shortens a single stop of ≥ 90 min by 30 min; else `null`.

- [ ] **Step 1: Failing tests**

`tests/unit/routeAll.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { routeAll } from "@/lib/engine/routeAll";
import { FakeRoutes } from "@/lib/providers/fake";
import type { Attendee, Stop } from "@/lib/engine/types";

const att = (id: string): Attendee => ({
  id, name: id, home: { lat: 12.9, lng: 77.6 }, homeLabel: id, transport: "own",
  interests: [], openness: 3, deadline: null,
});
const stop = (start: string, end: string, lat: number): Stop => ({
  slot: { startTime: "10:00", durationMin: 60, kind: "cafe", vibe: "" },
  venue: { id: `v${lat}`, name: "V", lat, lng: 77.62, kind: "cafe", rating: null, priceLevel: null, opening: null, address: null, source: "fake" },
  film: null, startsAt: start, endsAt: end,
});

describe("routeAll", () => {
  it("builds home→stops→home legs per attendee with correct timing", async () => {
    const stops = [
      stop("2026-10-18T04:30:00.000Z", "2026-10-18T06:00:00.000Z", 12.95),
      stop("2026-10-18T07:00:00.000Z", "2026-10-18T08:30:00.000Z", 12.96),
    ];
    const legs = await routeAll({ routes: new FakeRoutes(), stops, attendees: [att("a"), att("b")] });
    expect(legs).toHaveLength(6);
    const a = legs.filter((l) => l.attendeeId === "a");
    expect(a.map((l) => [l.from, l.to])).toEqual([["home", 0], [0, 1], [1, "home"]]);
    expect(a[0].arriveAt).toBe("2026-10-18T04:30:00.000Z");
    expect(new Date(a[0].departAt) < new Date(a[0].arriveAt)).toBe(true);
    expect(a[1].departAt).toBe("2026-10-18T06:00:00.000Z");
    expect(a[2].departAt).toBe("2026-10-18T08:30:00.000Z");
  });
});
```

`tests/unit/homeBy.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { checkHomeBy, repair } from "@/lib/engine/homeBy";
import type { Attendee, Leg, Stop } from "@/lib/engine/types";

const att = (id: string, deadline: string | null): Attendee => ({
  id, name: id, home: { lat: 0, lng: 0 }, homeLabel: id, transport: "public",
  interests: [], openness: 3, deadline,
});
const homeLeg = (id: string, arriveAt: string, noService = false): Leg => ({
  attendeeId: id, from: 0, to: "home", mode: "public", departAt: arriveAt, arriveAt,
  route: { distanceM: 1, durationS: 1, approximate: false, noService, geometry: null },
});
const stop = (mins: number): Stop => ({
  slot: { startTime: "10:00", durationMin: mins, kind: "cafe", vibe: "" },
  venue: { id: "v", name: "V", lat: 0, lng: 0, kind: "cafe", rating: null, priceLevel: null, opening: null, address: null, source: "fake" },
  film: null, startsAt: "2026-10-18T04:30:00.000Z",
  endsAt: new Date(Date.parse("2026-10-18T04:30:00.000Z") + mins * 60_000).toISOString(),
});

describe("checkHomeBy", () => {
  it("flags late arrivals against the city-local deadline", () => {
    // 23:00 IST on 2026-10-18 = 17:30Z
    const r = checkHomeBy({
      date: "2026-10-18",
      attendees: [att("a", "23:00"), att("b", "23:00"), att("c", null)],
      legs: [homeLeg("a", "2026-10-18T17:29:00.000Z"), homeLeg("b", "2026-10-18T17:31:00.000Z"), homeLeg("c", "2026-10-18T20:00:00.000Z")],
    });
    expect(r.map((e) => [e.attendeeId, e.ok, e.reason])).toEqual([["a", true, null], ["b", false, "late"], ["c", true, null]]);
  });

  it("handles after-midnight deadlines as next day", () => {
    const r = checkHomeBy({
      date: "2026-10-18", attendees: [att("a", "00:30")],
      legs: [homeLeg("a", "2026-10-18T18:45:00.000Z")], // 00:15 IST next day
    });
    expect(r[0].ok).toBe(true);
  });

  it("fails when there is no transit service home", () => {
    const r = checkHomeBy({ date: "2026-10-18", attendees: [att("a", null)], legs: [homeLeg("a", "2026-10-18T10:00:00.000Z", true)] });
    expect(r[0]).toMatchObject({ ok: false, reason: "no_service" });
  });
});

describe("repair", () => {
  it("drops the last stop when there are several", () => {
    expect(repair([stop(60), stop(60), stop(60)])).toHaveLength(2);
  });
  it("shortens a lone long stop by 30 minutes", () => {
    const r = repair([stop(120)])!;
    expect(r[0].slot.durationMin).toBe(90);
    expect(r[0].endsAt).toBe("2026-10-18T06:00:00.000Z");
  });
  it("gives up on a lone short stop", () => {
    expect(repair([stop(60)])).toBeNull();
  });
});
```

- [ ] **Step 2: Run** — FAIL.

- [ ] **Step 3: Implement**

```ts
// src/lib/engine/routeAll.ts
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
```

```ts
// src/lib/engine/homeBy.ts
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
```

- [ ] **Step 4: Run** → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/engine/routeAll.ts src/lib/engine/homeBy.ts tests/unit/routeAll.test.ts tests/unit/homeBy.test.ts
git commit -m "feat: per-person routing, home-by check, repair"
```

---
### Task 16: Costs, narration, and the option orchestrator

**Files:**
- Create: `src/lib/engine/costs.ts`, `src/lib/engine/narrate.ts`, `src/lib/engine/generate.ts`
- Test: `tests/unit/costs.test.ts`, `tests/unit/narrate.test.ts`, `tests/unit/generate.test.ts`

**Interfaces:**
- Produces (`costs.ts`): `ENTRY_PAISE`, `FOOD_PAISE`, `FARE_BASE_PAISE = 1000`, `FARE_PER_KM_PAISE = 150`, `FUEL_PER_KM_PAISE = 700`, `estimateCosts(args: { stops: Stop[]; legs: Leg[]; attendees: Attendee[] }): CostLine[]` (each component rounded to the nearest ₹1 = 100 paise).
- Produces (`narrate.ts`): `NarrativeSchema`, `narrate(llm: LlmProvider, facts: { theme: Theme; stops: Stop[]; attendees: Attendee[]; homeByReport: HomeByEntry[]; costs: CostLine[] }): Promise<Narrative | null>` (never throws).
- Produces (`generate.ts`):
  - `SUBSTITUTES: Record<SlotKind, SlotKind[]>`
  - `class NoVenuesError extends Error`
  - `generateOption(input: { providers: Providers; attendees: Attendee[]; date: string; theme: Theme; onProgress?: (step: ProgressStep) => void | Promise<void> }): Promise<OptionResult>`
  - `recalculateOption(input: { providers: Providers; stops: Stop[]; attendees: Attendee[]; date: string; theme: Theme }): Promise<Evaluated>` (no repair — locked stops stay; warnings shown)

- [ ] **Step 1: Failing cost test**

```ts
import { describe, it, expect } from "vitest";
import { estimateCosts } from "@/lib/engine/costs";
import type { Attendee, Leg, Stop } from "@/lib/engine/types";

const att = (id: string, transport: "public" | "own"): Attendee => ({
  id, name: id, home: { lat: 0, lng: 0 }, homeLabel: id, transport, interests: [], openness: 3, deadline: null,
});
const stop = (kind: Stop["slot"]["kind"], priceLevel: 1 | 2 | 3 | 4 | null): Stop => ({
  slot: { startTime: "10:00", durationMin: 60, kind, vibe: "" },
  venue: { id: kind, name: kind, lat: 0, lng: 0, kind, rating: null, priceLevel, opening: null, address: null, source: "fake" },
  film: null, startsAt: "", endsAt: "",
});
const leg = (attendeeId: string, km: number): Leg => ({
  attendeeId, from: "home", to: 0, mode: "public", departAt: "", arriveAt: "",
  route: { distanceM: km * 1000, durationS: 1, approximate: false, noService: false, geometry: null },
});

describe("estimateCosts", () => {
  it("adds entry, food, and travel per person in paise", () => {
    const stops = [stop("cafe", 2), stop("cinema", null)];
    const legs = [leg("a", 5), leg("a", 5), leg("a", 5), leg("b", 5), leg("b", 5), leg("b", 5)];
    const [a, b] = estimateCosts({ stops, legs, attendees: [att("a", "public"), att("b", "own")] });
    expect(a).toEqual({ attendeeId: "a", entry: 25000, food: 17500, travel: 5300, total: 47800 });
    expect(b.travel).toBe(10500);
    expect(b.total).toBe(25000 + 17500 + 10500);
  });

  it("defaults street food to the cheapest level", () => {
    const [a] = estimateCosts({ stops: [stop("street_food", null)], legs: [], attendees: [att("a", "public")] });
    expect(a.food).toBe(15000);
  });
});
```

- [ ] **Step 2: Run** — FAIL. **Step 3: Implement `src/lib/engine/costs.ts`**

```ts
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
```

- [ ] **Step 4: Failing narrate test**

```ts
import { describe, it, expect } from "vitest";
import { narrate } from "@/lib/engine/narrate";
import { FakeLlm } from "@/lib/providers/fake";
import type { LlmProvider } from "@/lib/providers/types";
import type { Stop } from "@/lib/engine/types";

const stops: Stop[] = [{
  slot: { startTime: "10:00", durationMin: 60, kind: "cafe", vibe: "" },
  venue: { id: "v", name: "Third Wave Coffee", lat: 0, lng: 0, kind: "cafe", rating: 4.3, priceLevel: 2, opening: null, address: null, source: "fake" },
  film: null, startsAt: "2026-10-18T04:30:00.000Z", endsAt: "2026-10-18T05:30:00.000Z",
}];
const facts = { theme: "relaxed" as const, stops, attendees: [], homeByReport: [], costs: [] };

describe("narrate", () => {
  it("returns the validated narrative", async () => {
    expect((await narrate(new FakeLlm(), facts))?.swot.strengths.length).toBeGreaterThan(0);
  });
  it("returns null instead of throwing", async () => {
    expect(await narrate(new FakeLlm({ failNarrate: true }), facts)).toBeNull();
  });
  it("grounds the prompt in computed facts", async () => {
    let prompt = "";
    const llm: LlmProvider = { json: async (r) => { prompt = r.system + r.user; throw new Error("x"); } };
    await narrate(llm, facts);
    expect(prompt).toContain("Third Wave Coffee");
    expect(prompt).toContain("10:00");
    expect(prompt).toMatch(/only the facts/i);
  });
});
```

- [ ] **Step 5: Run** — FAIL. **Step 6: Implement `src/lib/engine/narrate.ts`**

```ts
import { z } from "zod";
import type { LlmProvider } from "@/lib/providers/types";
import { localHHMM } from "@/lib/time";
import type { Attendee, CostLine, HomeByEntry, Narrative, Stop, Theme } from "./types";

const bullets = z.array(z.string().min(1).max(140)).min(1).max(3);
export const NarrativeSchema = z.object({
  summary: z.string().min(1).max(500),
  swot: z.object({ strengths: bullets, weaknesses: bullets, opportunities: bullets, threats: bullets }),
});

const SYSTEM = `You write a short, friendly summary and SWOT for a group day-out plan.
Use only the facts given. Do not invent venues, prices, times, or distances.
Return ONLY JSON: {"summary": string, "swot": {"strengths": [..], "weaknesses": [..], "opportunities": [..], "threats": [..]}}
Each list has 1-3 short bullets.`;

export async function narrate(
  llm: LlmProvider,
  facts: { theme: Theme; stops: Stop[]; attendees: Attendee[]; homeByReport: HomeByEntry[]; costs: CostLine[] }
): Promise<Narrative | null> {
  const name = (id: string) => facts.attendees.find((a) => a.id === id)?.name.split(" ")[0] ?? "someone";
  const lines = [
    `Theme: ${facts.theme}`,
    "Stops:",
    ...facts.stops.map(
      (s) =>
        `- ${localHHMM(new Date(s.startsAt))}–${localHHMM(new Date(s.endsAt))} ${s.venue.name} (${s.slot.kind}` +
        `${s.venue.rating ? `, rated ${s.venue.rating}` : ""}${s.film ? `, film: ${s.film.title}` : ""})`
    ),
    "Home-by:",
    ...facts.homeByReport.map(
      (h) => `- ${name(h.attendeeId)}: home ${localHHMM(new Date(h.arriveHomeAt))}${h.deadline ? ` (needs ${h.deadline})` : ""}${h.ok ? "" : ` PROBLEM: ${h.reason}`}`
    ),
    `Average cost per person: ₹${Math.round(facts.costs.reduce((s, c) => s + c.total, 0) / Math.max(1, facts.costs.length) / 100)}`,
  ];
  try {
    return await llm.json({ task: "narrate", system: SYSTEM, user: lines.join("\n"), schema: NarrativeSchema });
  } catch (err) {
    console.warn("[engine] narrate failed", err);
    return null;
  }
}
```

- [ ] **Step 7: Failing orchestrator test (includes Review Focus #2)**

`tests/unit/generate.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { generateOption, recalculateOption, NoVenuesError } from "@/lib/engine/generate";
import { fakeProviders, FakePlaces, FakeRoutes, FakeLlm } from "@/lib/providers/fake";
import { SLOT_KINDS, type Attendee, type ProgressStep } from "@/lib/engine/types";
import { resetDb } from "../helpers/db";

const att = (id: string, lat: number, lng: number, o: Partial<Attendee> = {}): Attendee => ({
  id, name: id, home: { lat, lng }, homeLabel: id, transport: "public",
  interests: ["coffee", "movies"], openness: 4, deadline: null, ...o,
});
const group = [att("a", 12.90, 77.60), att("b", 13.00, 77.65)];
const date = "2026-10-18";

describe("generateOption", () => {
  beforeEach(resetDb);

  it("produces stops, routes, costs, home-by, and narrative with progress", async () => {
    const steps: ProgressStep[] = [];
    const r = await generateOption({ providers: fakeProviders(), attendees: group, date, theme: "relaxed", onProgress: (s) => void steps.push(s) });
    expect(r.stops.length).toBeGreaterThanOrEqual(2);
    expect(r.routes).toHaveLength(group.length * (r.stops.length + 1));
    expect(r.costs.map((c) => c.attendeeId)).toEqual(["a", "b"]);
    expect(r.homeByReport.every((h) => h.ok)).toBe(true);
    expect(r.narrative).not.toBeNull();
    expect(steps).toEqual(["sketching", "finding_venues", "routing", "checking_home", "costing", "writing"]);
    expect(new Set(r.stops.map((s) => s.venue.id)).size).toBe(r.stops.length);
  });

  it("substitutes a related kind when a kind has no venues", async () => {
    const providers = fakeProviders({ places: new FakePlaces({ emptyKinds: ["beach"] }) });
    const r = await generateOption({ providers, attendees: group, date, theme: "adventurous" });
    expect(r.stops[0].slot.kind).toBe("park");
  });

  it("throws NoVenuesError when nothing at all is found", async () => {
    const providers = fakeProviders({ places: new FakePlaces({ emptyKinds: [...SLOT_KINDS] }) });
    await expect(generateOption({ providers, attendees: group, date, theme: "relaxed" })).rejects.toBeInstanceOf(NoVenuesError);
  });

  it("repairs a plan that would get someone home late", async () => {
    const providers = fakeProviders({ routes: new FakeRoutes({ slowFactor: 4 }) });
    const attendees = [att("a", 12.90, 77.60, { deadline: "21:00" }), att("b", 13.00, 77.65)];
    const r = await generateOption({ providers, attendees, date, theme: "relaxed" });
    expect(r.stops.map((s) => s.slot.kind)).not.toContain("cinema");
    expect(r.homeByReport.every((h) => h.ok)).toBe(true);
  });

  it("keeps the option without a narrative when narration fails", async () => {
    const r = await generateOption({ providers: fakeProviders({ llm: new FakeLlm({ failNarrate: true }) }), attendees: group, date, theme: "foodie" });
    expect(r.narrative).toBeNull();
    expect(r.stops.length).toBeGreaterThan(0);
  });

  it("recalculates for a smaller group without changing stops", async () => {
    const first = await generateOption({ providers: fakeProviders(), attendees: group, date, theme: "relaxed" });
    const re = await recalculateOption({ providers: fakeProviders(), stops: first.stops, attendees: [group[0]], date, theme: "relaxed" });
    expect(new Set(re.routes.map((l) => l.attendeeId))).toEqual(new Set(["a"]));
    expect(re.costs).toHaveLength(1);
  });
});
```

- [ ] **Step 8: Run** — FAIL. **Step 9: Implement `src/lib/engine/generate.ts`**

```ts
import type { Providers } from "@/lib/providers/types";
import { sketchDay } from "./sketchDay";
import { meetingArea } from "./meetingArea";
import { fillSlot } from "./fillSlot";
import { routeAll } from "./routeAll";
import { checkHomeBy, repair } from "./homeBy";
import { estimateCosts } from "./costs";
import { narrate } from "./narrate";
import type { Attendee, Evaluated, Film, OptionResult, ProgressStep, SlotKind, Stop, Theme } from "./types";

export const SUBSTITUTES: Record<SlotKind, SlotKind[]> = {
  beach: ["park", "viewpoint"],
  viewpoint: ["park"],
  gaming: ["mall", "cafe"],
  museum: ["mall", "park"],
  street_food: ["restaurant"],
  cinema: ["mall"],
  park: ["cafe"],
  mall: ["cafe"],
  cafe: ["restaurant"],
  restaurant: ["street_food"],
};

export class NoVenuesError extends Error {
  constructor() {
    super("No venues found for this plan.");
  }
}

const MAX_REPAIRS = 3;

async function routeAndCheck(providers: Providers, stops: Stop[], attendees: Attendee[], date: string) {
  const routes = await routeAll({ routes: providers.routes, stops, attendees });
  const homeByReport = checkHomeBy({ legs: routes, attendees, date });
  return { routes, homeByReport };
}

export async function generateOption(input: {
  providers: Providers;
  attendees: Attendee[];
  date: string;
  theme: Theme;
  onProgress?: (step: ProgressStep) => void | Promise<void>;
}): Promise<OptionResult> {
  const { providers, attendees, date, theme } = input;
  const progress = async (s: ProgressStep) => input.onProgress?.(s);

  await progress("sketching");
  const { slots } = await sketchDay(providers.llm, { theme, date, attendees });

  await progress("finding_venues");
  const area = meetingArea(attendees);
  const films: Film[] = slots.some((s) => s.kind === "cinema" || SUBSTITUTES[s.kind].includes("cinema"))
    ? await providers.movies.nowPlaying("IN").catch(() => [])
    : [];

  const usedIds = new Set<string>();
  let stops: Stop[] = [];
  for (const slot of slots) {
    let stop: Stop | null = null;
    for (const kind of [slot.kind, ...SUBSTITUTES[slot.kind]]) {
      stop = await fillSlot({
        places: providers.places, slot: { ...slot, kind }, date, area, attendees, usedIds, films,
      }).catch((err) => {
        console.warn(`[engine] fillSlot ${kind} failed`, err);
        return null;
      });
      if (stop) break;
    }
    if (stop) {
      stops.push(stop);
      usedIds.add(stop.venue.id);
    }
  }
  if (stops.length === 0) throw new NoVenuesError();

  await progress("routing");
  let evald = await routeAndCheck(providers, stops, attendees, date);

  await progress("checking_home");
  for (let i = 0; i < MAX_REPAIRS && evald.homeByReport.some((h) => !h.ok); i++) {
    const repaired = repair(stops);
    if (!repaired) break;
    stops = repaired;
    evald = await routeAndCheck(providers, stops, attendees, date);
  }

  await progress("costing");
  const costs = estimateCosts({ stops, legs: evald.routes, attendees });

  await progress("writing");
  const narrative = await narrate(providers.llm, { theme, stops, attendees, homeByReport: evald.homeByReport, costs });

  return {
    theme,
    stops,
    routes: evald.routes,
    homeByReport: evald.homeByReport,
    costs,
    narrative,
    approximateTransit: evald.routes.some((l) => l.route.approximate),
  };
}

export async function recalculateOption(input: {
  providers: Providers;
  stops: Stop[];
  attendees: Attendee[];
  date: string;
  theme: Theme;
}): Promise<Evaluated> {
  const { providers, stops, attendees, date, theme } = input;
  const { routes, homeByReport } = await routeAndCheck(providers, stops, attendees, date);
  const costs = estimateCosts({ stops, legs: routes, attendees });
  const narrative = await narrate(providers.llm, { theme, stops, attendees, homeByReport, costs });
  return { routes, homeByReport, costs, narrative, approximateTransit: routes.some((l) => l.route.approximate) };
}
```

(`resetDb` in this test is harmless — `fakeProviders()` does not use the DB; it is kept so the file can later use `cachedRoutes` without changes.)

- [ ] **Step 10: Run** — `npx vitest run tests/unit/costs.test.ts tests/unit/narrate.test.ts tests/unit/generate.test.ts` → PASS.

- [ ] **Step 11: Commit**

```bash
git add src/lib/engine tests/unit
git commit -m "feat: cost estimates, grounded narration, option orchestrator"
```

---

### Task 17: Settle-up and outcome rules

**Files:**
- Create: `src/lib/engine/settle.ts`, `src/lib/engine/outcome.ts`
- Test: `tests/unit/settle.test.ts`, `tests/unit/outcome.test.ts`

**Interfaces:**
- Produces:
  - `interface Transfer { from: string; to: string; amount: number }` (paise)
  - `balances(expenses: { paidById: string; amount: number; splitAmong: string[] }[]): Map<string, number>` — remainder paise go to the first members of `splitAmong` sorted by id.
  - `settle(expenses: …same…): Transfer[]` — greedy largest-creditor/largest-debtor; deterministic (ties by id).
  - `CHECKIN_GRACE_DAYS = 3`
  - `checkInOpensAt(date: string): Date` (= `atLocal(date, "05:00")`)
  - `decisionOpensAt(date: string): Date` (= next day 05:00 city time)
  - `evaluateOutcome(input: { date: string; goingIds: string[]; checkIns: { userId: string; attended: boolean }[]; now: Date }): "completed" | "failed" | null`

- [ ] **Step 1: Failing tests**

`tests/unit/settle.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { settle, balances } from "@/lib/engine/settle";

describe("settle", () => {
  it("returns nothing when there are no expenses", () => {
    expect(settle([])).toEqual([]);
  });

  it("splits one bill evenly", () => {
    expect(settle([{ paidById: "a", amount: 90000, splitAmong: ["a", "b", "c"] }])).toEqual([
      { from: "b", to: "a", amount: 30000 },
      { from: "c", to: "a", amount: 30000 },
    ]);
  });

  it("nets multiple bills into minimal transfers", () => {
    const t = settle([
      { paidById: "a", amount: 60000, splitAmong: ["a", "b"] },
      { paidById: "b", amount: 60000, splitAmong: ["a", "b"] },
    ]);
    expect(t).toEqual([]);
  });

  it("assigns leftover paise deterministically and balances to zero", () => {
    const b = balances([{ paidById: "a", amount: 100, splitAmong: ["c", "b", "a"] }]);
    expect([...b.values()].reduce((s, v) => s + v, 0)).toBe(0);
    expect(b.get("a")).toBe(100 - 34);
    expect(b.get("b")).toBe(-33);
    expect(b.get("c")).toBe(-33);
  });
});
```

`tests/unit/outcome.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { evaluateOutcome } from "@/lib/engine/outcome";

const date = "2026-10-18";
const nextDay = new Date("2026-10-19T00:00:00.000Z"); // 05:30 IST on the 19th
const goingIds = ["a", "b", "c", "d"];

describe("evaluateOutcome", () => {
  it("is undecided before the day is over", () => {
    expect(evaluateOutcome({ date, goingIds, checkIns: [], now: new Date("2026-10-18T15:00:00Z") })).toBeNull();
  });
  it("completes when at least half attended", () => {
    const checkIns = [{ userId: "a", attended: true }, { userId: "b", attended: true }];
    expect(evaluateOutcome({ date, goingIds, checkIns, now: nextDay })).toBe("completed");
  });
  it("waits while fewer than half have confirmed and others haven't answered", () => {
    expect(evaluateOutcome({ date, goingIds, checkIns: [{ userId: "a", attended: true }], now: nextDay })).toBeNull();
  });
  it("fails once everyone answered and fewer than half went", () => {
    const checkIns = [
      { userId: "a", attended: true }, { userId: "b", attended: false },
      { userId: "c", attended: false }, { userId: "d", attended: false },
    ];
    expect(evaluateOutcome({ date, goingIds, checkIns, now: nextDay })).toBe("failed");
  });
  it("fails after 3 days without a decision", () => {
    expect(evaluateOutcome({ date, goingIds, checkIns: [], now: new Date("2026-10-22T00:00:00Z") })).toBe("failed");
  });
  it("fails when nobody was going", () => {
    expect(evaluateOutcome({ date, goingIds: [], checkIns: [], now: nextDay })).toBe("failed");
  });
  it("ignores check-ins from people who were not going", () => {
    const checkIns = [{ userId: "x", attended: true }, { userId: "y", attended: true }];
    expect(evaluateOutcome({ date, goingIds, checkIns, now: nextDay })).toBeNull();
  });
});
```

- [ ] **Step 2: Run** — FAIL.

- [ ] **Step 3: Implement**

```ts
// src/lib/engine/settle.ts
export interface Transfer { from: string; to: string; amount: number }
type Expense = { paidById: string; amount: number; splitAmong: string[] };

export function balances(expenses: Expense[]): Map<string, number> {
  const bal = new Map<string, number>();
  const add = (id: string, v: number) => bal.set(id, (bal.get(id) ?? 0) + v);
  for (const e of expenses) {
    const people = [...e.splitAmong].sort();
    const share = Math.floor(e.amount / people.length);
    let leftover = e.amount - share * people.length;
    add(e.paidById, e.amount);
    for (const p of people) {
      add(p, -(share + (leftover > 0 ? 1 : 0)));
      if (leftover > 0) leftover--;
    }
  }
  return bal;
}

export function settle(expenses: Expense[]): Transfer[] {
  const bal = balances(expenses);
  const creditors = [...bal].filter(([, v]) => v > 0).map(([id, v]) => ({ id, v }));
  const debtors = [...bal].filter(([, v]) => v < 0).map(([id, v]) => ({ id, v: -v }));
  const order = (a: { id: string; v: number }, b: { id: string; v: number }) => b.v - a.v || a.id.localeCompare(b.id);
  const out: Transfer[] = [];
  while (creditors.length && debtors.length) {
    creditors.sort(order);
    debtors.sort(order);
    const c = creditors[0], d = debtors[0];
    const amount = Math.min(c.v, d.v);
    out.push({ from: d.id, to: c.id, amount });
    c.v -= amount;
    d.v -= amount;
    if (c.v === 0) creditors.shift();
    if (d.v === 0) debtors.shift();
  }
  return out;
}
```

```ts
// src/lib/engine/outcome.ts
import { addMinutes, atLocal } from "@/lib/time";

export const CHECKIN_GRACE_DAYS = 3;

export function checkInOpensAt(date: string): Date {
  return atLocal(date, "05:00");
}

export function decisionOpensAt(date: string): Date {
  return addMinutes(atLocal(date, "05:00"), 24 * 60);
}

export function evaluateOutcome(input: {
  date: string;
  goingIds: string[];
  checkIns: { userId: string; attended: boolean }[];
  now: Date;
}): "completed" | "failed" | null {
  const opens = decisionOpensAt(input.date);
  if (input.now < opens) return null;
  const going = new Set(input.goingIds);
  if (going.size === 0) return "failed";
  const answered = input.checkIns.filter((c) => going.has(c.userId));
  const attended = answered.filter((c) => c.attended).length;
  if (attended * 2 >= going.size) return "completed";
  if (answered.length === going.size) return "failed";
  if (input.now >= addMinutes(opens, CHECKIN_GRACE_DAYS * 24 * 60)) return "failed";
  return null;
}
```

Check the "nets multiple bills" test: a pays 600 split a,b → a +300, b −300; b pays 600 split a,b → b +300, a −300 → all zero → `[]`. ✓

- [ ] **Step 4: Run** → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/engine/settle.ts src/lib/engine/outcome.ts tests/unit/settle.test.ts tests/unit/outcome.test.ts
git commit -m "feat: settle-up and outing outcome rules"
```

---

## Phase C — Outing APIs

### Task 18: Outing creation, detail view, availability, date confirmation

**Files:**
- Create: `src/lib/background.ts`, `src/lib/outings/attendees.ts`, `src/lib/outings/view.ts`, `src/lib/outings/permissions.ts`
- Create: `src/app/api/groups/[id]/outings/route.ts`, `src/app/api/outings/route.ts`, `src/app/api/outings/[id]/route.ts`, `src/app/api/outings/[id]/availability/route.ts`, `src/app/api/outings/[id]/confirm-date/route.ts`
- Create: `tests/helpers/outings.ts`
- Test: `tests/api/outings-collect.test.ts`

**Interfaces:**
- Produces:
  - `runInBackground(task: () => Promise<void>): Promise<void>` — awaits the task when `process.env.VITEST` or `WAYPOINT_SYNC_BACKGROUND === "1"`, otherwise schedules with `after()` from `next/server`.
  - `toAttendee(u: User, groupHomeBy: string | null): Attendee`
  - `loadAttendees(outing: Outing, mode: "free" | "going"): Promise<Attendee[]>` — only **current** group members with complete profiles; `free` = available on `outing.date`; `going` = RSVP `going`.
  - `requireOrganiser(outing: Outing, userId: string, role: Role): void` (403 `"Only the organiser or admin can do that."`)
  - `redactRoutes(routes: Leg[], viewerId: string): Leg[]` — strips `geometry` from home legs of other attendees.
  - `outingView(outingId: string, viewerId: string): Promise<OutingView>` — the full detail payload (shape below).
- API:
  - `POST /api/groups/[id]/outings {title, rangeStart, rangeEnd, groupHomeBy|null}` → `201 {outing: {id}}`
  - `GET /api/outings` → `{outings: {id,title,status,date,rangeStart,rangeEnd,groupId,groupName}[]}` across my groups, newest first
  - `GET /api/outings/[id]` → `OutingView`
  - `PUT /api/outings/[id]/availability {free: string[]}` → `{ok}`
  - `POST /api/outings/[id]/confirm-date {date}` → `{ok}`

`OutingView` (returned by `outingView`):

```ts
{
  outing: { id; title; status; rangeStart; rangeEnd; date; groupHomeBy; cancelReason; lockedOptionId; createdById; groupId; groupName };
  me: { id; role; isOrganiser: boolean; canManage: boolean; rsvp: RsvpStatus | null; voteOptionId: string | null; checkIn: boolean | null; freeDates: string[] };
  members: PublicMember[];
  dates: { date: string; freeUserIds: string[]; freeCount: number }[];   // ranked
  options: { id; theme; status; progress; error; stops; routes /* redacted */; costs; homeByReport; narrative; approximateTransit; voteCount: number; showtimes: { stopIndex: number; startsAt: string }[] }[];
  rsvps: { userId; status; cancelledAt; cancelReason }[];
  checkIns: { userId; attended }[];
  expenses: { id; paidById; amount; note; stopIndex; splitAmong; createdAt }[];
  transfers: Transfer[];
}
```

- [ ] **Step 1: Write `src/lib/background.ts`**

Read `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/after.md` first.

```ts
import { after } from "next/server";

/** Run slow work after the response. Tests and E2E run it inline so results are deterministic. */
export function runInBackground(task: () => Promise<void>): Promise<void> {
  if (process.env.VITEST || process.env.WAYPOINT_SYNC_BACKGROUND === "1") return task();
  after(() =>
    task().catch((err) => console.error("[background] task failed", err))
  );
  return Promise.resolve();
}
```

- [ ] **Step 2: Write `src/lib/outings/attendees.ts` and `permissions.ts`**

```ts
// src/lib/outings/attendees.ts
import type { Outing, User } from "@prisma/client";
import { prisma } from "@/lib/db";
import { effectiveDeadline } from "@/lib/deadline";
import { isProfileComplete } from "@/lib/profile";
import type { Attendee } from "@/lib/engine/types";

export function toAttendee(u: User, groupHomeBy: string | null): Attendee {
  return {
    id: u.id,
    name: u.name ?? "Friend",
    home: { lat: u.homeLat!, lng: u.homeLng! },
    homeLabel: u.homeLabel ?? "",
    transport: u.transport,
    interests: u.interests,
    openness: u.openness,
    deadline: effectiveDeadline(u, groupHomeBy),
  };
}

export async function loadAttendees(outing: Outing, mode: "free" | "going"): Promise<Attendee[]> {
  const members = await prisma.membership.findMany({
    where: { groupId: outing.groupId },
    include: { user: true },
    orderBy: { joinedAt: "asc" },
  });
  let ids: Set<string>;
  if (mode === "free") {
    const rows = outing.date
      ? await prisma.availability.findMany({ where: { outingId: outing.id, date: outing.date, free: true } })
      : [];
    ids = new Set(rows.map((r) => r.userId));
  } else {
    const rows = await prisma.rsvp.findMany({ where: { outingId: outing.id, status: "going" } });
    ids = new Set(rows.map((r) => r.userId));
  }
  return members
    .map((m) => m.user)
    .filter((u) => ids.has(u.id) && isProfileComplete(u))
    .map((u) => toAttendee(u, outing.groupHomeBy));
}
```

```ts
// src/lib/outings/permissions.ts
import type { Outing, Role } from "@prisma/client";
import { HttpError } from "@/lib/http";

export function requireOrganiser(outing: Outing, userId: string, role: Role) {
  if (outing.createdById !== userId && role !== "admin") {
    throw new HttpError(403, "Only the organiser or admin can do that.");
  }
}

export function requireStatus(outing: Outing, ...allowed: Outing["status"][]) {
  if (!allowed.includes(outing.status)) {
    throw new HttpError(409, `This outing is ${outing.status}.`);
  }
}
```

- [ ] **Step 3: Write `src/lib/outings/view.ts`**

```ts
import { prisma } from "@/lib/db";
import { datesInRange } from "@/lib/time";
import { pickDate } from "@/lib/engine/pickDate";
import { settle } from "@/lib/engine/settle";
import { isProfileComplete } from "@/lib/profile";
import { publicMember } from "@/lib/serialize";
import type { CostLine, HomeByEntry, Leg, Narrative, Stop } from "@/lib/engine/types";

export function redactRoutes(routes: Leg[], viewerId: string): Leg[] {
  return routes.map((l) =>
    l.attendeeId !== viewerId && (l.from === "home" || l.to === "home")
      ? { ...l, route: { ...l.route, geometry: null } }
      : l
  );
}

export async function outingView(outingId: string, viewerId: string) {
  const o = await prisma.outing.findUniqueOrThrow({
    where: { id: outingId },
    include: {
      group: { include: { memberships: { include: { user: true }, orderBy: { joinedAt: "asc" } } } },
      availability: true,
      rsvps: true,
      votes: true,
      checkIns: true,
      expenses: { orderBy: { createdAt: "asc" } },
      options: { orderBy: { createdAt: "asc" }, include: { showtimes: true } },
    },
  });
  const memberships = o.group.memberships;
  const mine = memberships.find((m) => m.userId === viewerId)!;
  const memberIds = memberships.map((m) => m.userId);
  const ranked = pickDate({
    dates: datesInRange(o.rangeStart, o.rangeEnd),
    availability: o.availability,
    memberIds,
    incompleteIds: memberships.filter((m) => !isProfileComplete(m.user)).map((m) => m.userId),
  });

  return {
    outing: {
      id: o.id, title: o.title, status: o.status, rangeStart: o.rangeStart, rangeEnd: o.rangeEnd,
      date: o.date, groupHomeBy: o.groupHomeBy, cancelReason: o.cancelReason,
      lockedOptionId: o.lockedOptionId, createdById: o.createdById, groupId: o.groupId, groupName: o.group.name,
    },
    me: {
      id: viewerId,
      role: mine.role,
      isOrganiser: o.createdById === viewerId,
      canManage: o.createdById === viewerId || mine.role === "admin",
      rsvp: o.rsvps.find((r) => r.userId === viewerId)?.status ?? null,
      voteOptionId: o.votes.find((v) => v.userId === viewerId)?.optionId ?? null,
      checkIn: o.checkIns.find((c) => c.userId === viewerId)?.attended ?? null,
      freeDates: o.availability.filter((a) => a.userId === viewerId && a.free).map((a) => a.date),
    },
    members: memberships.map((m) => publicMember(m.user, m.role)),
    dates: ranked.map(({ date, freeUserIds, freeCount }) => ({ date, freeUserIds, freeCount })),
    options: o.options.map((opt) => ({
      id: opt.id, theme: opt.theme, status: opt.status, progress: opt.progress, error: opt.error,
      stops: opt.stops as unknown as Stop[],
      routes: redactRoutes(opt.routes as unknown as Leg[], viewerId),
      costs: opt.costs as unknown as CostLine[],
      homeByReport: opt.homeByReport as unknown as HomeByEntry[],
      narrative: opt.narrative as unknown as Narrative | null,
      approximateTransit: opt.approximateTransit,
      voteCount: o.votes.filter((v) => v.optionId === opt.id).length,
      showtimes: opt.showtimes.map((s) => ({ stopIndex: s.stopIndex, startsAt: s.startsAt.toISOString() })),
    })),
    rsvps: o.rsvps
      .filter((r) => memberIds.includes(r.userId))
      .map((r) => ({ userId: r.userId, status: r.status, cancelledAt: r.cancelledAt, cancelReason: r.cancelReason })),
    checkIns: o.checkIns.map((c) => ({ userId: c.userId, attended: c.attended })),
    expenses: o.expenses.map((e) => ({
      id: e.id, paidById: e.paidById, amount: e.amount, note: e.note,
      stopIndex: e.stopIndex, splitAmong: e.splitAmong, createdAt: e.createdAt,
    })),
    transfers: settle(o.expenses),
  };
}

export type OutingView = Awaited<ReturnType<typeof outingView>>;
```

- [ ] **Step 4: Write test helpers `tests/helpers/outings.ts`**

```ts
import { prisma } from "@/lib/db";
import { addMinutes, localDate } from "@/lib/time";
import { makeCompleteUser, makeGroup } from "./factories";

export const dayFromNow = (n: number) => localDate(addMinutes(new Date(), n * 24 * 60));

/** Admin + 2 members, a collecting outing over the next week, all free on day +3. */
export async function outingFixture(opts: { confirm?: boolean } = {}) {
  const admin = await makeCompleteUser({ name: "Admin Person", homeLat: 12.90123, homeLng: 77.60123 });
  const b = await makeCompleteUser({ name: "Bea", gender: "female", homeLat: 13.00456, homeLng: 77.65456 });
  const c = await makeCompleteUser({ name: "Cy", transport: "own", homeLat: 12.95789, homeLng: 77.70789 });
  const group = await makeGroup(admin.id, [b.id, c.id]);
  const date = dayFromNow(3);
  const outing = await prisma.outing.create({
    data: {
      groupId: group.id, createdById: admin.id, title: "Weekend",
      rangeStart: dayFromNow(1), rangeEnd: dayFromNow(7),
      date: opts.confirm ? date : null,
    },
  });
  await prisma.availability.createMany({
    data: [admin, b, c].map((u) => ({ outingId: outing.id, userId: u.id, date, free: true })),
  });
  return { admin, b, c, group, outing, date };
}
```

- [ ] **Step 5: Failing test `tests/api/outings-collect.test.ts`**

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { resetDb } from "../helpers/db";
import { asUser, call } from "../helpers/http";
import { makeCompleteUser, makeGroup } from "../helpers/factories";
import { dayFromNow, outingFixture } from "../helpers/outings";
import { POST as createOuting } from "@/app/api/groups/[id]/outings/route";
import { GET as listOutings } from "@/app/api/outings/route";
import { GET as getOuting } from "@/app/api/outings/[id]/route";
import { PUT as putAvailability } from "@/app/api/outings/[id]/availability/route";
import { POST as confirmDate } from "@/app/api/outings/[id]/confirm-date/route";
import { prisma } from "@/lib/db";

describe("outing collection phase", () => {
  beforeEach(resetDb);

  it("creates an outing with validated range", async () => {
    const a = await makeCompleteUser();
    const g = await makeGroup(a.id);
    await asUser(a.id);
    const ok = await call(createOuting, {
      method: "POST", params: { id: g.id },
      body: { title: "Beach day", rangeStart: dayFromNow(1), rangeEnd: dayFromNow(5), groupHomeBy: "22:30" },
    });
    expect(ok.status).toBe(201);
    const bad = (body: object) => call(createOuting, { method: "POST", params: { id: g.id }, body: { title: "x", groupHomeBy: null, ...body } });
    expect((await bad({ rangeStart: dayFromNow(5), rangeEnd: dayFromNow(1) })).status).toBe(400);
    expect((await bad({ rangeStart: dayFromNow(1), rangeEnd: dayFromNow(16) })).status).toBe(400);
    expect((await bad({ rangeStart: dayFromNow(-2), rangeEnd: dayFromNow(1) })).status).toBe(400);
  });

  it("outsiders cannot create, read, or mark availability", async () => {
    const { outing, group } = await outingFixture();
    const stranger = await makeCompleteUser();
    await asUser(stranger.id);
    expect((await call(createOuting, { method: "POST", params: { id: group.id }, body: { title: "x", rangeStart: dayFromNow(1), rangeEnd: dayFromNow(2), groupHomeBy: null } })).status).toBe(404);
    expect((await call(getOuting, { params: { id: outing.id } })).status).toBe(404);
    expect((await call(putAvailability, { method: "PUT", params: { id: outing.id }, body: { free: [] } })).status).toBe(404);
    expect((await call(listOutings)).json.outings).toEqual([]);
  });

  it("replaces my availability and ranks dates", async () => {
    const { outing, b, date } = await outingFixture();
    await asUser(b.id);
    const other = dayFromNow(2);
    expect((await call(putAvailability, { method: "PUT", params: { id: outing.id }, body: { free: [other] } })).status).toBe(200);
    const view = (await call(getOuting, { params: { id: outing.id } })).json;
    expect(view.me.freeDates).toEqual([other]);
    expect(view.dates[0].date).toBe(date); // admin + c still free on `date`
    expect(view.dates[0].freeCount).toBe(2);
  });

  it("rejects dates outside the range", async () => {
    const { outing, b } = await outingFixture();
    await asUser(b.id);
    expect((await call(putAvailability, { method: "PUT", params: { id: outing.id }, body: { free: [dayFromNow(30)] } })).status).toBe(400);
  });

  it("only organiser/admin confirms a date inside the range", async () => {
    const { outing, admin, b, date } = await outingFixture();
    await asUser(b.id);
    expect((await call(confirmDate, { method: "POST", params: { id: outing.id }, body: { date } })).status).toBe(403);
    await asUser(admin.id);
    expect((await call(confirmDate, { method: "POST", params: { id: outing.id }, body: { date: dayFromNow(30) } })).status).toBe(400);
    expect((await call(confirmDate, { method: "POST", params: { id: outing.id }, body: { date } })).status).toBe(200);
    expect((await prisma.outing.findUniqueOrThrow({ where: { id: outing.id } })).date).toBe(date);
  });

  it("lists outings across my groups", async () => {
    const { admin } = await outingFixture();
    await asUser(admin.id);
    const res = await call(listOutings);
    expect(res.json.outings).toHaveLength(1);
    expect(res.json.outings[0].groupName).toBe("Test Group");
  });
});
```

- [ ] **Step 6: Run** — FAIL.

- [ ] **Step 7: Implement routes**

```ts
// src/app/api/groups/[id]/outings/route.ts
import { z } from "zod";
import { prisma } from "@/lib/db";
import { route, ok, parseBody, requireCompleteUser, requireMember, HttpError } from "@/lib/http";
import { DATE_RE, HHMM_RE, datesInRange, localDate } from "@/lib/time";

const Body = z.object({
  title: z.string().trim().min(1, "Give the outing a name.").max(60),
  rangeStart: z.string().regex(DATE_RE),
  rangeEnd: z.string().regex(DATE_RE),
  groupHomeBy: z.string().regex(HHMM_RE).nullable(),
});

export const POST = route<{ id: string }>(async (req, { params }) => {
  const user = await requireCompleteUser();
  const { id } = await params;
  await requireMember(id, user.id);
  const b = await parseBody(req, Body);

  if (b.rangeStart < localDate(new Date())) throw new HttpError(400, "Pick dates from today onward.");
  if (b.rangeEnd < b.rangeStart) throw new HttpError(400, "The end date is before the start date.");
  if (datesInRange(b.rangeStart, b.rangeEnd).length > 14) throw new HttpError(400, "Pick a range of 14 days or fewer.");

  const outing = await prisma.outing.create({
    data: { groupId: id, createdById: user.id, ...b },
  });
  return ok({ outing: { id: outing.id } }, 201);
});
```

```ts
// src/app/api/outings/route.ts
import { prisma } from "@/lib/db";
import { route, ok, requireUser } from "@/lib/http";

export const GET = route(async () => {
  const user = await requireUser();
  const outings = await prisma.outing.findMany({
    where: { group: { memberships: { some: { userId: user.id } } } },
    include: { group: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return ok({
    outings: outings.map((o) => ({
      id: o.id, title: o.title, status: o.status, date: o.date,
      rangeStart: o.rangeStart, rangeEnd: o.rangeEnd, groupId: o.groupId, groupName: o.group.name,
    })),
  });
});
```

```ts
// src/app/api/outings/[id]/route.ts
import { route, ok, requireUser, requireOutingMember } from "@/lib/http";
import { outingView } from "@/lib/outings/view";

export const GET = route<{ id: string }>(async (_req, { params }) => {
  const user = await requireUser();
  const { id } = await params;
  await requireOutingMember(id, user.id);
  return ok(await outingView(id, user.id));
});
```

```ts
// src/app/api/outings/[id]/availability/route.ts
import { z } from "zod";
import { prisma } from "@/lib/db";
import { route, ok, parseBody, requireUser, requireOutingMember, HttpError } from "@/lib/http";
import { requireStatus } from "@/lib/outings/permissions";
import { DATE_RE, datesInRange } from "@/lib/time";

const Body = z.object({ free: z.array(z.string().regex(DATE_RE)).max(14) });

export const PUT = route<{ id: string }>(async (req, { params }) => {
  const user = await requireUser();
  const { id } = await params;
  const { outing } = await requireOutingMember(id, user.id);
  requireStatus(outing, "collecting");
  const { free } = await parseBody(req, Body);

  const range = datesInRange(outing.rangeStart, outing.rangeEnd);
  if (free.some((d) => !range.includes(d))) throw new HttpError(400, "That date isn't in this outing's range.");

  await prisma.$transaction([
    prisma.availability.deleteMany({ where: { outingId: id, userId: user.id } }),
    prisma.availability.createMany({
      data: range.map((date) => ({ outingId: id, userId: user.id, date, free: free.includes(date) })),
    }),
  ]);
  return ok({ ok: true });
});
```

```ts
// src/app/api/outings/[id]/confirm-date/route.ts
import { z } from "zod";
import { prisma } from "@/lib/db";
import { route, ok, parseBody, requireUser, requireOutingMember, HttpError } from "@/lib/http";
import { requireOrganiser, requireStatus } from "@/lib/outings/permissions";
import { DATE_RE, datesInRange } from "@/lib/time";

const Body = z.object({ date: z.string().regex(DATE_RE) });

export const POST = route<{ id: string }>(async (req, { params }) => {
  const user = await requireUser();
  const { id } = await params;
  const { outing, membership } = await requireOutingMember(id, user.id);
  requireOrganiser(outing, user.id, membership.role);
  requireStatus(outing, "collecting");
  const { date } = await parseBody(req, Body);
  if (!datesInRange(outing.rangeStart, outing.rangeEnd).includes(date)) {
    throw new HttpError(400, "That date isn't in this outing's range.");
  }
  await prisma.outing.update({ where: { id }, data: { date } });
  return ok({ ok: true });
});
```

- [ ] **Step 8: Run** — `npx vitest run tests/api/outings-collect.test.ts` → PASS.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: outing creation, availability, date confirmation, detail view"
```

---
### Task 19: Web push sending and subscription API

**Files:**
- Create: `src/lib/push.ts`, `src/lib/outings/notify.ts`, `src/app/api/push/subscribe/route.ts`
- Test: `tests/api/push.test.ts`

**Interfaces:**
- Produces:
  - `interface PushPayload { title: string; body: string; url: string }`
  - `pushConfigured(): boolean`
  - `sendPush(userIds: string[], payload: PushPayload): Promise<number>` — returns count sent; deletes subscriptions that answer 404/410; never throws.
  - `notifyGroup(groupId: string, exceptUserId: string | null, payload: PushPayload): Promise<void>` — never throws.
  - `POST /api/push/subscribe {endpoint, keys: {p256dh, auth}}` → `{ok}` (upsert by endpoint, owned by me)
  - `DELETE /api/push/subscribe {endpoint}` → `{ok}` (only my own)

- [ ] **Step 1: Failing test**

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import webpush from "web-push";
import { resetDb } from "../helpers/db";
import { asUser, call } from "../helpers/http";
import { makeCompleteUser, makeGroup } from "../helpers/factories";
import { POST as subscribe, DELETE as unsubscribe } from "@/app/api/push/subscribe/route";
import { sendPush } from "@/lib/push";
import { notifyGroup } from "@/lib/outings/notify";
import { prisma } from "@/lib/db";

const sub = { endpoint: "https://push.example/abc", keys: { p256dh: "p", auth: "a" } };

describe("push", () => {
  beforeEach(async () => {
    await resetDb();
    vi.stubEnv("VAPID_PUBLIC_KEY", "pub");
    vi.stubEnv("VAPID_PRIVATE_KEY", "priv");
    vi.mocked(webpush.sendNotification).mockClear();
  });
  afterEach(() => vi.unstubAllEnvs());

  it("stores a subscription for the signed-in user", async () => {
    const u = await makeCompleteUser();
    await asUser(u.id);
    expect((await call(subscribe, { method: "POST", body: sub })).status).toBe(200);
    expect(await prisma.pushSubscription.count({ where: { userId: u.id } })).toBe(1);
    expect((await call(unsubscribe, { method: "DELETE", body: { endpoint: sub.endpoint } })).status).toBe(200);
    expect(await prisma.pushSubscription.count()).toBe(0);
  });

  it("sends to group members except the actor", async () => {
    const a = await makeCompleteUser();
    const b = await makeCompleteUser();
    const g = await makeGroup(a.id, [b.id]);
    await prisma.pushSubscription.create({ data: { userId: a.id, endpoint: "https://p/a", keys: sub.keys } });
    await prisma.pushSubscription.create({ data: { userId: b.id, endpoint: "https://p/b", keys: sub.keys } });
    await notifyGroup(g.id, a.id, { title: "t", body: "b", url: "/x" });
    expect(webpush.sendNotification).toHaveBeenCalledTimes(1);
    expect(vi.mocked(webpush.sendNotification).mock.calls[0][0]).toMatchObject({ endpoint: "https://p/b" });
  });

  it("drops gone subscriptions", async () => {
    const a = await makeCompleteUser();
    await prisma.pushSubscription.create({ data: { userId: a.id, endpoint: "https://p/gone", keys: sub.keys } });
    vi.mocked(webpush.sendNotification).mockRejectedValueOnce({ statusCode: 410 });
    expect(await sendPush([a.id], { title: "t", body: "b", url: "/" })).toBe(0);
    expect(await prisma.pushSubscription.count()).toBe(0);
  });

  it("is a no-op without VAPID keys", async () => {
    vi.stubEnv("VAPID_PRIVATE_KEY", "");
    const a = await makeCompleteUser();
    await prisma.pushSubscription.create({ data: { userId: a.id, endpoint: "https://p/a", keys: sub.keys } });
    expect(await sendPush([a.id], { title: "t", body: "b", url: "/" })).toBe(0);
    expect(webpush.sendNotification).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run** — FAIL.

- [ ] **Step 3: Implement**

```ts
// src/lib/push.ts
import webpush from "web-push";
import { prisma } from "@/lib/db";

export interface PushPayload { title: string; body: string; url: string }

export function pushConfigured(): boolean {
  return Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

export async function sendPush(userIds: string[], payload: PushPayload): Promise<number> {
  if (!pushConfigured() || userIds.length === 0) return 0;
  try {
    webpush.setVapidDetails(
      process.env.VAPID_CONTACT ?? "mailto:admin@example.com",
      process.env.VAPID_PUBLIC_KEY!,
      process.env.VAPID_PRIVATE_KEY!
    );
    const subs = await prisma.pushSubscription.findMany({ where: { userId: { in: userIds } } });
    let sent = 0;
    await Promise.all(
      subs.map(async (s) => {
        try {
          await webpush.sendNotification(
            { endpoint: s.endpoint, keys: s.keys as { p256dh: string; auth: string } },
            JSON.stringify(payload)
          );
          sent++;
        } catch (err) {
          const code = (err as { statusCode?: number }).statusCode;
          if (code === 404 || code === 410) {
            await prisma.pushSubscription.delete({ where: { id: s.id } }).catch(() => {});
          } else {
            console.warn("[push] send failed", code);
          }
        }
      })
    );
    return sent;
  } catch (err) {
    console.error("[push] failed", err);
    return 0;
  }
}
```

```ts
// src/lib/outings/notify.ts
import { prisma } from "@/lib/db";
import { sendPush, type PushPayload } from "@/lib/push";

export async function notifyGroup(groupId: string, exceptUserId: string | null, payload: PushPayload) {
  try {
    const members = await prisma.membership.findMany({ where: { groupId }, select: { userId: true } });
    await sendPush(members.map((m) => m.userId).filter((id) => id !== exceptUserId), payload);
  } catch (err) {
    console.error("[notify] failed", err);
  }
}
```

```ts
// src/app/api/push/subscribe/route.ts
import { z } from "zod";
import { prisma } from "@/lib/db";
import { route, ok, parseBody, requireUser } from "@/lib/http";

const Sub = z.object({
  endpoint: z.string().url(),
  keys: z.object({ p256dh: z.string().min(1), auth: z.string().min(1) }),
});

export const POST = route(async (req) => {
  const user = await requireUser();
  const s = await parseBody(req, Sub);
  await prisma.pushSubscription.upsert({
    where: { endpoint: s.endpoint },
    create: { userId: user.id, endpoint: s.endpoint, keys: s.keys },
    update: { userId: user.id, keys: s.keys },
  });
  return ok({ ok: true });
});

export const DELETE = route(async (req) => {
  const user = await requireUser();
  const { endpoint } = await parseBody(req, z.object({ endpoint: z.string() }));
  await prisma.pushSubscription.deleteMany({ where: { endpoint, userId: user.id } });
  return ok({ ok: true });
});
```

- [ ] **Step 4: Run** → PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: web push sending and subscriptions"
```

---

### Task 20: Generating itinerary options

**Files:**
- Create: `src/lib/outings/run.ts`, `src/lib/outings/showtimes.ts`, `src/app/api/outings/[id]/generate/route.ts`
- Test: `tests/unit/showtimes.test.ts`, `tests/api/outings-generate.test.ts`

**Interfaces:**
- Consumes: `generateOption`, `recalculateOption`, `NoVenuesError`, `loadAttendees`, `getProviders`, `notifyGroup`, `runInBackground`.
- Produces:
  - `applyShowtimes(stops: Stop[], overrides: { stopIndex: number; startsAt: Date }[]): Stop[]`
  - `runGeneration(outingId: string, providers?: Providers): Promise<void>`
  - `runRecalc(optionId: string, providers?: Providers): Promise<void>` — uses `going` attendees; no-op when none
  - `POST /api/outings/[id]/generate` → `202 {optionIds: string[]}`; 400 no date / < 2 attendees; 403 not organiser; 409 while any option is `generating` or status not `collecting|voting`.

- [ ] **Step 1: Failing showtimes unit test**

```ts
import { describe, it, expect } from "vitest";
import { applyShowtimes } from "@/lib/outings/showtimes";
import type { Stop } from "@/lib/engine/types";

const stop: Stop = {
  slot: { startTime: "17:30", durationMin: 150, kind: "cinema", vibe: "" },
  venue: { id: "c", name: "PVR", lat: 0, lng: 0, kind: "cinema", rating: null, priceLevel: null, opening: null, address: null, source: "fake" },
  film: null, startsAt: "2026-10-18T12:00:00.000Z", endsAt: "2026-10-18T14:30:00.000Z",
};

describe("applyShowtimes", () => {
  it("moves the stop to the entered show time", () => {
    const [s] = applyShowtimes([stop], [{ stopIndex: 0, startsAt: new Date("2026-10-18T13:15:00.000Z") }]);
    expect(s.startsAt).toBe("2026-10-18T13:15:00.000Z");
    expect(s.endsAt).toBe("2026-10-18T15:45:00.000Z");
    expect(s.slot.startTime).toBe("18:45");
  });
  it("ignores overrides for missing stops", () => {
    expect(applyShowtimes([stop], [{ stopIndex: 5, startsAt: new Date() }])).toEqual([stop]);
  });
});
```

- [ ] **Step 2: Implement `src/lib/outings/showtimes.ts`**

```ts
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
```

- [ ] **Step 3: Implement `src/lib/outings/run.ts`**

```ts
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getProviders, type Providers } from "@/lib/providers";
import { generateOption, NoVenuesError, recalculateOption } from "@/lib/engine/generate";
import type { Stop, Theme } from "@/lib/engine/types";
import { loadAttendees } from "./attendees";
import { applyShowtimes } from "./showtimes";
import { notifyGroup } from "./notify";

const j = (v: unknown) => v as Prisma.InputJsonValue;

export async function runGeneration(outingId: string, providers: Providers = getProviders()): Promise<void> {
  const outing = await prisma.outing.findUniqueOrThrow({ where: { id: outingId } });
  const attendees = await loadAttendees(outing, "free");
  const options = await prisma.itineraryOption.findMany({ where: { outingId, status: "generating" } });

  await Promise.all(
    options.map(async (opt) => {
      try {
        const r = await generateOption({
          providers, attendees, date: outing.date!, theme: opt.theme as Theme,
          onProgress: async (step) => {
            await prisma.itineraryOption.update({ where: { id: opt.id }, data: { progress: step } });
          },
        });
        await prisma.itineraryOption.update({
          where: { id: opt.id },
          data: {
            status: "ready", progress: null, error: null,
            stops: j(r.stops), routes: j(r.routes), costs: j(r.costs), homeByReport: j(r.homeByReport),
            narrative: r.narrative ? j(r.narrative) : Prisma.JsonNull,
            approximateTransit: r.approximateTransit,
          },
        });
      } catch (err) {
        console.error("[generate] option failed", opt.id, err);
        await prisma.itineraryOption
          .update({
            where: { id: opt.id },
            data: {
              status: "failed", progress: null,
              error: err instanceof NoVenuesError
                ? "We couldn't find places for this plan near your group."
                : "The planner couldn't finish this option. Try again.",
            },
          })
          .catch(() => {}); // option may have been replaced by a newer generate
      }
    })
  );

  await notifyGroup(outing.groupId, null, {
    title: outing.title, body: "Plan options are ready — vote now.", url: `/outings/${outing.id}`,
  });
}

export async function runRecalc(optionId: string, providers: Providers = getProviders()): Promise<void> {
  const opt = await prisma.itineraryOption.findUnique({
    where: { id: optionId },
    include: { outing: true, showtimes: true },
  });
  if (!opt || opt.status !== "ready" || !opt.outing.date) return;
  const attendees = await loadAttendees(opt.outing, "going");
  if (attendees.length === 0) return;

  const stops = applyShowtimes(opt.stops as unknown as Stop[], opt.showtimes);
  const ev = await recalculateOption({ providers, stops, attendees, date: opt.outing.date, theme: opt.theme as Theme });
  await prisma.itineraryOption.update({
    where: { id: optionId },
    data: {
      stops: j(stops), routes: j(ev.routes), costs: j(ev.costs), homeByReport: j(ev.homeByReport),
      narrative: ev.narrative ? j(ev.narrative) : Prisma.JsonNull,
      approximateTransit: ev.approximateTransit,
    },
  });
}
```

- [ ] **Step 4: Failing API test (includes Review Focus #3)**

`tests/api/outings-generate.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { resetDb } from "../helpers/db";
import { asUser, call } from "../helpers/http";
import { makeCompleteUser } from "../helpers/factories";
import { outingFixture } from "../helpers/outings";
import { POST as generate } from "@/app/api/outings/[id]/generate/route";
import { GET as getOuting } from "@/app/api/outings/[id]/route";
import { prisma } from "@/lib/db";

describe("generate options", () => {
  beforeEach(resetDb);

  it("needs a confirmed date", async () => {
    const { outing, admin } = await outingFixture();
    await asUser(admin.id);
    expect((await call(generate, { method: "POST", params: { id: outing.id } })).status).toBe(400);
  });

  it("needs at least 2 complete free attendees", async () => {
    const { outing, admin, b, c } = await outingFixture({ confirm: true });
    await prisma.availability.updateMany({ where: { userId: { in: [b.id, c.id] } }, data: { free: false } });
    await asUser(admin.id);
    const res = await call(generate, { method: "POST", params: { id: outing.id } });
    expect(res.status).toBe(400);
    expect(res.json.error).toMatch(/at least 2/i);
  });

  it("only organiser/admin can generate", async () => {
    const { outing, b } = await outingFixture({ confirm: true });
    await asUser(b.id);
    expect((await call(generate, { method: "POST", params: { id: outing.id } })).status).toBe(403);
  });

  it("generates 3 ready options and moves to voting", async () => {
    const { outing, admin } = await outingFixture({ confirm: true });
    await asUser(admin.id);
    const res = await call(generate, { method: "POST", params: { id: outing.id } });
    expect(res.status).toBe(202);
    expect(res.json.optionIds).toHaveLength(3);
    const opts = await prisma.itineraryOption.findMany({ where: { outingId: outing.id } });
    expect(opts.map((o) => o.status)).toEqual(["ready", "ready", "ready"]);
    expect((await prisma.outing.findUniqueOrThrow({ where: { id: outing.id } })).status).toBe("voting");
  });

  it("returns 409 while options are still generating (double tap)", async () => {
    const { outing, admin } = await outingFixture({ confirm: true });
    await prisma.itineraryOption.create({ data: { outingId: outing.id, theme: "relaxed", status: "generating" } });
    await asUser(admin.id);
    expect((await call(generate, { method: "POST", params: { id: outing.id } })).status).toBe(409);
    expect(await prisma.itineraryOption.count({ where: { outingId: outing.id } })).toBe(1);
  });

  it("regenerating replaces previous options and votes", async () => {
    const { outing, admin } = await outingFixture({ confirm: true });
    await asUser(admin.id);
    await call(generate, { method: "POST", params: { id: outing.id } });
    const first = await prisma.itineraryOption.findFirstOrThrow({ where: { outingId: outing.id } });
    await prisma.vote.create({ data: { outingId: outing.id, userId: admin.id, optionId: first.id } });
    await call(generate, { method: "POST", params: { id: outing.id } });
    expect(await prisma.itineraryOption.count({ where: { outingId: outing.id } })).toBe(3);
    expect(await prisma.vote.count({ where: { outingId: outing.id } })).toBe(0);
  });

  it("other members never see someone else's home route geometry or exact home", async () => {
    const { outing, admin, b } = await outingFixture({ confirm: true });
    await asUser(admin.id);
    await call(generate, { method: "POST", params: { id: outing.id } });
    await asUser(b.id);
    const view = (await call(getOuting, { params: { id: outing.id } })).json;
    const s = JSON.stringify(view);
    expect(s).not.toContain("12.90123");
    expect(s).not.toContain("77.60123");
    const adminHomeLegs = view.options[0].routes.filter(
      (l: any) => l.attendeeId === admin.id && (l.from === "home" || l.to === "home")
    );
    expect(adminHomeLegs.length).toBe(2);
    expect(adminHomeLegs.every((l: any) => l.route.geometry === null)).toBe(true);
    const myHomeLeg = view.options[0].routes.find((l: any) => l.attendeeId === b.id && l.from === "home");
    expect(myHomeLeg.route.geometry).not.toBeNull();
  });

  it("outsiders get 404", async () => {
    const { outing } = await outingFixture({ confirm: true });
    const x = await makeCompleteUser();
    await asUser(x.id);
    expect((await call(generate, { method: "POST", params: { id: outing.id } })).status).toBe(404);
  });
});
```

- [ ] **Step 5: Run** — FAIL.

- [ ] **Step 6: Implement `src/app/api/outings/[id]/generate/route.ts`**

```ts
import { prisma } from "@/lib/db";
import { route, ok, requireUser, requireOutingMember, HttpError } from "@/lib/http";
import { requireOrganiser, requireStatus } from "@/lib/outings/permissions";
import { loadAttendees } from "@/lib/outings/attendees";
import { runGeneration } from "@/lib/outings/run";
import { runInBackground } from "@/lib/background";
import { THEMES } from "@/lib/engine/types";

export const POST = route<{ id: string }>(async (_req, { params }) => {
  const user = await requireUser();
  const { id } = await params;
  const { outing, membership } = await requireOutingMember(id, user.id);
  requireOrganiser(outing, user.id, membership.role);
  requireStatus(outing, "collecting", "voting");
  if (!outing.date) throw new HttpError(400, "Confirm a date first.");

  const busy = await prisma.itineraryOption.count({ where: { outingId: id, status: "generating" } });
  if (busy > 0) throw new HttpError(409, "Options are already being generated.");

  const attendees = await loadAttendees(outing, "free");
  if (attendees.length < 2) {
    throw new HttpError(400, "At least 2 people with complete profiles need to be free on that date.");
  }

  const optionIds = await prisma.$transaction(async (tx) => {
    await tx.itineraryOption.deleteMany({ where: { outingId: id } }); // cascades votes
    const created = await Promise.all(
      THEMES.map((theme) => tx.itineraryOption.create({ data: { outingId: id, theme, status: "generating" } }))
    );
    await tx.outing.update({ where: { id }, data: { status: "voting" } });
    return created.map((o) => o.id);
  });

  await runInBackground(() => runGeneration(id));
  return ok({ optionIds }, 202);
});
```

Note: the 409 check and the transaction are not atomic. Two simultaneous requests could both pass the count. Guard by also making the transaction re-check: inside the transaction, before deleting, run `const again = await tx.itineraryOption.count({ where: { outingId: id, status: "generating" } }); if (again > 0) throw new HttpError(409, "Options are already being generated.");` and run the transaction with `{ isolationLevel: "Serializable" }`. Add both.

- [ ] **Step 7: Run** — `npx vitest run tests/unit/showtimes.test.ts tests/api/outings-generate.test.ts` → PASS.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: generate itinerary options in the background"
```

---

### Task 21: Voting, RSVP, lock, cancel, showtime override, recalculation

**Files:**
- Create: `src/app/api/outings/[id]/vote/route.ts`, `src/app/api/outings/[id]/rsvp/route.ts`, `src/app/api/outings/[id]/lock/route.ts`, `src/app/api/outings/[id]/cancel/route.ts`, `src/app/api/outings/[id]/showtime/route.ts`
- Create: `tests/helpers/voting.ts`
- Test: `tests/api/outings-vote.test.ts`

**Interfaces:**
- `PUT /api/outings/[id]/vote {optionId}` → `{ok}`; 400 option not ready / not this outing's; 409 not voting.
- `PUT /api/outings/[id]/rsvp {status: "going"|"maybe"|"no"|"cancelled", reason?: string}` → `{ok}`; `cancelled` only when locked and currently going (else 400). In `locked`, a change to/from `going` triggers `runRecalc(lockedOptionId)`. `cancelled` notifies the group.
- `POST /api/outings/[id]/lock {optionId?}` → `{ok, optionId}`; 409 `{error: "It's a tie — pick one.", tiedOptionIds}`; 400 fewer than 2 going.
- `POST /api/outings/[id]/cancel {reason?}` → `{ok}`; 409 when already finished.
- `POST /api/outings/[id]/showtime {stopIndex, time: "HH:MM"}` → `{ok}`; 400 when the stop isn't a cinema; 403 unless RSVP going or organiser/admin.

- [ ] **Step 1: Helper `tests/helpers/voting.ts`**

```ts
import { prisma } from "@/lib/db";
import { asUser, call } from "./http";
import { outingFixture } from "./outings";
import { POST as generate } from "@/app/api/outings/[id]/generate/route";

export async function votingFixture() {
  const f = await outingFixture({ confirm: true });
  await asUser(f.admin.id);
  await call(generate, { method: "POST", params: { id: f.outing.id } });
  const options = await prisma.itineraryOption.findMany({ where: { outingId: f.outing.id }, orderBy: { createdAt: "asc" } });
  return { ...f, options };
}
```

- [ ] **Step 2: Failing test (includes Review Focus #4 recalculation half)**

`tests/api/outings-vote.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { resetDb } from "../helpers/db";
import { asUser, call } from "../helpers/http";
import { votingFixture } from "../helpers/voting";
import { PUT as vote } from "@/app/api/outings/[id]/vote/route";
import { PUT as rsvp } from "@/app/api/outings/[id]/rsvp/route";
import { POST as lock } from "@/app/api/outings/[id]/lock/route";
import { POST as cancel } from "@/app/api/outings/[id]/cancel/route";
import { POST as showtime } from "@/app/api/outings/[id]/showtime/route";
import { prisma } from "@/lib/db";
import { runRecalc } from "@/lib/outings/run";
import type { Leg, Stop } from "@/lib/engine/types";

async function goingAll(f: Awaited<ReturnType<typeof votingFixture>>) {
  for (const u of [f.admin, f.b, f.c]) {
    await asUser(u.id);
    await call(rsvp, { method: "PUT", params: { id: f.outing.id }, body: { status: "going" } });
  }
}

describe("voting and locking", () => {
  beforeEach(resetDb);

  it("one vote per member, changeable", async () => {
    const f = await votingFixture();
    await asUser(f.b.id);
    await call(vote, { method: "PUT", params: { id: f.outing.id }, body: { optionId: f.options[0].id } });
    await call(vote, { method: "PUT", params: { id: f.outing.id }, body: { optionId: f.options[1].id } });
    const votes = await prisma.vote.findMany({ where: { outingId: f.outing.id } });
    expect(votes.map((v) => v.optionId)).toEqual([f.options[1].id]);
  });

  it("rejects votes for another outing's option", async () => {
    const f = await votingFixture();
    const other = await votingFixture();
    await asUser(f.b.id);
    expect((await call(vote, { method: "PUT", params: { id: f.outing.id }, body: { optionId: other.options[0].id } })).status).toBe(400);
  });

  it("locks the top-voted option; ties need a pick", async () => {
    const f = await votingFixture();
    await goingAll(f);
    await asUser(f.b.id);
    await call(vote, { method: "PUT", params: { id: f.outing.id }, body: { optionId: f.options[0].id } });
    await asUser(f.c.id);
    await call(vote, { method: "PUT", params: { id: f.outing.id }, body: { optionId: f.options[1].id } });

    await asUser(f.admin.id);
    const tie = await call(lock, { method: "POST", params: { id: f.outing.id }, body: {} });
    expect(tie.status).toBe(409);
    expect(tie.json.tiedOptionIds.sort()).toEqual([f.options[0].id, f.options[1].id].sort());

    const res = await call(lock, { method: "POST", params: { id: f.outing.id }, body: { optionId: f.options[1].id } });
    expect(res.status).toBe(200);
    const o = await prisma.outing.findUniqueOrThrow({ where: { id: f.outing.id } });
    expect(o.status).toBe("locked");
    expect(o.lockedOptionId).toBe(f.options[1].id);
  });

  it("needs 2 people going to lock", async () => {
    const f = await votingFixture();
    await asUser(f.admin.id);
    await call(rsvp, { method: "PUT", params: { id: f.outing.id }, body: { status: "going" } });
    const res = await call(lock, { method: "POST", params: { id: f.outing.id }, body: { optionId: f.options[0].id } });
    expect(res.status).toBe(400);
  });

  it("cancelling after lock recalculates without that person", async () => {
    const f = await votingFixture();
    await goingAll(f);
    await asUser(f.admin.id);
    await call(lock, { method: "POST", params: { id: f.outing.id }, body: { optionId: f.options[0].id } });

    await asUser(f.c.id);
    expect((await call(rsvp, { method: "PUT", params: { id: f.outing.id }, body: { status: "cancelled", reason: "Sick" } })).status).toBe(200);
    const r = await prisma.rsvp.findFirstOrThrow({ where: { userId: f.c.id } });
    expect(r.cancelledAt).not.toBeNull();
    const opt = await prisma.itineraryOption.findUniqueOrThrow({ where: { id: f.options[0].id } });
    const ids = new Set((opt.routes as unknown as Leg[]).map((l) => l.attendeeId));
    expect(ids.has(f.c.id)).toBe(false);
    expect(ids.size).toBe(2);
  });

  it("cannot 'cancel' before saying going", async () => {
    const f = await votingFixture();
    await asUser(f.b.id);
    expect((await call(rsvp, { method: "PUT", params: { id: f.outing.id }, body: { status: "cancelled" } })).status).toBe(400);
  });

  it("a member removed from the group drops out on the next recalculation", async () => {
    const f = await votingFixture();
    await goingAll(f);
    await asUser(f.admin.id);
    await call(lock, { method: "POST", params: { id: f.outing.id }, body: { optionId: f.options[0].id } });
    await prisma.membership.deleteMany({ where: { groupId: f.group.id, userId: f.b.id } });
    await runRecalc(f.options[0].id);
    const opt = await prisma.itineraryOption.findUniqueOrThrow({ where: { id: f.options[0].id } });
    expect((opt.routes as unknown as Leg[]).some((l) => l.attendeeId === f.b.id)).toBe(false);
  });

  it("organiser can cancel the outing with a reason", async () => {
    const f = await votingFixture();
    await asUser(f.b.id);
    expect((await call(cancel, { method: "POST", params: { id: f.outing.id }, body: {} })).status).toBe(403);
    await asUser(f.admin.id);
    expect((await call(cancel, { method: "POST", params: { id: f.outing.id }, body: { reason: "Rain" } })).status).toBe(200);
    const o = await prisma.outing.findUniqueOrThrow({ where: { id: f.outing.id } });
    expect([o.status, o.cancelReason]).toEqual(["cancelled", "Rain"]);
    expect((await call(cancel, { method: "POST", params: { id: f.outing.id }, body: {} })).status).toBe(409);
  });

  it("showtime override moves a cinema stop and recalculates", async () => {
    const f = await votingFixture();
    await goingAll(f);
    await asUser(f.admin.id);
    const relaxed = f.options.find((o) => o.theme === "relaxed")!;
    await call(lock, { method: "POST", params: { id: f.outing.id }, body: { optionId: relaxed.id } });
    const stops = (await prisma.itineraryOption.findUniqueOrThrow({ where: { id: relaxed.id } })).stops as unknown as Stop[];
    const cinemaIdx = stops.findIndex((s) => s.slot.kind === "cinema");
    expect(cinemaIdx).toBeGreaterThanOrEqual(0);

    await asUser(f.b.id);
    expect((await call(showtime, { method: "POST", params: { id: f.outing.id }, body: { stopIndex: 0, time: "11:00" } })).status).toBe(400);
    expect((await call(showtime, { method: "POST", params: { id: f.outing.id }, body: { stopIndex: cinemaIdx, time: "18:15" } })).status).toBe(200);
    const after = (await prisma.itineraryOption.findUniqueOrThrow({ where: { id: relaxed.id } })).stops as unknown as Stop[];
    expect(after[cinemaIdx].slot.startTime).toBe("18:15");
  });
});
```

- [ ] **Step 3: Run** — FAIL.

- [ ] **Step 4: Implement routes**

```ts
// src/app/api/outings/[id]/vote/route.ts
import { z } from "zod";
import { prisma } from "@/lib/db";
import { route, ok, parseBody, requireUser, requireOutingMember, HttpError } from "@/lib/http";
import { requireStatus } from "@/lib/outings/permissions";

export const PUT = route<{ id: string }>(async (req, { params }) => {
  const user = await requireUser();
  const { id } = await params;
  const { outing } = await requireOutingMember(id, user.id);
  requireStatus(outing, "voting");
  const { optionId } = await parseBody(req, z.object({ optionId: z.string() }));
  const option = await prisma.itineraryOption.findUnique({ where: { id: optionId } });
  if (!option || option.outingId !== id || option.status !== "ready") throw new HttpError(400, "Pick one of this outing's options.");
  await prisma.vote.upsert({
    where: { outingId_userId: { outingId: id, userId: user.id } },
    create: { outingId: id, userId: user.id, optionId },
    update: { optionId },
  });
  return ok({ ok: true });
});
```

```ts
// src/app/api/outings/[id]/rsvp/route.ts
import { z } from "zod";
import { prisma } from "@/lib/db";
import { route, ok, parseBody, requireUser, requireOutingMember, HttpError } from "@/lib/http";
import { requireStatus } from "@/lib/outings/permissions";
import { runRecalc } from "@/lib/outings/run";
import { notifyGroup } from "@/lib/outings/notify";
import { runInBackground } from "@/lib/background";

const Body = z.object({
  status: z.enum(["going", "maybe", "no", "cancelled"]),
  reason: z.string().trim().max(200).optional(),
});

export const PUT = route<{ id: string }>(async (req, { params }) => {
  const user = await requireUser();
  const { id } = await params;
  const { outing } = await requireOutingMember(id, user.id);
  requireStatus(outing, "voting", "locked");
  const b = await parseBody(req, Body);

  const prev = await prisma.rsvp.findUnique({ where: { outingId_userId: { outingId: id, userId: user.id } } });
  if (b.status === "cancelled" && !(outing.status === "locked" && prev?.status === "going")) {
    throw new HttpError(400, "You can only cancel after the plan is locked and you said you're going.");
  }

  const cancelling = b.status === "cancelled";
  await prisma.rsvp.upsert({
    where: { outingId_userId: { outingId: id, userId: user.id } },
    create: { outingId: id, userId: user.id, status: b.status },
    update: {
      status: b.status,
      cancelledAt: cancelling ? new Date() : null,
      cancelReason: cancelling ? b.reason ?? null : null,
    },
  });

  const goingChanged = (prev?.status === "going") !== (b.status === "going");
  if (outing.status === "locked" && goingChanged && outing.lockedOptionId) {
    const optionId = outing.lockedOptionId;
    await runInBackground(async () => {
      await runRecalc(optionId);
      if (cancelling) {
        await notifyGroup(outing.groupId, user.id, {
          title: outing.title,
          body: `${user.name ?? "Someone"} can't make it. The plan has been updated.`,
          url: `/outings/${id}`,
        });
      }
    });
  }
  return ok({ ok: true });
});
```

```ts
// src/app/api/outings/[id]/lock/route.ts
import { z } from "zod";
import { prisma } from "@/lib/db";
import { route, ok, parseBody, requireUser, requireOutingMember, HttpError } from "@/lib/http";
import { requireOrganiser, requireStatus } from "@/lib/outings/permissions";
import { runRecalc } from "@/lib/outings/run";
import { notifyGroup } from "@/lib/outings/notify";
import { runInBackground } from "@/lib/background";

export const POST = route<{ id: string }>(async (req, { params }) => {
  const user = await requireUser();
  const { id } = await params;
  const { outing, membership } = await requireOutingMember(id, user.id);
  requireOrganiser(outing, user.id, membership.role);
  requireStatus(outing, "voting");
  const { optionId } = await parseBody(req, z.object({ optionId: z.string().optional() }));

  const ready = await prisma.itineraryOption.findMany({
    where: { outingId: id, status: "ready" },
    include: { _count: { select: { votes: true } } },
  });
  if (ready.length === 0) throw new HttpError(400, "There are no ready options to lock.");

  let chosen: string;
  if (optionId) {
    if (!ready.some((o) => o.id === optionId)) throw new HttpError(400, "Pick one of this outing's options.");
    chosen = optionId;
  } else {
    const top = Math.max(...ready.map((o) => o._count.votes));
    const tied = ready.filter((o) => o._count.votes === top);
    if (tied.length > 1) return ok({ error: "It's a tie — pick one.", tiedOptionIds: tied.map((o) => o.id) }, 409);
    chosen = tied[0].id;
  }

  const going = await prisma.rsvp.count({
    where: { outingId: id, status: "going", user: { memberships: { some: { groupId: outing.groupId } } } },
  });
  if (going < 2) throw new HttpError(400, "At least 2 people need to say they're going.");

  await prisma.outing.update({ where: { id }, data: { status: "locked", lockedOptionId: chosen } });
  await runInBackground(async () => {
    await runRecalc(chosen);
    await notifyGroup(outing.groupId, user.id, { title: outing.title, body: "The plan is locked in!", url: `/outings/${id}` });
  });
  return ok({ ok: true, optionId: chosen });
});
```

```ts
// src/app/api/outings/[id]/cancel/route.ts
import { z } from "zod";
import { prisma } from "@/lib/db";
import { route, ok, parseBody, requireUser, requireOutingMember } from "@/lib/http";
import { requireOrganiser, requireStatus } from "@/lib/outings/permissions";
import { notifyGroup } from "@/lib/outings/notify";
import { runInBackground } from "@/lib/background";

export const POST = route<{ id: string }>(async (req, { params }) => {
  const user = await requireUser();
  const { id } = await params;
  const { outing, membership } = await requireOutingMember(id, user.id);
  requireOrganiser(outing, user.id, membership.role);
  requireStatus(outing, "collecting", "voting", "locked");
  const { reason } = await parseBody(req, z.object({ reason: z.string().trim().max(200).optional() }));
  await prisma.outing.update({ where: { id }, data: { status: "cancelled", cancelReason: reason ?? null } });
  await runInBackground(() =>
    notifyGroup(outing.groupId, user.id, {
      title: outing.title, body: `Cancelled${reason ? `: ${reason}` : ""}`, url: `/outings/${id}`,
    })
  );
  return ok({ ok: true });
});
```

```ts
// src/app/api/outings/[id]/showtime/route.ts
import { z } from "zod";
import { prisma } from "@/lib/db";
import { route, ok, parseBody, requireUser, requireOutingMember, HttpError } from "@/lib/http";
import { requireStatus } from "@/lib/outings/permissions";
import { runRecalc } from "@/lib/outings/run";
import { runInBackground } from "@/lib/background";
import { HHMM_RE, atLocal } from "@/lib/time";
import type { Stop } from "@/lib/engine/types";

const Body = z.object({ stopIndex: z.number().int().min(0), time: z.string().regex(HHMM_RE, "Use HH:MM") });

export const POST = route<{ id: string }>(async (req, { params }) => {
  const user = await requireUser();
  const { id } = await params;
  const { outing, membership } = await requireOutingMember(id, user.id);
  requireStatus(outing, "locked");
  const b = await parseBody(req, Body);

  const rsvp = await prisma.rsvp.findUnique({ where: { outingId_userId: { outingId: id, userId: user.id } } });
  const manager = outing.createdById === user.id || membership.role === "admin";
  if (!manager && rsvp?.status !== "going") throw new HttpError(403, "Only people going can set the show time.");

  const option = await prisma.itineraryOption.findUniqueOrThrow({ where: { id: outing.lockedOptionId! } });
  const stops = option.stops as unknown as Stop[];
  if (stops[b.stopIndex]?.slot.kind !== "cinema") throw new HttpError(400, "That stop isn't a movie.");

  await prisma.showtimeOverride.upsert({
    where: { optionId_stopIndex: { optionId: option.id, stopIndex: b.stopIndex } },
    create: { optionId: option.id, stopIndex: b.stopIndex, startsAt: atLocal(outing.date!, b.time), enteredById: user.id },
    update: { startsAt: atLocal(outing.date!, b.time), enteredById: user.id },
  });
  await runInBackground(() => runRecalc(option.id));
  return ok({ ok: true });
});
```

- [ ] **Step 5: Run** — `npx vitest run tests/api/outings-vote.test.ts` → PASS.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: voting, RSVPs, locking, cancellation, showtime overrides"
```

---

### Task 22: Check-ins, outcome evaluation, daily job

**Files:**
- Create: `src/lib/outings/outcomes.ts`, `src/app/api/outings/[id]/checkin/route.ts`, `scripts/evaluate-outcomes.ts`
- Modify: `ecosystem.config.js`
- Test: `tests/api/outcomes.test.ts`

**Interfaces:**
- Produces:
  - `evaluateOuting(outingId: string, now?: Date): Promise<"completed" | "failed" | null>` — only for `locked` outings; writes the new status.
  - `runDailyOutcomes(now?: Date): Promise<{ decided: number; reminded: number }>` — evaluates every locked outing whose date has passed and sends one "Did you go?" push to going members without a check-in when the outing date was yesterday.
  - `POST /api/outings/[id]/checkin {attended: boolean}` → `{ok, status}`; 409 before check-in opens; 403 unless RSVP going.

- [ ] **Step 1: Failing test**

```ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import webpush from "web-push";
import { resetDb } from "../helpers/db";
import { asUser, call } from "../helpers/http";
import { outingFixture, dayFromNow } from "../helpers/outings";
import { POST as checkin } from "@/app/api/outings/[id]/checkin/route";
import { evaluateOuting, runDailyOutcomes } from "@/lib/outings/outcomes";
import { prisma } from "@/lib/db";

async function lockedInPast(daysAgo: number) {
  const f = await outingFixture({ confirm: true });
  await prisma.outing.update({ where: { id: f.outing.id }, data: { status: "locked", date: dayFromNow(-daysAgo) } });
  for (const u of [f.admin, f.b, f.c]) {
    await prisma.rsvp.create({ data: { outingId: f.outing.id, userId: u.id, status: "going" } });
  }
  return f;
}

describe("check-in and outcomes", () => {
  beforeEach(resetDb);

  it("refuses check-in before the day", async () => {
    const f = await outingFixture({ confirm: true });
    await prisma.outing.update({ where: { id: f.outing.id }, data: { status: "locked" } });
    await prisma.rsvp.create({ data: { outingId: f.outing.id, userId: f.b.id, status: "going" } });
    await asUser(f.b.id);
    expect((await call(checkin, { method: "POST", params: { id: f.outing.id }, body: { attended: true } })).status).toBe(409);
  });

  it("only people going can check in", async () => {
    const f = await lockedInPast(1);
    await prisma.rsvp.update({ where: { outingId_userId: { outingId: f.outing.id, userId: f.c.id } }, data: { status: "cancelled" } });
    await asUser(f.c.id);
    expect((await call(checkin, { method: "POST", params: { id: f.outing.id }, body: { attended: true } })).status).toBe(403);
  });

  it("completes once half of the going people confirm", async () => {
    const f = await lockedInPast(2);
    await asUser(f.admin.id);
    const first = await call(checkin, { method: "POST", params: { id: f.outing.id }, body: { attended: true } });
    expect(first.json.status).toBe("locked"); // 1 of 3
    await asUser(f.b.id);
    const second = await call(checkin, { method: "POST", params: { id: f.outing.id }, body: { attended: true } });
    expect(second.json.status).toBe("completed");
  });

  it("fails when everyone says no", async () => {
    const f = await lockedInPast(2);
    for (const u of [f.admin, f.b, f.c]) {
      await asUser(u.id);
      await call(checkin, { method: "POST", params: { id: f.outing.id }, body: { attended: false } });
    }
    expect((await prisma.outing.findUniqueOrThrow({ where: { id: f.outing.id } })).status).toBe("failed");
  });

  it("daily job fails silent outings after 3 days and reminds yesterday's", async () => {
    vi.stubEnv("VAPID_PUBLIC_KEY", "pub");
    vi.stubEnv("VAPID_PRIVATE_KEY", "priv");
    vi.mocked(webpush.sendNotification).mockClear();
    const old = await lockedInPast(5);
    const recent = await lockedInPast(1);
    await prisma.pushSubscription.create({ data: { userId: recent.b.id, endpoint: "https://p/b", keys: { p256dh: "p", auth: "a" } } });

    const res = await runDailyOutcomes();
    expect(res.decided).toBe(1);
    expect((await prisma.outing.findUniqueOrThrow({ where: { id: old.outing.id } })).status).toBe("failed");
    expect((await prisma.outing.findUniqueOrThrow({ where: { id: recent.outing.id } })).status).toBe("locked");
    expect(res.reminded).toBe(1);
    vi.unstubAllEnvs();
  });

  it("evaluateOuting ignores non-locked outings", async () => {
    const f = await outingFixture({ confirm: true });
    expect(await evaluateOuting(f.outing.id)).toBeNull();
  });
});
```

- [ ] **Step 2: Run** — FAIL.

- [ ] **Step 3: Implement `src/lib/outings/outcomes.ts`**

```ts
import { prisma } from "@/lib/db";
import { evaluateOutcome } from "@/lib/engine/outcome";
import { addMinutes, localDate } from "@/lib/time";
import { sendPush } from "@/lib/push";

async function goingIds(outingId: string, groupId: string) {
  const rows = await prisma.rsvp.findMany({
    where: { outingId, status: "going", user: { memberships: { some: { groupId } } } },
    select: { userId: true },
  });
  return rows.map((r) => r.userId);
}

export async function evaluateOuting(outingId: string, now = new Date()) {
  const outing = await prisma.outing.findUniqueOrThrow({ where: { id: outingId }, include: { checkIns: true } });
  if (outing.status !== "locked" || !outing.date) return null;
  const result = evaluateOutcome({
    date: outing.date,
    goingIds: await goingIds(outing.id, outing.groupId),
    checkIns: outing.checkIns,
    now,
  });
  if (result) await prisma.outing.update({ where: { id: outing.id }, data: { status: result } });
  return result;
}

export async function runDailyOutcomes(now = new Date()) {
  const today = localDate(now);
  const yesterday = localDate(addMinutes(now, -24 * 60));
  const due = await prisma.outing.findMany({ where: { status: "locked", date: { lt: today } } });

  let decided = 0;
  let reminded = 0;
  for (const o of due) {
    if (await evaluateOuting(o.id, now)) {
      decided++;
      continue;
    }
    if (o.date === yesterday) {
      const going = await goingIds(o.id, o.groupId);
      const answered = new Set(
        (await prisma.checkIn.findMany({ where: { outingId: o.id }, select: { userId: true } })).map((c) => c.userId)
      );
      reminded += await sendPush(going.filter((id) => !answered.has(id)), {
        title: o.title, body: "Did you go? Tap to check in.", url: `/outings/${o.id}`,
      });
    }
  }
  return { decided, reminded };
}
```

- [ ] **Step 4: Implement the check-in route**

```ts
// src/app/api/outings/[id]/checkin/route.ts
import { z } from "zod";
import { prisma } from "@/lib/db";
import { route, ok, parseBody, requireUser, requireOutingMember, HttpError } from "@/lib/http";
import { requireStatus } from "@/lib/outings/permissions";
import { evaluateOuting } from "@/lib/outings/outcomes";
import { checkInOpensAt } from "@/lib/engine/outcome";

export const POST = route<{ id: string }>(async (req, { params }) => {
  const user = await requireUser();
  const { id } = await params;
  const { outing } = await requireOutingMember(id, user.id);
  requireStatus(outing, "locked");
  const { attended } = await parseBody(req, z.object({ attended: z.boolean() }));

  if (!outing.date || new Date() < checkInOpensAt(outing.date)) throw new HttpError(409, "Check-in opens on the day.");
  const rsvp = await prisma.rsvp.findUnique({ where: { outingId_userId: { outingId: id, userId: user.id } } });
  if (rsvp?.status !== "going") throw new HttpError(403, "Only people who were going can check in.");

  await prisma.checkIn.upsert({
    where: { outingId_userId: { outingId: id, userId: user.id } },
    create: { outingId: id, userId: user.id, attended },
    update: { attended },
  });
  const decided = await evaluateOuting(id);
  return ok({ ok: true, status: decided ?? "locked" });
});
```

- [ ] **Step 5: Daily script and PM2**

`scripts/evaluate-outcomes.ts`:

```ts
import { prisma } from "@/lib/db";
import { runDailyOutcomes } from "@/lib/outings/outcomes";

runDailyOutcomes()
  .then((r) => console.log(`[outcomes] decided=${r.decided} reminded=${r.reminded}`))
  .catch((err) => {
    console.error("[outcomes] failed", err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
```

`tsx` resolves the `@/` alias from `tsconfig.json` paths automatically. Verify: `npx tsx scripts/evaluate-outcomes.ts` against the test DB (`DATABASE_URL=$DATABASE_URL_TEST npx tsx scripts/evaluate-outcomes.ts`) prints `decided=0 reminded=0`.

In `ecosystem.config.js`, add a second app to the `apps` array:

```js
    {
      name: "waypoint-outcomes",
      cwd: __dirname,
      script: "node_modules/.bin/tsx",
      args: "scripts/evaluate-outcomes.ts",
      cron_restart: "30 3 * * *", // 09:00 IST daily
      autorestart: false,
      env: { NODE_ENV: "production" },
    },
```

- [ ] **Step 6: Run** — `npx vitest run tests/api/outcomes.test.ts` → PASS.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: check-ins, outcome evaluation, daily outcome job"
```

---

### Task 23: Expenses and settle-up API

**Files:**
- Create: `src/app/api/outings/[id]/expenses/route.ts`, `src/app/api/outings/[id]/expenses/[expenseId]/route.ts`
- Test: `tests/api/expenses.test.ts`

**Interfaces:**
- `POST /api/outings/[id]/expenses {amount: int paise (1..10,000,000), note: string (1..80), stopIndex: int|null, splitAmong: string[] (≥1, current members)}` → `201 {expense: {id}}`; 409 unless status `locked|completed|failed`; 400 when `splitAmong` contains non-members.
- `DELETE /api/outings/[id]/expenses/[expenseId]` → `{ok}`; 403 unless payer or group admin; 404 unknown/other outing.
- Settle-up is read from `GET /api/outings/[id]` → `transfers`.

- [ ] **Step 1: Failing test**

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { resetDb } from "../helpers/db";
import { asUser, call } from "../helpers/http";
import { makeCompleteUser } from "../helpers/factories";
import { outingFixture } from "../helpers/outings";
import { POST as addExpense } from "@/app/api/outings/[id]/expenses/route";
import { DELETE as delExpense } from "@/app/api/outings/[id]/expenses/[expenseId]/route";
import { GET as getOuting } from "@/app/api/outings/[id]/route";
import { prisma } from "@/lib/db";

async function locked() {
  const f = await outingFixture({ confirm: true });
  await prisma.outing.update({ where: { id: f.outing.id }, data: { status: "locked" } });
  return f;
}

describe("expenses", () => {
  beforeEach(resetDb);

  it("logs expenses and computes who owes whom", async () => {
    const f = await locked();
    await asUser(f.admin.id);
    const res = await call(addExpense, {
      method: "POST", params: { id: f.outing.id },
      body: { amount: 90000, note: "Lunch", stopIndex: 1, splitAmong: [f.admin.id, f.b.id, f.c.id] },
    });
    expect(res.status).toBe(201);
    const view = (await call(getOuting, { params: { id: f.outing.id } })).json;
    expect(view.transfers).toEqual(
      expect.arrayContaining([
        { from: f.b.id, to: f.admin.id, amount: 30000 },
        { from: f.c.id, to: f.admin.id, amount: 30000 },
      ])
    );
  });

  it("is closed before lock", async () => {
    const f = await outingFixture({ confirm: true });
    await asUser(f.admin.id);
    const res = await call(addExpense, { method: "POST", params: { id: f.outing.id }, body: { amount: 100, note: "x", stopIndex: null, splitAmong: [f.admin.id] } });
    expect(res.status).toBe(409);
  });

  it("rejects splitting with non-members and bad amounts", async () => {
    const f = await locked();
    const stranger = await makeCompleteUser();
    await asUser(f.admin.id);
    const post = (body: object) => call(addExpense, { method: "POST", params: { id: f.outing.id }, body: { note: "x", stopIndex: null, ...body } });
    expect((await post({ amount: 100, splitAmong: [stranger.id] })).status).toBe(400);
    expect((await post({ amount: 0, splitAmong: [f.admin.id] })).status).toBe(400);
    expect((await post({ amount: 10.5, splitAmong: [f.admin.id] })).status).toBe(400);
    expect((await post({ amount: 100, splitAmong: [] })).status).toBe(400);
  });

  it("only payer or admin can delete", async () => {
    const f = await locked();
    await asUser(f.b.id);
    const { json } = await call(addExpense, { method: "POST", params: { id: f.outing.id }, body: { amount: 100, note: "x", stopIndex: null, splitAmong: [f.b.id, f.c.id] } });
    await asUser(f.c.id);
    expect((await call(delExpense, { method: "DELETE", params: { id: f.outing.id, expenseId: json.expense.id } })).status).toBe(403);
    await asUser(f.admin.id);
    expect((await call(delExpense, { method: "DELETE", params: { id: f.outing.id, expenseId: json.expense.id } })).status).toBe(200);
    expect(await prisma.expense.count()).toBe(0);
  });
});
```

- [ ] **Step 2: Run** — FAIL.

- [ ] **Step 3: Implement**

```ts
// src/app/api/outings/[id]/expenses/route.ts
import { z } from "zod";
import { prisma } from "@/lib/db";
import { route, ok, parseBody, requireUser, requireOutingMember, HttpError } from "@/lib/http";
import { requireStatus } from "@/lib/outings/permissions";

const Body = z.object({
  amount: z.number().int("Amount must be in whole paise.").min(1, "Enter an amount.").max(10_000_000),
  note: z.string().trim().min(1, "What was it for?").max(80),
  stopIndex: z.number().int().min(0).nullable(),
  splitAmong: z.array(z.string()).min(1, "Split with at least one person."),
});

export const POST = route<{ id: string }>(async (req, { params }) => {
  const user = await requireUser();
  const { id } = await params;
  const { outing } = await requireOutingMember(id, user.id);
  requireStatus(outing, "locked", "completed", "failed");
  const b = await parseBody(req, Body);

  const members = new Set(
    (await prisma.membership.findMany({ where: { groupId: outing.groupId }, select: { userId: true } })).map((m) => m.userId)
  );
  if (b.splitAmong.some((uid) => !members.has(uid))) throw new HttpError(400, "Split only among group members.");

  const expense = await prisma.expense.create({
    data: { outingId: id, paidById: user.id, amount: b.amount, note: b.note, stopIndex: b.stopIndex, splitAmong: [...new Set(b.splitAmong)] },
  });
  return ok({ expense: { id: expense.id } }, 201);
});
```

```ts
// src/app/api/outings/[id]/expenses/[expenseId]/route.ts
import { prisma } from "@/lib/db";
import { route, ok, requireUser, requireOutingMember, HttpError } from "@/lib/http";

export const DELETE = route<{ id: string; expenseId: string }>(async (_req, { params }) => {
  const user = await requireUser();
  const { id, expenseId } = await params;
  const { membership } = await requireOutingMember(id, user.id);
  const expense = await prisma.expense.findUnique({ where: { id: expenseId } });
  if (!expense || expense.outingId !== id) throw new HttpError(404, "Not found.");
  if (expense.paidById !== user.id && membership.role !== "admin") {
    throw new HttpError(403, "Only the person who paid or the admin can remove this.");
  }
  await prisma.expense.delete({ where: { id: expenseId } });
  return ok({ ok: true });
});
```

- [ ] **Step 4: Run** — `npx vitest run tests/api/expenses.test.ts` → PASS. Then the whole suite: `npm test` → all PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: expenses and settle-up"
```

---
## Phase D — Mobile-first UI

UI tasks are test-driven with Playwright at a phone viewport (Pixel 7, 412×915). Each UI task writes its E2E spec first, watches it fail, then builds the screens. Accessible names in the specs are the contract: keep them exactly.

Visual language: reuse the existing "Dusk Transit" tokens in `src/app/globals.css` (`bg-canvas`, `bg-surface`, `border-line`, `text-cream`, `text-cream-dim`, `text-cream-faint`, `bg-amber`, `text-line-*`, `font-display`, `font-mono`, `rounded-[var(--radius-card)]`) and the `Button` / `ButtonLink` components. Every page: `max-w-md mx-auto px-4` on phones, ≥ 44px tap targets (`min-h-11`), primary actions at the bottom.

### Task 24: Playwright, client API, sign-in, onboarding with map picker

**Files:**
- Create: `playwright.config.ts`, `tests/e2e/global-setup.ts`, `tests/e2e/helpers.ts`, `tests/e2e/onboarding.spec.ts`
- Create: `src/app/api/geocode/route.ts`, `src/app/api/auth/signout/route.ts`, `tests/api/geocode.test.ts`
- Create: `src/components/profile/ProfileForm.tsx`, `src/components/profile/LocationPicker.tsx`, `src/components/profile/LeafletPicker.tsx`, `src/lib/money.ts`
- Rewrite: `src/lib/api.ts`, `src/app/signin/page.tsx`, `src/app/onboarding/page.tsx`

**Interfaces:**
- Produces (`src/lib/api.ts`): `class ApiError extends Error { status: number; data: any }` and an `api` object:

```ts
api.requestOtp(phone): Promise<{ ok: true }>
api.verifyOtp(phone, code): Promise<{ ok: true; needsProfile: boolean }>
api.me(): Promise<{ profile: SelfProfile }>
api.saveProfile(p: ProfileInput): Promise<{ profile: SelfProfile }>
api.signOut(): Promise<{ ok: true }>
api.geocode(q): Promise<{ results: GeoResult[] }>          // GeoResult = { label: string; lat: number; lng: number }
api.groups(): Promise<{ groups: { id; name; memberCount; role }[] }>
api.createGroup(name): Promise<{ ok: true; group: { id: string } }>
api.group(id): Promise<GroupDetail>
api.rotateInvite(groupId): Promise<{ inviteCode: string }>
api.removeMember(groupId, userId): Promise<{ ok: true }>
api.previewJoin(code): Promise<{ group: { id; name; memberCount } }>
api.join(code): Promise<{ ok: true; groupId: string }>
api.outings(): Promise<{ outings: OutingListItem[] }>
api.createOuting(groupId, body): Promise<{ outing: { id: string } }>
api.outing(id): Promise<OutingView>
api.setAvailability(id, free: string[])
api.confirmDate(id, date)
api.generate(id): Promise<{ optionIds: string[] }>
api.vote(id, optionId)
api.rsvp(id, status, reason?)
api.lock(id, optionId?): Promise<{ ok: true; optionId: string }>   // ApiError(409).data.tiedOptionIds on tie
api.cancel(id, reason?)
api.showtime(id, stopIndex, time)
api.checkin(id, attended): Promise<{ ok: true; status: string }>
api.addExpense(id, body: { amount: number; note: string; stopIndex: number | null; splitAmong: string[] })
api.deleteExpense(id, expenseId)
api.subscribePush(sub: PushSubscriptionJSON)
api.unsubscribePush(endpoint)
```

- Produces: `formatRupees(paise: number): string` (`"₹1,234"`, en-IN grouping), `parseRupees(input: string): number | null` (→ paise).
- `GET /api/geocode?q=` → `{ results: GeoResult[] }` (signed-in only; fakes return fixed Bengaluru places; otherwise Nominatim with a `User-Agent` of `Waypoint/1.0 (NOMINATIM_CONTACT)`, `countrycodes=in`, `limit=5`).
- `POST /api/auth/signout` → `{ ok }`.
- UI contract (accessible names): sign-in — label `Mobile number`, button `Send code`, label `Code`, button `Verify`, link `Continue with Google`. Profile form — labels `Name`, `Email`, `Age`, radios `Male` / `Female` / `Non-binary` / `Prefer not to say`, inputs `Home search` / `Work search` with result buttons named by place label, radios `Public transport` / `Own vehicle`, checkbox `No fixed home-by time`, label `Home by`, button `Save profile`.

- [ ] **Step 1: Playwright config and helpers**

`playwright.config.ts`:

```ts
import { defineConfig, devices } from "@playwright/test";
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());
const testDb = process.env.DATABASE_URL_TEST;
if (!testDb) throw new Error("Set DATABASE_URL_TEST in .env.local before running E2E tests.");

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  globalSetup: "./tests/e2e/global-setup.ts",
  use: { baseURL: "http://localhost:3200", trace: "retain-on-failure" },
  projects: [{ name: "mobile", use: { ...devices["Pixel 7"] } }],
  webServer: {
    command: "npm run dev:e2e",
    url: "http://localhost:3200",
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: {
      DATABASE_URL: testDb,
      WAYPOINT_FAKES: "1",
      WAYPOINT_SYNC_BACKGROUND: "1",
      SESSION_SECRET: "e2e-secret",
      APP_URL: "http://localhost:3200",
      NEXT_PUBLIC_VAPID_PUBLIC_KEY: "",
    },
  },
});
```

`tests/e2e/global-setup.ts`:

```ts
import { execSync } from "node:child_process";

export default function setup() {
  execSync("npx prisma migrate reset --force --skip-seed", {
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: process.env.DATABASE_URL_TEST },
  });
}
```

`tests/e2e/helpers.ts`:

```ts
import { expect, type Page } from "@playwright/test";

export const randomPhone = () => `9${Math.floor(100000000 + Math.random() * 899999999)}`;

export async function signIn(page: Page, phone: string) {
  // Keep any ?next= the app already redirected us with.
  if (!new URL(page.url()).pathname.startsWith("/signin")) await page.goto("/signin");
  await page.getByLabel("Mobile number").fill(phone);
  await page.getByRole("button", { name: "Send code" }).click();
  await page.getByLabel("Code").fill("1234");
  await page.getByRole("button", { name: "Verify" }).click();
}

async function pickPlace(page: Page, which: "Home" | "Work", query: string) {
  await page.getByLabel(`${which} search`).fill(query);
  await page.getByRole("button", { name: new RegExp(`^${query}`) }).first().click();
  await expect(page.getByText(new RegExp(`${which}: ${query}`))).toBeVisible();
}

export async function fillProfile(
  page: Page,
  p: { name: string; email: string; gender: "Male" | "Female" | "Non-binary" | "Prefer not to say"; home?: string; work?: string }
) {
  await page.getByLabel("Name", { exact: true }).fill(p.name);
  await page.getByLabel("Email", { exact: true }).fill(p.email);
  await page.getByLabel("Age", { exact: true }).fill("27");
  await page.getByRole("radio", { name: p.gender, exact: true }).check({ force: true });
  await pickPlace(page, "Home", p.home ?? "Indiranagar");
  await pickPlace(page, "Work", p.work ?? "Koramangala");
  await page.getByRole("button", { name: "Save profile" }).click();
}

/** Signs in a brand-new user and completes onboarding. */
export async function newUser(page: Page, name: string, gender: "Male" | "Female" = "Male", next?: string) {
  await signIn(page, randomPhone());
  await expect(page).toHaveURL(/\/onboarding/);
  await fillProfile(page, { name, gender, email: `${name.toLowerCase()}${Date.now()}@example.com` });
  await expect(page).toHaveURL(next ?? /\/groups/);
}
```

- [ ] **Step 2: Write the failing E2E spec `tests/e2e/onboarding.spec.ts`**

```ts
import { test, expect } from "@playwright/test";
import { fillProfile, randomPhone, signIn, newUser } from "./helpers";

test("new user signs in with OTP and completes onboarding", async ({ page }) => {
  await newUser(page, "Asha", "Female");
});

test("profile needs gender and email before saving", async ({ page }) => {
  await signIn(page, randomPhone());
  await expect(page).toHaveURL(/\/onboarding/);
  await page.getByLabel("Name", { exact: true }).fill("No Gender");
  await page.getByRole("button", { name: "Save profile" }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page).toHaveURL(/\/onboarding/);
});

test("female users see the 23:00 default hint", async ({ page }) => {
  await signIn(page, randomPhone());
  await page.getByRole("radio", { name: "Female", exact: true }).check({ force: true });
  await expect(page.getByText(/home by 23:00/i)).toBeVisible();
});

test("returning users skip onboarding", async ({ page, context }) => {
  const phone = randomPhone();
  await signIn(page, phone);
  await fillProfile(page, { name: "Ravi", gender: "Male", email: `ravi${Date.now()}@example.com` });
  await expect(page).toHaveURL(/\/groups/);
  await context.clearCookies();
  await signIn(page, phone);
  await expect(page).toHaveURL(/\/groups/);
});

test("sign-in screen offers Google", async ({ page }) => {
  await page.goto("/signin");
  await expect(page.getByRole("link", { name: "Continue with Google" })).toHaveAttribute("href", "/api/auth/google");
});
```

Run: `npm run test:e2e -- onboarding` → FAIL (labels don't exist yet).

- [ ] **Step 3: Failing geocode API test `tests/api/geocode.test.ts`**

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { resetDb } from "../helpers/db";
import { asUser, call } from "../helpers/http";
import { makeUser } from "../helpers/factories";
import { GET as geocode } from "@/app/api/geocode/route";

describe("geocode", () => {
  beforeEach(resetDb);
  it("requires sign-in", async () => {
    await asUser(null);
    expect((await call(geocode, { url: "http://t/api/geocode?q=indira" })).status).toBe(401);
  });
  it("returns fake places matching the query", async () => {
    const u = await makeUser();
    await asUser(u.id);
    const res = await call(geocode, { url: "http://t/api/geocode?q=indira" });
    expect(res.json.results[0].label).toMatch(/^Indiranagar/);
  });
  it("needs at least 3 characters", async () => {
    const u = await makeUser();
    await asUser(u.id);
    expect((await call(geocode, { url: "http://t/api/geocode?q=in" })).json.results).toEqual([]);
  });
});
```

- [ ] **Step 4: Implement geocode and sign-out routes**

```ts
// src/app/api/geocode/route.ts
import { route, ok, requireUser } from "@/lib/http";
import { fakesEnabled } from "@/lib/fakes";

const FAKE = [
  { label: "Indiranagar, Bengaluru", lat: 12.9719, lng: 77.6412 },
  { label: "Koramangala, Bengaluru", lat: 12.9352, lng: 77.6245 },
  { label: "Whitefield, Bengaluru", lat: 12.9698, lng: 77.75 },
  { label: "Jayanagar, Bengaluru", lat: 12.925, lng: 77.5938 },
];

export const GET = route(async (req) => {
  await requireUser();
  const q = (new URL(req.url).searchParams.get("q") ?? "").trim();
  if (q.length < 3) return ok({ results: [] });

  if (fakesEnabled()) {
    return ok({ results: FAKE.filter((p) => p.label.toLowerCase().includes(q.toLowerCase())) });
  }

  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("q", q);
  url.searchParams.set("countrycodes", "in");
  url.searchParams.set("limit", "5");
  const res = await fetch(url, {
    headers: { "User-Agent": `Waypoint/1.0 (${process.env.NOMINATIM_CONTACT ?? "admin@example.com"})` },
  });
  if (!res.ok) return ok({ results: [] });
  const rows = (await res.json()) as { display_name: string; lat: string; lon: string }[];
  return ok({
    results: rows.map((r) => ({
      label: r.display_name.split(",").slice(0, 2).map((s) => s.trim()).join(", "),
      lat: Number(r.lat),
      lng: Number(r.lon),
    })),
  });
});
```

```ts
// src/app/api/auth/signout/route.ts
import { route, ok } from "@/lib/http";
import { clearSession } from "@/lib/session";

export const POST = route(async () => {
  await clearSession();
  return ok({ ok: true });
});
```

Run `npx vitest run tests/api/geocode.test.ts` → PASS.

- [ ] **Step 5: Rewrite `src/lib/api.ts` and add `src/lib/money.ts`**

```ts
// src/lib/api.ts
// Typed client-side fetch helpers. Each throws ApiError with the server's message.
import type { selfProfile } from "@/lib/serialize";
import type { PublicMember } from "@/lib/serialize";
import type { ProfileInput } from "@/lib/profile";
import type { OutingView } from "@/lib/outings/view";

export type SelfProfile = ReturnType<typeof selfProfile>;
export type GeoResult = { label: string; lat: number; lng: number };
export type OutingListItem = {
  id: string; title: string; status: string; date: string | null;
  rangeStart: string; rangeEnd: string; groupId: string; groupName: string;
};
export type GroupDetail = {
  group: { id: string; name: string; inviteCode: string; myRole: "admin" | "member"; members: PublicMember[] };
  outings: { id: string; title: string; status: string; date: string | null; rangeStart: string; rangeEnd: string; goingCount: number; createdAt: string }[];
};
export type { OutingView };

export class ApiError extends Error {
  constructor(message: string, public status: number, public data: any) {
    super(message);
  }
}

async function send<T>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: body !== undefined ? { "content-type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data.error ?? "Something went wrong.", res.status, data);
  return data as T;
}

type Ok = { ok: true };
const o = (id: string) => `/api/outings/${id}`;

export const api = {
  requestOtp: (phone: string) => send<Ok>("POST", "/api/auth/request-otp", { phone }),
  verifyOtp: (phone: string, code: string) =>
    send<{ ok: true; needsProfile: boolean }>("POST", "/api/auth/verify-otp", { phone, code }),
  me: () => send<{ profile: SelfProfile }>("GET", "/api/me"),
  saveProfile: (p: ProfileInput) => send<{ profile: SelfProfile }>("PUT", "/api/profile", p),
  signOut: () => send<Ok>("POST", "/api/auth/signout"),
  geocode: (q: string) => send<{ results: GeoResult[] }>("GET", `/api/geocode?q=${encodeURIComponent(q)}`),

  groups: () => send<{ groups: { id: string; name: string; memberCount: number; role: "admin" | "member" }[] }>("GET", "/api/groups"),
  createGroup: (name: string) => send<{ ok: true; group: { id: string } }>("POST", "/api/groups", { name }),
  group: (id: string) => send<GroupDetail>("GET", `/api/groups/${id}`),
  rotateInvite: (id: string) => send<{ inviteCode: string }>("POST", `/api/groups/${id}/invite`),
  removeMember: (id: string, userId: string) => send<Ok>("DELETE", `/api/groups/${id}/members/${userId}`),
  previewJoin: (code: string) => send<{ group: { id: string; name: string; memberCount: number } }>("GET", `/api/join/${code}`),
  join: (code: string) => send<{ ok: true; groupId: string }>("POST", `/api/join/${code}`),

  outings: () => send<{ outings: OutingListItem[] }>("GET", "/api/outings"),
  createOuting: (groupId: string, body: { title: string; rangeStart: string; rangeEnd: string; groupHomeBy: string | null }) =>
    send<{ outing: { id: string } }>("POST", `/api/groups/${groupId}/outings`, body),
  outing: (id: string) => send<OutingView>("GET", o(id)),
  setAvailability: (id: string, free: string[]) => send<Ok>("PUT", `${o(id)}/availability`, { free }),
  confirmDate: (id: string, date: string) => send<Ok>("POST", `${o(id)}/confirm-date`, { date }),
  generate: (id: string) => send<{ optionIds: string[] }>("POST", `${o(id)}/generate`),
  vote: (id: string, optionId: string) => send<Ok>("PUT", `${o(id)}/vote`, { optionId }),
  rsvp: (id: string, status: "going" | "maybe" | "no" | "cancelled", reason?: string) =>
    send<Ok>("PUT", `${o(id)}/rsvp`, { status, reason }),
  lock: (id: string, optionId?: string) => send<{ ok: true; optionId: string }>("POST", `${o(id)}/lock`, { optionId }),
  cancel: (id: string, reason?: string) => send<Ok>("POST", `${o(id)}/cancel`, { reason }),
  showtime: (id: string, stopIndex: number, time: string) => send<Ok>("POST", `${o(id)}/showtime`, { stopIndex, time }),
  checkin: (id: string, attended: boolean) => send<{ ok: true; status: string }>("POST", `${o(id)}/checkin`, { attended }),
  addExpense: (id: string, body: { amount: number; note: string; stopIndex: number | null; splitAmong: string[] }) =>
    send<{ expense: { id: string } }>("POST", `${o(id)}/expenses`, body),
  deleteExpense: (id: string, expenseId: string) => send<Ok>("DELETE", `${o(id)}/expenses/${expenseId}`),

  subscribePush: (sub: PushSubscriptionJSON) => send<Ok>("POST", "/api/push/subscribe", sub),
  unsubscribePush: (endpoint: string) => send<Ok>("DELETE", "/api/push/subscribe", { endpoint }),
};
```

```ts
// src/lib/money.ts
const fmt = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });

export function formatRupees(paise: number): string {
  return fmt.format(Math.round(paise / 100));
}

/** "450" or "450.50" → paise; null when not a positive amount. */
export function parseRupees(input: string): number | null {
  const n = Number(input.replace(/[,₹\s]/g, ""));
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 100);
}
```

Add `tests/unit/money.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { formatRupees, parseRupees } from "@/lib/money";

describe("money", () => {
  it("formats paise as rupees with Indian grouping", () => {
    expect(formatRupees(12345600)).toBe("₹1,23,456");
  });
  it("parses rupee input to paise", () => {
    expect(parseRupees("450.50")).toBe(45050);
    expect(parseRupees("₹1,200")).toBe(120000);
    expect(parseRupees("0")).toBeNull();
    expect(parseRupees("abc")).toBeNull();
  });
});
```

- [ ] **Step 6: Location picker components**

```tsx
// src/components/profile/LeafletPicker.tsx
"use client";

import { useEffect } from "react";
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

const pin = L.divIcon({
  className: "",
  html: '<div style="width:20px;height:20px;border-radius:9999px;background:#ffb454;border:3px solid #17162a;box-shadow:0 0 0 4px rgba(255,180,84,.35)"></div>',
  iconSize: [20, 20],
  iconAnchor: [10, 10],
});

function Follow({ lat, lng }: { lat: number; lng: number }) {
  const map = useMap();
  useEffect(() => { map.setView([lat, lng], map.getZoom()); }, [lat, lng, map]);
  return null;
}

function Clicks({ onPick }: { onPick: (lat: number, lng: number) => void }) {
  useMapEvents({ click: (e) => onPick(e.latlng.lat, e.latlng.lng) });
  return null;
}

export default function LeafletPicker({
  lat, lng, onPick,
}: { lat: number; lng: number; onPick: (lat: number, lng: number) => void }) {
  return (
    <MapContainer center={[lat, lng]} zoom={15} className="h-44 w-full rounded-2xl" attributionControl={false}>
      <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
      <Marker
        position={[lat, lng]}
        icon={pin}
        draggable
        eventHandlers={{ dragend: (e) => { const p = (e.target as L.Marker).getLatLng(); onPick(p.lat, p.lng); } }}
      />
      <Follow lat={lat} lng={lng} />
      <Clicks onPick={onPick} />
    </MapContainer>
  );
}
```

```tsx
// src/components/profile/LocationPicker.tsx
"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { api, type GeoResult } from "@/lib/api";

const LeafletPicker = dynamic(() => import("./LeafletPicker"), {
  ssr: false,
  loading: () => <div className="h-44 w-full animate-pulse rounded-2xl bg-surface" />,
});

export interface Place { lat: number; lng: number; label: string }

export default function LocationPicker({
  which, value, onChange,
}: { which: "Home" | "Work"; value: Place | null; onChange: (p: Place) => void }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<GeoResult[]>([]);

  useEffect(() => {
    if (q.trim().length < 3) { setResults([]); return; }
    const t = setTimeout(() => {
      api.geocode(q).then((r) => setResults(r.results)).catch(() => setResults([]));
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  return (
    <div className="space-y-2">
      <input
        aria-label={`${which} search`}
        className="min-h-12 w-full rounded-2xl border border-line bg-surface px-4 outline-none placeholder:text-cream-faint focus:border-amber"
        placeholder={which === "Home" ? "Search your neighbourhood" : "Search your office area"}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        enterKeyHint="search"
      />
      {results.length > 0 && (
        <ul className="overflow-hidden rounded-2xl border border-line bg-surface">
          {results.map((r) => (
            <li key={`${r.lat},${r.lng}`}>
              <button
                type="button"
                className="min-h-11 w-full px-4 py-3 text-left text-sm hover:bg-surface-2"
                onClick={() => { onChange(r); setQ(""); setResults([]); }}
              >
                {r.label}
              </button>
            </li>
          ))}
        </ul>
      )}
      {value && (
        <>
          <p className="text-sm text-cream-dim">{which}: {value.label}</p>
          <LeafletPicker
            lat={value.lat}
            lng={value.lng}
            onPick={(lat, lng) => onChange({ ...value, lat, lng })}
          />
          <p className="text-xs text-cream-faint">Tap or drag the pin to fine-tune. Friends only see the area name.</p>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 7: `src/components/profile/ProfileForm.tsx`**

```tsx
"use client";

import { useState } from "react";
import { Button } from "@/components/Button";
import LocationPicker, { type Place } from "./LocationPicker";
import { api, type SelfProfile } from "@/lib/api";

const INTERESTS = [
  "coffee", "brunch", "street food", "fine dining", "craft beer", "board games", "gaming",
  "movies", "live music", "art", "history", "photography", "nature", "sports", "shopping", "reading",
];
const GENDERS = [
  { value: "male", label: "Male" },
  { value: "female", label: "Female" },
  { value: "non_binary", label: "Non-binary" },
  { value: "prefer_not_to_say", label: "Prefer not to say" },
] as const;
type Gender = (typeof GENDERS)[number]["value"];

const input = "min-h-12 w-full rounded-2xl border border-line bg-surface px-4 outline-none placeholder:text-cream-faint focus:border-amber";
const chip = "min-h-11 rounded-full border px-4 text-sm transition-colors";

function Label({ children }: { children: React.ReactNode }) {
  return <span className="mb-2 block font-mono text-xs uppercase tracking-widest text-cream-faint">{children}</span>;
}

export default function ProfileForm({
  initial, submitLabel = "Save profile", onSaved,
}: { initial: SelfProfile | null; submitLabel?: string; onSaved: (p: SelfProfile) => void }) {
  const [name, setName] = useState(initial?.name ?? "");
  const [email, setEmail] = useState(initial?.email ?? "");
  const [age, setAge] = useState(initial?.age ? String(initial.age) : "");
  const [gender, setGender] = useState<Gender | null>((initial?.gender as Gender) ?? null);
  const [home, setHome] = useState<Place | null>(initial?.home ?? null);
  const [work, setWork] = useState<Place | null>(initial?.work ?? null);
  const [transport, setTransport] = useState<"public" | "own">(initial?.transport ?? "public");
  const [interests, setInterests] = useState<string[]>(initial?.interests ?? []);
  const [openness, setOpenness] = useState(initial?.openness ?? 3);
  const [noHomeBy, setNoHomeBy] = useState(!initial?.homeBy);
  const [homeBy, setHomeBy] = useState(initial?.homeBy ?? "22:30");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!gender) return setError("Pick a gender option.");
    if (!home || !work) return setError("Set both your home and work areas.");
    setBusy(true);
    try {
      const { profile } = await api.saveProfile({
        name, email, age: Number(age), gender, home, work, transport, interests, openness,
        homeBy: noHomeBy ? null : homeBy,
      });
      onSaved(profile);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-6 pb-28" noValidate>
      <label className="block"><Label>Name</Label>
        <input aria-label="Name" className={input} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
      </label>
      <label className="block"><Label>Email</Label>
        <input aria-label="Email" type="email" inputMode="email" className={input} value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
      </label>
      <label className="block"><Label>Age</Label>
        <input aria-label="Age" inputMode="numeric" className={input} value={age} onChange={(e) => setAge(e.target.value.replace(/\D/g, "").slice(0, 3))} />
      </label>

      <fieldset>
        <legend className="mb-2 font-mono text-xs uppercase tracking-widest text-cream-faint">Gender</legend>
        <div className="flex flex-wrap gap-2">
          {GENDERS.map((g) => (
            <label key={g.value} className={`${chip} flex items-center ${gender === g.value ? "border-amber bg-amber text-canvas-deep" : "border-line text-cream-dim"}`}>
              <input type="radio" name="gender" className="sr-only" aria-label={g.label} checked={gender === g.value} onChange={() => setGender(g.value)} />
              {g.label}
            </label>
          ))}
        </div>
      </fieldset>

      <div><Label>Home</Label><LocationPicker which="Home" value={home} onChange={setHome} /></div>
      <div><Label>Work</Label><LocationPicker which="Work" value={work} onChange={setWork} /></div>

      <fieldset>
        <legend className="mb-2 font-mono text-xs uppercase tracking-widest text-cream-faint">How you get around</legend>
        <div className="grid grid-cols-2 gap-2">
          {([["public", "Public transport"], ["own", "Own vehicle"]] as const).map(([v, l]) => (
            <label key={v} className={`${chip} flex items-center justify-center ${transport === v ? "border-amber text-amber" : "border-line text-cream-dim"}`}>
              <input type="radio" name="transport" className="sr-only" aria-label={l} checked={transport === v} onChange={() => setTransport(v)} />
              {l}
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="mb-2 font-mono text-xs uppercase tracking-widest text-cream-faint">Interests</legend>
        <div className="flex flex-wrap gap-2">
          {INTERESTS.map((t) => {
            const on = interests.includes(t);
            return (
              <button type="button" key={t} aria-pressed={on}
                className={`${chip} ${on ? "border-amber text-amber" : "border-line text-cream-dim"}`}
                onClick={() => setInterests(on ? interests.filter((x) => x !== t) : [...interests, t])}>
                {t}
              </button>
            );
          })}
        </div>
      </fieldset>

      <label className="block"><Label>Open to new places ({openness}/5)</Label>
        <input aria-label="Openness" type="range" min={1} max={5} value={openness} onChange={(e) => setOpenness(Number(e.target.value))} className="w-full accent-amber" />
      </label>

      <div className="space-y-2">
        <Label>Home by</Label>
        <label className="flex min-h-11 items-center gap-3 text-sm text-cream-dim">
          <input type="checkbox" aria-label="No fixed home-by time" checked={noHomeBy} onChange={(e) => setNoHomeBy(e.target.checked)} className="size-5 accent-amber" />
          No fixed home-by time
        </label>
        {!noHomeBy && (
          <input aria-label="Home by" type="time" className={input} value={homeBy} onChange={(e) => setHomeBy(e.target.value)} />
        )}
        {gender === "female" && noHomeBy && (
          <p className="text-xs text-cream-faint">Plans will get you home by 23:00 unless you set your own time.</p>
        )}
      </div>

      {error && <p role="alert" className="text-sm text-line-coral">{error}</p>}

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-canvas/95 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur">
        <Button type="submit" size="lg" className="mx-auto w-full max-w-md" disabled={busy}>{busy ? "Saving…" : submitLabel}</Button>
      </div>
    </form>
  );
}
```

Note: the female hint text must match `/home by 23:00/i` in the E2E spec: "Plans will get you **home by 23:00** unless…" ✓.

When `ProfileForm` is used inside the app shell (Task 25), the fixed submit bar must sit above the bottom tab bar: accept an optional `barOffsetClass` prop later if needed; for onboarding (no tab bar) the default is correct.

- [ ] **Step 8: Rewrite `src/app/signin/page.tsx`**

```tsx
"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/Button";
import Wordmark from "@/components/Wordmark";
import { api } from "@/lib/api";

const input = "min-h-12 w-full rounded-2xl border border-line bg-surface px-4 text-lg tracking-wide outline-none focus:border-amber";

function SignIn() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") ?? "/groups";
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"phone" | "code">("phone");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(
    params.get("error") === "google" ? "Google sign-in didn't work. Try again or use your phone." : null
  );

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try { await fn(); } catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))]">
      <Wordmark />
      <div className="mt-auto space-y-5">
        <h1 className="font-display text-3xl text-balance">Plan days out that work for everyone.</h1>
        {step === "phone" ? (
          <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); run(async () => { await api.requestOtp(phone); setStep("code"); }); }}>
            <label className="block">
              <span className="mb-2 block font-mono text-xs uppercase tracking-widest text-cream-faint">Mobile number</span>
              <input aria-label="Mobile number" type="tel" inputMode="numeric" autoComplete="tel-national" className={input} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="98765 43210" />
            </label>
            <Button type="submit" size="lg" className="w-full" disabled={busy}>Send code</Button>
          </form>
        ) : (
          <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); run(async () => {
            const r = await api.verifyOtp(phone, code);
            router.replace(r.needsProfile ? `/onboarding?next=${encodeURIComponent(next)}` : next);
          }); }}>
            <label className="block">
              <span className="mb-2 block font-mono text-xs uppercase tracking-widest text-cream-faint">Code</span>
              <input aria-label="Code" inputMode="numeric" autoComplete="one-time-code" maxLength={4} className={input} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} autoFocus />
            </label>
            <Button type="submit" size="lg" className="w-full" disabled={busy || code.length !== 4}>Verify</Button>
            <button type="button" className="min-h-11 w-full text-sm text-cream-dim" onClick={() => setStep("phone")}>Change number</button>
          </form>
        )}
        <div className="flex items-center gap-3 text-xs text-cream-faint"><span className="h-px flex-1 bg-line" />or<span className="h-px flex-1 bg-line" /></div>
        <a href="/api/auth/google" className="flex min-h-12 w-full items-center justify-center rounded-full border border-line font-display text-[15px] hover:border-amber">
          Continue with Google
        </a>
        {error && <p role="alert" className="text-sm text-line-coral">{error}</p>}
      </div>
    </main>
  );
}

export default function SignInPage() {
  return <Suspense><SignIn /></Suspense>;
}
```

- [ ] **Step 9: Rewrite `src/app/onboarding/page.tsx`**

```tsx
"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Wordmark from "@/components/Wordmark";
import ProfileForm from "@/components/profile/ProfileForm";
import { api, ApiError, type SelfProfile } from "@/lib/api";

function Onboarding() {
  const router = useRouter();
  const next = useSearchParams().get("next") ?? "/groups";
  const [profile, setProfile] = useState<SelfProfile | null | undefined>(undefined);

  useEffect(() => {
    api.me().then((r) => setProfile(r.profile)).catch((err) => {
      if (err instanceof ApiError && err.status === 401) router.replace(`/signin?next=${encodeURIComponent(`/onboarding?next=${next}`)}`);
      else setProfile(null);
    });
  }, [router, next]);

  return (
    <main className="mx-auto w-full max-w-md px-4 pt-[max(1rem,env(safe-area-inset-top))]">
      <Wordmark />
      <h1 className="mt-6 font-display text-2xl">Tell your friends where you&apos;re coming from</h1>
      <p className="mt-2 mb-6 text-sm text-cream-dim">Only people in your groups see your area — never your exact address.</p>
      {profile !== undefined && <ProfileForm initial={profile} onSaved={() => router.replace(next)} />}
    </main>
  );
}

export default function OnboardingPage() {
  return <Suspense><Onboarding /></Suspense>;
}
```

- [ ] **Step 10: Run** — `npx tsc --noEmit && npm run lint && npm test && npm run test:e2e -- onboarding` → all PASS. Then look at `/signin` and `/onboarding` at 375px wide (use the `run` skill or Chrome devtools device mode): nothing overflows horizontally, the Save bar doesn't cover the last field when scrolled to the bottom, the map shows.

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -m "feat: Playwright setup, sign-in, onboarding with map picker"
```

---

### Task 25: App shell, profile, groups, group home, join, landing

**Files:**
- Create: `src/app/(app)/layout.tsx`, `src/components/shell/AppShell.tsx`, `src/components/shell/BottomSheet.tsx`, `src/components/shell/StatusChip.tsx`
- Move: `src/app/groups/**` → `src/app/(app)/groups/**` (URLs unchanged)
- Create: `src/app/(app)/profile/page.tsx`, `src/components/group/AreaMap.tsx`, `src/components/group/LeafletAreaMap.tsx`
- Rewrite: `src/app/(app)/groups/page.tsx`, `src/app/(app)/groups/[id]/page.tsx`, `src/components/GroupHome.tsx` → `src/components/group/GroupHome.tsx`, `src/app/join/[code]/page.tsx`, `src/app/page.tsx`
- Delete: `src/app/groups/new/page.tsx` (creation moves into a sheet), `src/lib/mock.ts`, `src/lib/display.ts`, `src/components/ConvergenceMap.tsx`, `src/components/RouteLegs.tsx`
- Modify: `src/app/layout.tsx` (viewport)
- Test: `tests/e2e/groups.spec.ts`

**Interfaces:**
- Produces: `AppShell` (bottom tabs `Groups` `/groups`, `Outings` `/outings`, `Profile` `/profile`; tab links have those accessible names); `BottomSheet({ open, onClose, title, children })` (role `dialog`, labelled by `title`, closes on backdrop tap, Escape, or drag down); `StatusChip({ status })` with text: collecting → "Picking a date", voting → "Voting", locked → "Locked in", completed → "✅ Happened", failed → "❌ Didn't happen", cancelled → "🚫 Cancelled".
- UI contract: groups list button `New group`, sheet label `Group name`, button `Create group`; group home buttons `Share invite`, `New invite link`, `Plan an outing`, per-member `Remove {name}` (admin only) → sheet button `Remove`; join page button `Join {group name}`; profile page buttons `Save profile`, `Sign out`, link `Link Google account`.

- [ ] **Step 1: Failing E2E spec `tests/e2e/groups.spec.ts`**

```ts
import { test, expect } from "@playwright/test";
import { newUser } from "./helpers";

test("create a group, invite a friend, friend joins, admin removes them", async ({ browser }) => {
  const adminCtx = await browser.newContext({ ...test.info().project.use });
  const admin = await adminCtx.newPage();
  await newUser(admin, "Meera", "Female");

  await admin.getByRole("button", { name: "New group" }).click();
  await admin.getByLabel("Group name").fill("Weekenders");
  await admin.getByRole("button", { name: "Create group" }).click();
  await expect(admin.getByRole("heading", { name: "Weekenders" })).toBeVisible();
  const invitePath = await admin.getByTestId("invite-link").getAttribute("data-path");
  expect(invitePath).toMatch(/^\/join\//);

  const friendCtx = await browser.newContext({ ...test.info().project.use });
  const friend = await friendCtx.newPage();
  await friend.goto(invitePath!);
  await expect(friend).toHaveURL(/\/signin/);
  await newUser(friend, "Kiran", "Male", new RegExp(invitePath!.replace(/\//g, "\\/")));
  await friend.getByRole("button", { name: "Join Weekenders" }).click();
  await expect(friend.getByRole("heading", { name: "Weekenders" })).toBeVisible();
  await expect(friend.getByText("Meera")).toBeVisible();
  await expect(friend.getByRole("button", { name: /Remove/ })).toHaveCount(0);

  await admin.reload();
  await admin.getByRole("button", { name: "Remove Kiran" }).click();
  await admin.getByRole("dialog").getByRole("button", { name: "Remove" }).click();
  await expect(admin.getByText("Kiran")).toHaveCount(0);

  await friend.reload();
  await expect(friend.getByText(/not found/i)).toBeVisible();
});

test("bottom tabs navigate between sections", async ({ page }) => {
  await newUser(page, "Tabby");
  await page.getByRole("link", { name: "Outings" }).click();
  await expect(page).toHaveURL(/\/outings/);
  await page.getByRole("link", { name: "Profile" }).click();
  await expect(page).toHaveURL(/\/profile/);
  await expect(page.getByLabel("Name", { exact: true })).toHaveValue("Tabby");
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/signin/);
});

test("no horizontal scroll on the groups screen", async ({ page }) => {
  await newUser(page, "Narrow");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
```

Note: `newUser(..., next)` — after onboarding the user is redirected to `next` (the join page) because sign-in carried `?next=`. The join page must redirect signed-out users to `/signin?next=/join/<code>`.

Run: `npm run test:e2e -- groups` → FAIL.

- [ ] **Step 2: Viewport + shell + sheet + chip**

In `src/app/layout.tsx` add:

```ts
import type { Viewport } from "next";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#17162a",
};
```

and change `<body className="min-h-full flex flex-col">` to `<body className="min-h-dvh flex flex-col overflow-x-hidden">`.

```tsx
// src/components/shell/AppShell.tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/groups", label: "Groups", icon: "◎" },
  { href: "/outings", label: "Outings", icon: "◇" },
  { href: "/profile", label: "Profile", icon: "○" },
];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  return (
    <div className="flex min-h-dvh flex-col">
      <div className="mx-auto w-full max-w-md flex-1 px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[calc(5rem+env(safe-area-inset-bottom))]">
        {children}
      </div>
      <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-canvas-deep/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
        <ul className="mx-auto grid max-w-md grid-cols-3">
          {TABS.map((t) => {
            const active = path === t.href || path.startsWith(`${t.href}/`);
            return (
              <li key={t.href}>
                <Link href={t.href} aria-current={active ? "page" : undefined}
                  className={`flex min-h-14 flex-col items-center justify-center gap-0.5 text-xs ${active ? "text-amber" : "text-cream-faint"}`}>
                  <span aria-hidden className="text-lg leading-none">{t.icon}</span>
                  {t.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
```

```tsx
// src/components/shell/BottomSheet.tsx
"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useId } from "react";

export default function BottomSheet({
  open, onClose, title, children,
}: { open: boolean; onClose: () => void; title: string; children: React.ReactNode }) {
  const id = useId();
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50">
          <motion.button aria-label="Close" className="absolute inset-0 bg-black/50"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
          <motion.div role="dialog" aria-modal="true" aria-labelledby={id}
            className="absolute inset-x-0 bottom-0 mx-auto max-h-[85dvh] max-w-md overflow-y-auto rounded-t-[var(--radius-card)] border-t border-line bg-surface px-4 pt-2 pb-[max(1.25rem,env(safe-area-inset-bottom))]"
            initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 320 }}
            drag="y" dragConstraints={{ top: 0, bottom: 0 }} dragElastic={{ top: 0, bottom: 0.6 }}
            onDragEnd={(_, info) => info.offset.y > 120 && onClose()}>
            <div aria-hidden className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-line" />
            <h2 id={id} className="mb-4 font-display text-lg">{title}</h2>
            {children}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
```

```tsx
// src/components/shell/StatusChip.tsx
const LABEL: Record<string, string> = {
  collecting: "Picking a date",
  voting: "Voting",
  locked: "Locked in",
  completed: "✅ Happened",
  failed: "❌ Didn't happen",
  cancelled: "🚫 Cancelled",
};
const TONE: Record<string, string> = {
  collecting: "border-line-sky text-line-sky",
  voting: "border-line-violet text-line-violet",
  locked: "border-amber text-amber",
  completed: "border-line-lime text-line-lime",
  failed: "border-line-coral text-line-coral",
  cancelled: "border-line text-cream-faint",
};

export default function StatusChip({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 font-mono text-[11px] ${TONE[status] ?? TONE.cancelled}`}>
      {LABEL[status] ?? status}
    </span>
  );
}
```

`src/app/(app)/layout.tsx`:

```tsx
import { redirect } from "next/navigation";
import AppShell from "@/components/shell/AppShell";
import { getUserId } from "@/lib/session";
import { prisma } from "@/lib/db";
import { isProfileComplete } from "@/lib/profile";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const id = await getUserId();
  if (!id) redirect("/signin");
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) redirect("/signin");
  if (!isProfileComplete(user)) redirect("/onboarding");
  return <AppShell>{children}</AppShell>;
}
```

Move the groups folder: `git mv src/app/groups "src/app/(app)/groups"` then `git rm "src/app/(app)/groups/new/page.tsx"`.

- [ ] **Step 3: Groups list `src/app/(app)/groups/page.tsx`**

```tsx
"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/Button";
import BottomSheet from "@/components/shell/BottomSheet";
import { api } from "@/lib/api";

type G = Awaited<ReturnType<typeof api.groups>>["groups"][number];

export default function GroupsPage() {
  const router = useRouter();
  const [groups, setGroups] = useState<G[] | null>(null);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { api.groups().then((r) => setGroups(r.groups)).catch(() => setGroups([])); }, []);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    try {
      const r = await api.createGroup(name);
      router.push(`/groups/${r.group.id}`);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <>
      <header className="mb-6 flex items-center justify-between">
        <h1 className="font-display text-2xl">Your groups</h1>
        <Button size="sm" onClick={() => setOpen(true)}>New group</Button>
      </header>

      {groups === null && <div className="h-20 animate-pulse rounded-[var(--radius-card)] bg-surface" />}
      {groups?.length === 0 && (
        <div className="rounded-[var(--radius-card)] border border-dashed border-line p-6 text-center text-cream-dim">
          No groups yet. Start one and share the link with your friends.
        </div>
      )}
      <ul className="space-y-3">
        {groups?.map((g) => (
          <li key={g.id}>
            <Link href={`/groups/${g.id}`} className="flex min-h-16 items-center justify-between rounded-[var(--radius-card)] border border-line bg-surface px-4">
              <span className="font-display">{g.name}</span>
              <span className="font-mono text-xs text-cream-faint">{g.memberCount} · {g.role}</span>
            </Link>
          </li>
        ))}
      </ul>

      <BottomSheet open={open} onClose={() => setOpen(false)} title="New group">
        <form onSubmit={create} className="space-y-3">
          <label className="block">
            <span className="mb-2 block font-mono text-xs uppercase tracking-widest text-cream-faint">Group name</span>
            <input aria-label="Group name" className="min-h-12 w-full rounded-2xl border border-line bg-canvas px-4 outline-none focus:border-amber" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </label>
          {error && <p role="alert" className="text-sm text-line-coral">{error}</p>}
          <Button type="submit" size="lg" className="w-full" disabled={!name.trim()}>Create group</Button>
        </form>
      </BottomSheet>
    </>
  );
}
```

- [ ] **Step 4: Area map**

```tsx
// src/components/group/LeafletAreaMap.tsx
"use client";

import { CircleMarker, MapContainer, TileLayer, Tooltip } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import type { LineColor } from "@/lib/types";

const HEX: Record<LineColor, string> = {
  teal: "#3dd6c4", coral: "#ff6b6b", violet: "#a78bfa", lime: "#b6e24a", sky: "#5aa9ff", rose: "#f78fb3",
};

export interface AreaPoint { id: string; name: string; lat: number; lng: number; line: LineColor }

export default function LeafletAreaMap({ points }: { points: AreaPoint[] }) {
  const lat = points.reduce((s, p) => s + p.lat, 0) / points.length;
  const lng = points.reduce((s, p) => s + p.lng, 0) / points.length;
  return (
    <MapContainer center={[lat, lng]} zoom={11} className="h-48 w-full rounded-[var(--radius-card)]" attributionControl={false} scrollWheelZoom={false}>
      <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
      {points.map((p) => (
        // Radius ~1km circles: these are areas, not addresses.
        <CircleMarker key={p.id} center={[p.lat, p.lng]} radius={14} pathOptions={{ color: HEX[p.line], fillOpacity: 0.35 }}>
          <Tooltip>{p.name}</Tooltip>
        </CircleMarker>
      ))}
    </MapContainer>
  );
}
```

```tsx
// src/components/group/AreaMap.tsx
"use client";

import dynamic from "next/dynamic";
export type { AreaPoint } from "./LeafletAreaMap";

export default dynamic(() => import("./LeafletAreaMap"), {
  ssr: false,
  loading: () => <div className="h-48 w-full animate-pulse rounded-[var(--radius-card)] bg-surface" />,
});
```

- [ ] **Step 5: Group home**

`src/app/(app)/groups/[id]/page.tsx`:

```tsx
import GroupHome from "@/components/group/GroupHome";

export default async function GroupPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <GroupHome groupId={id} />;
}
```

`src/components/group/GroupHome.tsx` (delete the old `src/components/GroupHome.tsx`):

```tsx
"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import Avatar from "@/components/Avatar";
import { Button, ButtonLink } from "@/components/Button";
import BottomSheet from "@/components/shell/BottomSheet";
import StatusChip from "@/components/shell/StatusChip";
import AreaMap from "./AreaMap";
import { api, ApiError, type GroupDetail } from "@/lib/api";
import { lineFor } from "@/lib/lines";

export default function GroupHome({ groupId }: { groupId: string }) {
  const [data, setData] = useState<GroupDetail | null>(null);
  const [missing, setMissing] = useState(false);
  const [removing, setRemoving] = useState<{ id: string; name: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(() => {
    api.group(groupId).then(setData).catch((err) => {
      if (err instanceof ApiError && err.status === 404) setMissing(true);
    });
  }, [groupId]);
  useEffect(load, [load]);

  if (missing) return <p className="mt-10 text-center text-cream-dim">Group not found.</p>;
  if (!data) return <div className="h-40 animate-pulse rounded-[var(--radius-card)] bg-surface" />;

  const { group, outings } = data;
  const isAdmin = group.myRole === "admin";
  const path = `/join/${group.inviteCode}`;
  const points = group.members.flatMap((m, i) =>
    m.homeArea ? [{ id: m.id, name: m.name, lat: m.homeArea.lat, lng: m.homeArea.lng, line: lineFor(i) }] : []
  );

  async function share() {
    const url = `${window.location.origin}${path}`;
    if (navigator.share) {
      await navigator.share({ title: `Join ${group.name} on Waypoint`, url }).catch(() => {});
    } else {
      await navigator.clipboard?.writeText(url).catch(() => {});
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    }
  }

  return (
    <>
      <header className="mb-4">
        <Link href="/groups" className="text-sm text-cream-faint">← Groups</Link>
        <h1 className="mt-2 font-display text-2xl">{group.name}</h1>
      </header>

      {points.length > 0 && <AreaMap points={points} />}

      <section className="mt-4 flex gap-2" data-testid="invite-link" data-path={path}>
        <Button variant="outline" size="sm" onClick={share}>{copied ? "Link copied" : "Share invite"}</Button>
        {isAdmin && (
          <Button variant="ghost" size="sm" onClick={async () => { await api.rotateInvite(group.id); load(); }}>New invite link</Button>
        )}
      </section>

      <section className="mt-6">
        <h2 className="mb-3 font-mono text-xs uppercase tracking-widest text-cream-faint">Members · {group.members.length}</h2>
        <ul className="space-y-2">
          {group.members.map((m, i) => (
            <li key={m.id} className="flex min-h-14 items-center gap-3 rounded-2xl bg-surface px-3">
              <Avatar name={m.name} line={lineFor(i)} size={36} />
              <div className="min-w-0 flex-1">
                <p className="truncate">{m.name}{m.role === "admin" && <span className="ml-2 font-mono text-[11px] text-amber">admin</span>}</p>
                <p className="truncate text-xs text-cream-faint">
                  {m.profileComplete ? `${m.homeLabel} · ${m.transport === "public" ? "public transport" : "own vehicle"}` : "Missing details"}
                </p>
              </div>
              {isAdmin && m.role !== "admin" && (
                <button className="min-h-11 px-2 text-xs text-line-coral" aria-label={`Remove ${m.name}`} onClick={() => setRemoving({ id: m.id, name: m.name })}>
                  Remove
                </button>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-8">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-mono text-xs uppercase tracking-widest text-cream-faint">Outings</h2>
          <ButtonLink href={`/outings/new?group=${group.id}`} size="sm">Plan an outing</ButtonLink>
        </div>
        {outings.length === 0 && <p className="text-sm text-cream-dim">No outings yet.</p>}
        <ul className="space-y-2">
          {outings.map((o) => (
            <li key={o.id}>
              <Link href={`/outings/${o.id}`} className="flex min-h-14 items-center justify-between gap-3 rounded-2xl border border-line px-3">
                <span className="min-w-0">
                  <span className="block truncate">{o.title}</span>
                  <span className="text-xs text-cream-faint">{o.date ?? `${o.rangeStart} → ${o.rangeEnd}`}</span>
                </span>
                <StatusChip status={o.status} />
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <BottomSheet open={!!removing} onClose={() => setRemoving(null)} title={`Remove ${removing?.name ?? ""}?`}>
        <p className="mb-4 text-sm text-cream-dim">They lose access to this group and its outings straight away.</p>
        <Button className="w-full" onClick={async () => { await api.removeMember(group.id, removing!.id); setRemoving(null); load(); }}>Remove</Button>
      </BottomSheet>
    </>
  );
}
```

`lineFor` already exists in `src/lib/lines.ts` (it was imported by the deleted `display.ts`); keep `lines.ts` and `Avatar.tsx`.

- [ ] **Step 6: Join page `src/app/join/[code]/page.tsx`**

```tsx
"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Wordmark from "@/components/Wordmark";
import { Button } from "@/components/Button";
import { api, ApiError } from "@/lib/api";

export default function JoinPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = use(params);
  const router = useRouter();
  const [group, setGroup] = useState<{ id: string; name: string; memberCount: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const here = `/join/${code}`;

  useEffect(() => {
    api.previewJoin(code).then((r) => setGroup(r.group)).catch((err) => {
      if (err instanceof ApiError && err.status === 401) router.replace(`/signin?next=${encodeURIComponent(here)}`);
      else setError("This invite link doesn't work any more. Ask for a new one.");
    });
  }, [code, here, router]);

  async function join() {
    try {
      const r = await api.join(code);
      router.replace(`/groups/${r.groupId}`);
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) router.replace(`/onboarding?next=${encodeURIComponent(here)}`);
      else setError((err as Error).message);
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))]">
      <Wordmark />
      <div className="mt-auto space-y-4">
        {group && (
          <>
            <h1 className="font-display text-3xl">{group.name}</h1>
            <p className="text-cream-dim">{group.memberCount} {group.memberCount === 1 ? "friend is" : "friends are"} already in.</p>
            <Button size="lg" className="w-full" onClick={join}>Join {group.name}</Button>
          </>
        )}
        {error && <p role="alert" className="text-line-coral">{error}</p>}
      </div>
    </main>
  );
}
```

- [ ] **Step 7: Profile page `src/app/(app)/profile/page.tsx`**

```tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import ProfileForm from "@/components/profile/ProfileForm";
import { Button } from "@/components/Button";
import { api, type SelfProfile } from "@/lib/api";

export default function ProfilePage() {
  const router = useRouter();
  const [profile, setProfile] = useState<SelfProfile | null>(null);
  const [saved, setSaved] = useState(false);
  useEffect(() => { api.me().then((r) => setProfile(r.profile)); }, []);

  if (!profile) return <div className="h-40 animate-pulse rounded-[var(--radius-card)] bg-surface" />;
  return (
    <>
      <h1 className="mb-6 font-display text-2xl">Profile</h1>
      <section className="mb-6 space-y-3 rounded-[var(--radius-card)] border border-line p-4">
        <p className="text-sm text-cream-dim">{profile.phone ? `Phone: +${profile.phone}` : "No phone linked"}</p>
        {profile.googleLinked ? (
          <p className="text-sm text-cream-dim">Google account linked</p>
        ) : (
          <a href="/api/auth/google?link=1" className="inline-flex min-h-11 items-center text-sm text-amber">Link Google account</a>
        )}
        <div data-slot="push-toggle" />
        <Button variant="outline" size="sm" onClick={async () => { await api.signOut(); router.replace("/signin"); }}>Sign out</Button>
      </section>
      {saved && <p role="status" className="mb-4 text-sm text-line-lime">Saved.</p>}
      <ProfileForm initial={profile} onSaved={(p) => { setProfile(p); setSaved(true); }} barClassName="bottom-[calc(3.5rem+env(safe-area-inset-bottom))]" />
    </>
  );
}
```

Add the `barClassName?: string` prop to `ProfileForm`: on the fixed submit bar `div`, replace `bottom-0` with `${barClassName ?? "bottom-0"}` and its `pb-[max(0.75rem,env(safe-area-inset-bottom))]` with `${barClassName ? "pb-3" : "pb-[max(0.75rem,env(safe-area-inset-bottom))]"}`, so the bar sits above the tab bar. The `data-slot="push-toggle"` placeholder is replaced by `<PushToggle />` in Task 27.

- [ ] **Step 8: Landing page and cleanup**

`src/app/page.tsx`:

```tsx
import { redirect } from "next/navigation";
import Wordmark from "@/components/Wordmark";
import { ButtonLink } from "@/components/Button";
import { getUserId } from "@/lib/session";

const POINTS = [
  ["Fair for everyone", "Real travel times from every friend's area, not a pin in the middle of the map."],
  ["Home on time", "Everyone's ride home is checked against their own home-by time."],
  ["Plan, vote, go", "Pick a day together, vote on itineraries, split costs after."],
];

export default async function Landing() {
  if (await getUserId()) redirect("/groups");
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))]">
      <Wordmark />
      <h1 className="mt-16 font-display text-4xl text-balance">Days out that work for the whole group.</h1>
      <ul className="mt-10 space-y-5">
        {POINTS.map(([t, d]) => (
          <li key={t}><p className="font-display text-amber">{t}</p><p className="text-cream-dim">{d}</p></li>
        ))}
      </ul>
      <ButtonLink href="/signin" size="lg" className="mt-auto w-full">Get started</ButtonLink>
    </main>
  );
}
```

Delete the mock-era files and fix imports:

```bash
git rm src/lib/mock.ts src/lib/display.ts src/components/ConvergenceMap.tsx src/components/RouteLegs.tsx src/components/GroupHome.tsx
grep -rn "lib/mock\|lib/display\|ConvergenceMap\|RouteLegs" src || echo "clean"
```

Expected: `clean`. If `src/lib/types.ts` is now only used by `SwotPanel`, `Avatar`, `lines.ts`, keep it.

- [ ] **Step 9: Run** — `npx tsc --noEmit && npm run lint && npm test && npm run test:e2e -- groups onboarding` → PASS. Check `/groups` and a group home at 375px: no horizontal scroll, tab bar doesn't cover content, sheet opens above the keyboard.

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "feat: mobile app shell, profile, groups, group home, join flow"
```

---
### Task 26: Outing screens — create, availability, options, vote, lock, day-of, history, expenses

**Files:**
- Create: `src/app/(app)/outings/page.tsx`, `src/app/(app)/outings/new/page.tsx`, `src/app/(app)/outings/[id]/page.tsx`
- Create in `src/components/outing/`: `labels.ts`, `OutingScreen.tsx`, `CollectSection.tsx`, `VotingSection.tsx`, `OptionCard.tsx`, `Timeline.tsx`, `RouteMap.tsx`, `LeafletRouteMap.tsx`, `LockedSection.tsx`, `HomeByList.tsx`, `CheckInCard.tsx`, `Expenses.tsx`, `OutcomeSummary.tsx`
- Test: `tests/e2e/outing.spec.ts`, `tests/e2e/db.ts`

**Interfaces:**
- Consumes: `api`, `OutingView`, `BottomSheet`, `StatusChip`, `Button`, `SwotPanel`, `formatRupees`, `parseRupees`, `localDate`, `localHHMM`.
- Produces: `labels.ts` exports `THEME_LABEL: Record<string, string>` (`relaxed` → "Easy-going day", `adventurous` → "Adventure day", `foodie` → "Food crawl"), `PROGRESS_LABEL: Record<string, string>`, `KIND_ICON: Record<SlotKind, string>`, `prettyDate(iso: string): string` ("Sat 18 Oct").
- UI contract: new outing — labels `Outing name`, `From`, `To`, checkbox `Set a group home-by time`, label `Group home by`, button `Create outing`. Availability — toggle buttons `Free on YYYY-MM-DD`, button `Save my dates`; manager buttons `Pick YYYY-MM-DD`, `Generate plans`. Voting — buttons `Vote for {theme label}`, RSVP buttons `Going` / `Maybe` / `Can't go`, manager `Lock plan`, `Regenerate`, tie sheet buttons `Lock {theme label}`. Locked — heading `Locked in`, cinema stop button `Set show time`, sheet label `Show time` + button `Save show time`, button `I can't make it`, sheet label `Reason (optional)` + button `Cancel my spot`, check-in buttons `Yes, I went` / `No, I didn't`. Expenses — button `Add expense`, sheet labels `Amount (₹)`, `What for`, checkboxes `Split with {name}`, button `Save expense`; transfer rows read `{from} pays {to} {₹amount}`. Manager `Cancel outing` → sheet button `Cancel this outing`.

- [ ] **Step 1: E2E DB helper `tests/e2e/db.ts`**

```ts
import { PrismaClient } from "@prisma/client";
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());
export const db = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL_TEST });

export function isoDay(offset: number) {
  // City-local (UTC+05:30) calendar date, offset in days from today.
  const d = new Date(Date.now() + 330 * 60_000 + offset * 86_400_000);
  return d.toISOString().slice(0, 10);
}
```

- [ ] **Step 2: Failing E2E spec `tests/e2e/outing.spec.ts`**

```ts
import { test, expect, type Page } from "@playwright/test";
import { newUser } from "./helpers";
import { db, isoDay } from "./db";

async function groupWithFriend(browser: import("@playwright/test").Browser) {
  const use = test.info().project.use;
  const a = await (await browser.newContext({ ...use })).newPage();
  await newUser(a, "Meera", "Female");
  await a.getByRole("button", { name: "New group" }).click();
  await a.getByLabel("Group name").fill("Beach Crew");
  await a.getByRole("button", { name: "Create group" }).click();
  const invite = await a.getByTestId("invite-link").getAttribute("data-path");
  const b = await (await browser.newContext({ ...use })).newPage();
  await b.goto(invite!);
  await newUser(b, "Kiran", "Male", /\/join\//);
  await b.getByRole("button", { name: "Join Beach Crew" }).click();
  await expect(b.getByRole("heading", { name: "Beach Crew" })).toBeVisible();
  await a.reload();
  return { a, b };
}

async function markFree(page: Page, url: string, day: string) {
  await page.goto(url);
  await page.getByRole("button", { name: `Free on ${day}` }).click();
  await page.getByRole("button", { name: "Save my dates" }).click();
  await expect(page.getByRole("status")).toHaveText(/saved/i);
}

test("full outing: dates → options → vote → lock → dropout → showtime → check-in → expenses", async ({ browser }) => {
  const { a, b } = await groupWithFriend(browser);
  const day = isoDay(2);

  // Create
  await a.getByRole("link", { name: "Plan an outing" }).click();
  await a.getByLabel("Outing name").fill("Beach day");
  await a.getByLabel("From").fill(isoDay(1));
  await a.getByLabel("To").fill(isoDay(5));
  await a.getByRole("button", { name: "Create outing" }).click();
  await expect(a).toHaveURL(/\/outings\/[a-z0-9]+$/);
  const url = new URL(a.url()).pathname;
  const outingId = url.split("/").pop()!;

  // Availability + pick date
  await markFree(a, url, day);
  await markFree(b, url, day);
  await a.reload();
  await a.getByRole("button", { name: `Pick ${day}` }).click();
  await a.getByRole("button", { name: "Generate plans" }).click();

  // Vote + RSVP
  await expect(a.getByRole("button", { name: "Vote for Easy-going day" })).toBeVisible({ timeout: 30_000 });
  for (const p of [a, b]) {
    await p.goto(url);
    await p.getByRole("button", { name: "Vote for Easy-going day" }).click();
    await p.getByRole("button", { name: "Going", exact: true }).click();
  }
  await a.reload();
  await a.getByRole("button", { name: "Lock plan" }).click();
  await expect(a.getByRole("heading", { name: "Locked in" })).toBeVisible();

  // Showtime override on the cinema stop
  await a.getByRole("button", { name: "Set show time" }).click();
  await a.getByLabel("Show time").fill("18:15");
  await a.getByRole("button", { name: "Save show time" }).click();
  await expect(a.getByText("18:15")).toBeVisible();

  // Friend drops out
  await b.reload();
  await b.getByRole("button", { name: "I can't make it" }).click();
  await b.getByLabel("Reason (optional)").fill("Work came up");
  await b.getByRole("button", { name: "Cancel my spot" }).click();
  await a.reload();
  await expect(a.getByText(/Kiran dropped out/)).toBeVisible();

  // Move the day into the past, then check in
  await db.outing.update({ where: { id: outingId }, data: { date: isoDay(-2) } });
  await a.reload();
  await a.getByRole("button", { name: "Yes, I went" }).click();
  await expect(a.getByText("✅ Happened").first()).toBeVisible();

  // Expenses + settle-up
  await a.getByRole("button", { name: "Add expense" }).click();
  await a.getByLabel("Amount (₹)").fill("600");
  await a.getByLabel("What for").fill("Lunch");
  await a.getByRole("checkbox", { name: "Split with Kiran" }).check();
  await a.getByRole("button", { name: "Save expense" }).click();
  await expect(a.getByText("Kiran pays Meera ₹300")).toBeVisible();
});

test("organiser can cancel an outing", async ({ browser }) => {
  const { a } = await groupWithFriend(browser);
  await a.getByRole("link", { name: "Plan an outing" }).click();
  await a.getByLabel("Outing name").fill("Movie night");
  await a.getByLabel("From").fill(isoDay(1));
  await a.getByLabel("To").fill(isoDay(2));
  await a.getByRole("button", { name: "Create outing" }).click();
  await a.getByRole("button", { name: "Cancel outing" }).click();
  await a.getByRole("button", { name: "Cancel this outing" }).click();
  await expect(a.getByText("🚫 Cancelled").first()).toBeVisible();
});
```

Run: `npm run test:e2e -- outing` → FAIL.

- [ ] **Step 3: `src/components/outing/labels.ts`**

```ts
import type { SlotKind } from "@/lib/engine/types";

export const THEME_LABEL: Record<string, string> = {
  relaxed: "Easy-going day",
  adventurous: "Adventure day",
  foodie: "Food crawl",
};

export const PROGRESS_LABEL: Record<string, string> = {
  sketching: "Sketching the day…",
  finding_venues: "Finding real places…",
  routing: "Working out everyone's routes…",
  checking_home: "Checking everyone gets home in time…",
  costing: "Adding up costs…",
  writing: "Writing it up…",
};

export const KIND_ICON: Record<SlotKind, string> = {
  cafe: "☕", restaurant: "🍽", gaming: "🎮", cinema: "🎬", beach: "🏖",
  park: "🌳", museum: "🏛", mall: "🛍", viewpoint: "🌇", street_food: "🌮",
};

const fmt = new Intl.DateTimeFormat("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
export function prettyDate(iso: string): string {
  return fmt.format(new Date(`${iso}T00:00:00Z`));
}
```

- [ ] **Step 4: Pages**

```tsx
// src/app/(app)/outings/[id]/page.tsx
import OutingScreen from "@/components/outing/OutingScreen";

export default async function OutingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <OutingScreen id={id} />;
}
```

```tsx
// src/app/(app)/outings/page.tsx
"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import StatusChip from "@/components/shell/StatusChip";
import { api, type OutingListItem } from "@/lib/api";
import { prettyDate } from "@/components/outing/labels";

const ACTIVE = ["collecting", "voting", "locked"];

export default function OutingsPage() {
  const [items, setItems] = useState<OutingListItem[] | null>(null);
  useEffect(() => { api.outings().then((r) => setItems(r.outings)).catch(() => setItems([])); }, []);

  const section = (title: string, list: OutingListItem[]) =>
    list.length > 0 && (
      <section className="mb-8">
        <h2 className="mb-3 font-mono text-xs uppercase tracking-widest text-cream-faint">{title}</h2>
        <ul className="space-y-2">
          {list.map((o) => (
            <li key={o.id}>
              <Link href={`/outings/${o.id}`} className="flex min-h-16 items-center justify-between gap-3 rounded-[var(--radius-card)] border border-line bg-surface px-4">
                <span className="min-w-0">
                  <span className="block truncate font-display">{o.title}</span>
                  <span className="text-xs text-cream-faint">{o.groupName} · {o.date ? prettyDate(o.date) : `${prettyDate(o.rangeStart)} – ${prettyDate(o.rangeEnd)}`}</span>
                </span>
                <StatusChip status={o.status} />
              </Link>
            </li>
          ))}
        </ul>
      </section>
    );

  return (
    <>
      <h1 className="mb-6 font-display text-2xl">Outings</h1>
      {items === null && <div className="h-20 animate-pulse rounded-[var(--radius-card)] bg-surface" />}
      {items?.length === 0 && <p className="text-cream-dim">No outings yet — start one from a group.</p>}
      {items && section("Coming up", items.filter((o) => ACTIVE.includes(o.status)))}
      {items && section("Past", items.filter((o) => !ACTIVE.includes(o.status)))}
    </>
  );
}
```

```tsx
// src/app/(app)/outings/new/page.tsx
"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/Button";
import { api } from "@/lib/api";
import { localDate } from "@/lib/time";

const input = "min-h-12 w-full rounded-2xl border border-line bg-surface px-4 outline-none focus:border-amber";
const label = "mb-2 block font-mono text-xs uppercase tracking-widest text-cream-faint";

function NewOuting() {
  const router = useRouter();
  const groupId = useSearchParams().get("group") ?? "";
  const today = localDate(new Date());
  const [title, setTitle] = useState("");
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [useHomeBy, setUseHomeBy] = useState(false);
  const [homeBy, setHomeBy] = useState("22:30");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await api.createOuting(groupId, { title, rangeStart: from, rangeEnd: to, groupHomeBy: useHomeBy ? homeBy : null });
      router.replace(`/outings/${r.outing.id}`);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <h1 className="font-display text-2xl">Plan an outing</h1>
      <label className="block"><span className={label}>Outing name</span>
        <input aria-label="Outing name" className={input} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Beach day" />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="block"><span className={label}>From</span>
          <input aria-label="From" type="date" min={today} className={input} value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label className="block"><span className={label}>To</span>
          <input aria-label="To" type="date" min={from} className={input} value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
      </div>
      <p className="text-xs text-cream-faint">Up to 14 days. Everyone marks which of these days they&apos;re free.</p>
      <label className="flex min-h-11 items-center gap-3 text-sm text-cream-dim">
        <input type="checkbox" aria-label="Set a group home-by time" checked={useHomeBy} onChange={(e) => setUseHomeBy(e.target.checked)} className="size-5 accent-amber" />
        Set a group home-by time
      </label>
      {useHomeBy && (
        <label className="block"><span className={label}>Group home by</span>
          <input aria-label="Group home by" type="time" className={input} value={homeBy} onChange={(e) => setHomeBy(e.target.value)} />
        </label>
      )}
      {error && <p role="alert" className="text-sm text-line-coral">{error}</p>}
      <Button type="submit" size="lg" className="w-full" disabled={busy || !title.trim() || !groupId}>Create outing</Button>
    </form>
  );
}

export default function NewOutingPage() {
  return <Suspense><NewOuting /></Suspense>;
}
```

- [ ] **Step 5: `OutingScreen.tsx` (status router, polling, actions)**

```tsx
"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { api, ApiError, type OutingView } from "@/lib/api";
import { Button } from "@/components/Button";
import BottomSheet from "@/components/shell/BottomSheet";
import StatusChip from "@/components/shell/StatusChip";
import CollectSection from "./CollectSection";
import VotingSection from "./VotingSection";
import LockedSection from "./LockedSection";
import OutcomeSummary from "./OutcomeSummary";
import Expenses from "./Expenses";
import { prettyDate } from "./labels";

export type Act = (fn: () => Promise<unknown>) => Promise<boolean>;

export default function OutingScreen({ id }: { id: string }) {
  const [view, setView] = useState<OutingView | null>(null);
  const [missing, setMissing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [reason, setReason] = useState("");

  const load = useCallback(async () => {
    try {
      setView(await api.outing(id));
      // The service worker may answer from cache; trust the browser's online flag.
      setOffline(typeof navigator !== "undefined" && !navigator.onLine);
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) setMissing(true);
      else setOffline(true);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const generating = view?.options.some((o) => o.status === "generating") ?? false;
  useEffect(() => {
    if (!generating) return;
    const t = setInterval(load, 2000);
    return () => clearInterval(t);
  }, [generating, load]);

  const act: Act = async (fn) => {
    setError(null);
    try {
      await fn();
      await load();
      return true;
    } catch (err) {
      setError((err as Error).message);
      return false;
    }
  };

  if (missing) return <p className="mt-10 text-center text-cream-dim">Outing not found.</p>;
  if (!view) return <div className="h-40 animate-pulse rounded-[var(--radius-card)] bg-surface" />;

  const { outing, me } = view;
  const finished = ["completed", "failed", "cancelled"].includes(outing.status);

  return (
    <>
      <header className="mb-5">
        <Link href={`/groups/${outing.groupId}`} className="text-sm text-cream-faint">← {outing.groupName}</Link>
        <div className="mt-2 flex items-start justify-between gap-3">
          <h1 className="font-display text-2xl">{outing.title}</h1>
          <StatusChip status={outing.status} />
        </div>
        <p className="text-sm text-cream-dim">
          {outing.date ? prettyDate(outing.date) : `${prettyDate(outing.rangeStart)} – ${prettyDate(outing.rangeEnd)}`}
          {outing.groupHomeBy && ` · everyone home by ${outing.groupHomeBy}`}
        </p>
        {offline && <p role="status" className="mt-2 text-xs text-amber">Offline — showing the last saved plan.</p>}
      </header>

      {error && <p role="alert" className="mb-4 rounded-2xl border border-line-coral px-4 py-3 text-sm text-line-coral">{error}</p>}

      {outing.status === "collecting" && <CollectSection view={view} act={act} />}
      {outing.status === "voting" && <VotingSection view={view} act={act} />}
      {outing.status === "locked" && <LockedSection view={view} act={act} />}
      {finished && <OutcomeSummary view={view} />}
      {["locked", "completed", "failed"].includes(outing.status) && <Expenses view={view} act={act} />}

      {me.canManage && !finished && (
        <div className="mt-10">
          <Button variant="ghost" size="sm" onClick={() => setCancelOpen(true)}>Cancel outing</Button>
        </div>
      )}
      <BottomSheet open={cancelOpen} onClose={() => setCancelOpen(false)} title="Cancel this outing?">
        <label className="mb-3 block">
          <span className="mb-2 block text-sm text-cream-dim">Reason (optional)</span>
          <input aria-label="Cancel reason" className="min-h-12 w-full rounded-2xl border border-line bg-canvas px-4" value={reason} onChange={(e) => setReason(e.target.value)} />
        </label>
        <Button className="w-full" onClick={async () => { if (await act(() => api.cancel(outing.id, reason || undefined))) setCancelOpen(false); }}>
          Cancel this outing
        </Button>
      </BottomSheet>
    </>
  );
}
```

- [ ] **Step 6: `CollectSection.tsx`**

```tsx
"use client";

import { useState } from "react";
import { Button } from "@/components/Button";
import { api, type OutingView } from "@/lib/api";
import type { Act } from "./OutingScreen";
import { prettyDate } from "./labels";

export default function CollectSection({ view, act }: { view: OutingView; act: Act }) {
  const { outing, me, dates, members } = view;
  const [free, setFree] = useState<string[]>(me.freeDates);
  const [saved, setSaved] = useState(false);
  const byDate = [...dates].sort((a, b) => a.date.localeCompare(b.date));
  const name = (id: string) => members.find((m) => m.id === id)?.name.split(" ")[0] ?? "?";

  return (
    <div className="space-y-8">
      <section>
        <h2 className="mb-3 font-display text-lg">When are you free?</h2>
        <div className="grid grid-cols-3 gap-2">
          {byDate.map((d) => {
            const on = free.includes(d.date);
            return (
              <button key={d.date} type="button" aria-label={`Free on ${d.date}`} aria-pressed={on}
                onClick={() => { setSaved(false); setFree(on ? free.filter((x) => x !== d.date) : [...free, d.date]); }}
                className={`min-h-14 rounded-2xl border text-sm ${on ? "border-amber bg-amber/15 text-amber" : "border-line text-cream-dim"}`}>
                {prettyDate(d.date)}
              </button>
            );
          })}
        </div>
        <Button className="mt-3 w-full" onClick={async () => { if (await act(() => api.setAvailability(outing.id, free))) setSaved(true); }}>
          Save my dates
        </Button>
        {saved && <p role="status" className="mt-2 text-sm text-line-lime">Saved.</p>}
      </section>

      <section>
        <h2 className="mb-3 font-display text-lg">Best days so far</h2>
        <ul className="space-y-2">
          {dates.filter((d) => d.freeCount > 0).slice(0, 5).map((d) => (
            <li key={d.date} className="flex min-h-14 items-center justify-between gap-3 rounded-2xl bg-surface px-4">
              <span>
                <span className="block">{prettyDate(d.date)}</span>
                <span className="text-xs text-cream-faint">{d.freeCount} free · {d.freeUserIds.map(name).join(", ")}</span>
              </span>
              {me.canManage && (
                <Button size="sm" variant={outing.date === d.date ? "primary" : "outline"} aria-label={`Pick ${d.date}`}
                  onClick={() => act(() => api.confirmDate(outing.id, d.date))}>
                  {outing.date === d.date ? "Picked" : "Pick"}
                </Button>
              )}
            </li>
          ))}
        </ul>
        {dates.every((d) => d.freeCount === 0) && <p className="text-sm text-cream-dim">Nobody has marked dates yet.</p>}
      </section>

      {outing.date && (
        <section className="rounded-[var(--radius-card)] border border-amber/40 p-4">
          <p className="mb-3">Going with <strong>{prettyDate(outing.date)}</strong>.</p>
          {me.canManage ? (
            <Button size="lg" className="w-full" onClick={() => act(() => api.generate(outing.id))}>Generate plans</Button>
          ) : (
            <p className="text-sm text-cream-dim">Waiting for the organiser to generate plans.</p>
          )}
        </section>
      )}
    </div>
  );
}
```

- [ ] **Step 7: `Timeline.tsx`, `HomeByList.tsx`, route map**

```tsx
// src/components/outing/Timeline.tsx
import type { Stop } from "@/lib/engine/types";
import { localHHMM } from "@/lib/time";
import { KIND_ICON } from "./labels";

export default function Timeline({ stops, onShowtime }: { stops: Stop[]; onShowtime?: (index: number) => void }) {
  return (
    <ol className="space-y-3">
      {stops.map((s, i) => (
        <li key={`${s.venue.id}-${i}`} className="flex gap-3">
          <span className="w-12 shrink-0 pt-0.5 font-mono text-sm text-amber">{localHHMM(new Date(s.startsAt))}</span>
          <span className="min-w-0 flex-1">
            <span className="block truncate">{KIND_ICON[s.slot.kind]} {s.venue.name}</span>
            <span className="block text-xs text-cream-faint">
              {s.slot.vibe}{s.venue.rating ? ` · ★ ${s.venue.rating.toFixed(1)}` : ""} · until {localHHMM(new Date(s.endsAt))}
            </span>
            {s.film && <span className="block text-xs text-cream-dim">🎞 {s.film.title} ({s.film.genres.slice(0, 2).join(", ")})</span>}
            {s.slot.kind === "cinema" && onShowtime && (
              <button className="mt-1 min-h-11 text-xs text-amber" onClick={() => onShowtime(i)}>Set show time</button>
            )}
          </span>
        </li>
      ))}
    </ol>
  );
}
```

```tsx
// src/components/outing/HomeByList.tsx
import type { HomeByEntry } from "@/lib/engine/types";
import type { PublicMember } from "@/lib/serialize";
import { localHHMM } from "@/lib/time";

export default function HomeByList({ report, members }: { report: HomeByEntry[]; members: PublicMember[] }) {
  return (
    <ul className="space-y-1.5">
      {report.map((h) => {
        const name = members.find((m) => m.id === h.attendeeId)?.name ?? "Someone";
        return (
          <li key={h.attendeeId} className="flex items-center justify-between text-sm">
            <span>{h.ok ? "✅" : "⚠️"} {name}</span>
            <span className={h.ok ? "text-cream-dim" : "text-line-coral"}>
              home {localHHMM(new Date(h.arriveHomeAt))}
              {h.deadline && ` / needs ${h.deadline}`}
              {h.reason === "no_service" && " · no transit then"}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
```

```tsx
// src/components/outing/LeafletRouteMap.tsx
"use client";

import { CircleMarker, MapContainer, Polyline, TileLayer, Tooltip } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import type { Leg, Stop } from "@/lib/engine/types";

export default function LeafletRouteMap({ stops, legs }: { stops: Stop[]; legs: Leg[] }) {
  const lat = stops.reduce((s, x) => s + x.venue.lat, 0) / stops.length;
  const lng = stops.reduce((s, x) => s + x.venue.lng, 0) / stops.length;
  return (
    <MapContainer center={[lat, lng]} zoom={12} className="h-56 w-full rounded-[var(--radius-card)]" attributionControl={false} scrollWheelZoom={false}>
      <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
      {legs.filter((l) => l.route.geometry).map((l, i) => (
        <Polyline key={i} positions={l.route.geometry!} pathOptions={{ color: "#ffb454", weight: 4, opacity: 0.8 }} />
      ))}
      {stops.map((s, i) => (
        <CircleMarker key={s.venue.id} center={[s.venue.lat, s.venue.lng]} radius={9} pathOptions={{ color: "#f4f1e8", fillColor: "#ffb454", fillOpacity: 1 }}>
          <Tooltip permanent direction="top">{i + 1}</Tooltip>
        </CircleMarker>
      ))}
    </MapContainer>
  );
}
```

```tsx
// src/components/outing/RouteMap.tsx
"use client";

import dynamic from "next/dynamic";

export default dynamic(() => import("./LeafletRouteMap"), {
  ssr: false,
  loading: () => <div className="h-56 w-full animate-pulse rounded-[var(--radius-card)] bg-surface" />,
});
```

- [ ] **Step 8: `OptionCard.tsx` and `VotingSection.tsx`**

```tsx
// src/components/outing/OptionCard.tsx
"use client";

import SwotPanel from "@/components/SwotPanel";
import { Button } from "@/components/Button";
import type { OutingView } from "@/lib/api";
import { formatRupees } from "@/lib/money";
import Timeline from "./Timeline";
import HomeByList from "./HomeByList";
import { PROGRESS_LABEL, THEME_LABEL } from "./labels";

type Option = OutingView["options"][number];

export default function OptionCard({
  option, members, myVote, onVote,
}: { option: Option; members: OutingView["members"]; myVote: boolean; onVote?: () => void }) {
  const label = THEME_LABEL[option.theme] ?? option.theme;
  if (option.status === "generating") {
    return (
      <article className="rounded-[var(--radius-card)] border border-line bg-surface p-4">
        <h3 className="font-display text-lg">{label}</h3>
        <p className="mt-3 animate-pulse text-sm text-cream-dim">{PROGRESS_LABEL[option.progress ?? "sketching"]}</p>
      </article>
    );
  }
  if (option.status === "failed") {
    return (
      <article className="rounded-[var(--radius-card)] border border-line-coral/50 bg-surface p-4">
        <h3 className="font-display text-lg">{label}</h3>
        <p className="mt-2 text-sm text-line-coral">{option.error}</p>
      </article>
    );
  }
  const avg = option.costs.reduce((s, c) => s + c.total, 0) / Math.max(1, option.costs.length);
  const problems = option.homeByReport.filter((h) => !h.ok).length;

  return (
    <article className={`rounded-[var(--radius-card)] border bg-surface p-4 ${myVote ? "border-amber" : "border-line"}`}>
      <header className="mb-3 flex items-start justify-between gap-2">
        <h3 className="font-display text-lg">{label}</h3>
        <span className="font-mono text-xs text-cream-faint">{option.voteCount} vote{option.voteCount === 1 ? "" : "s"}</span>
      </header>
      {option.narrative && <p className="mb-4 text-sm text-cream-dim">{option.narrative.summary}</p>}
      <Timeline stops={option.stops} />
      <dl className="mt-4 grid grid-cols-2 gap-2 text-sm">
        <div className="rounded-2xl bg-canvas p-3"><dt className="text-xs text-cream-faint">Per person</dt><dd>~{formatRupees(avg)}</dd></div>
        <div className="rounded-2xl bg-canvas p-3"><dt className="text-xs text-cream-faint">Home on time</dt><dd>{problems === 0 ? "Everyone" : `${problems} at risk`}</dd></div>
      </dl>
      {option.approximateTransit && <p className="mt-2 text-xs text-cream-faint">Public transport times are estimates.</p>}
      <details className="mt-3">
        <summary className="min-h-11 cursor-pointer py-2 text-sm text-amber">Who gets home when</summary>
        <HomeByList report={option.homeByReport} members={members} />
      </details>
      {option.narrative && (
        <details className="mt-1">
          <summary className="min-h-11 cursor-pointer py-2 text-sm text-amber">Pros and cons</summary>
          <SwotPanel swot={option.narrative.swot} />
        </details>
      )}
      {onVote && (
        <Button className="mt-4 w-full" variant={myVote ? "primary" : "outline"} aria-label={`Vote for ${label}`} aria-pressed={myVote} onClick={onVote}>
          {myVote ? "Your vote" : "Vote for this"}
        </Button>
      )}
    </article>
  );
}
```

```tsx
// src/components/outing/VotingSection.tsx
"use client";

import { useState } from "react";
import { Button } from "@/components/Button";
import BottomSheet from "@/components/shell/BottomSheet";
import { api, ApiError, type OutingView } from "@/lib/api";
import type { Act } from "./OutingScreen";
import OptionCard from "./OptionCard";
import { THEME_LABEL } from "./labels";

const RSVP = [["going", "Going"], ["maybe", "Maybe"], ["no", "Can't go"]] as const;

export default function VotingSection({ view, act }: { view: OutingView; act: Act }) {
  const { outing, me, options, members } = view;
  const [tied, setTied] = useState<string[] | null>(null);
  const going = view.rsvps.filter((r) => r.status === "going").length;

  async function lock(optionId?: string) {
    try {
      await api.lock(outing.id, optionId);
      setTied(null);
      await act(async () => {});
    } catch (err) {
      if (err instanceof ApiError && err.status === 409 && err.data?.tiedOptionIds) setTied(err.data.tiedOptionIds);
      else await act(() => Promise.reject(err));
    }
  }

  return (
    <div className="space-y-6">
      <div className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2">
        {options.map((o) => (
          <div key={o.id} className="w-[86%] shrink-0 snap-center">
            <OptionCard option={o} members={members} myVote={me.voteOptionId === o.id}
              onVote={o.status === "ready" ? () => act(() => api.vote(outing.id, o.id)) : undefined} />
          </div>
        ))}
      </div>

      <section>
        <h2 className="mb-2 font-display text-lg">Are you in? <span className="text-sm text-cream-faint">({going} going)</span></h2>
        <div className="grid grid-cols-3 gap-2">
          {RSVP.map(([v, l]) => (
            <Button key={v} variant={me.rsvp === v ? "primary" : "outline"} aria-pressed={me.rsvp === v} onClick={() => act(() => api.rsvp(outing.id, v))}>
              {l}
            </Button>
          ))}
        </div>
      </section>

      {me.canManage && (
        <section className="flex gap-2">
          <Button className="flex-1" onClick={() => lock()}>Lock plan</Button>
          <Button variant="ghost" onClick={() => act(() => api.generate(outing.id))}>Regenerate</Button>
        </section>
      )}

      <BottomSheet open={!!tied} onClose={() => setTied(null)} title="It's a tie — pick one">
        <div className="space-y-2">
          {tied?.map((id) => {
            const label = THEME_LABEL[options.find((o) => o.id === id)?.theme ?? ""] ?? "Option";
            return <Button key={id} className="w-full" variant="outline" onClick={() => lock(id)}>Lock {label}</Button>;
          })}
        </div>
      </BottomSheet>
    </div>
  );
}
```

In the E2E spec, both users vote for the same option, so `Lock plan` locks without a tie.

- [ ] **Step 9: `LockedSection.tsx` and `CheckInCard.tsx`**

```tsx
// src/components/outing/CheckInCard.tsx
"use client";

import { Button } from "@/components/Button";
import { api, type OutingView } from "@/lib/api";
import type { Act } from "./OutingScreen";

export default function CheckInCard({ view, act }: { view: OutingView; act: Act }) {
  if (view.me.checkIn !== null) {
    return <p className="rounded-2xl bg-surface px-4 py-3 text-sm text-cream-dim">Thanks — you said you {view.me.checkIn ? "went" : "didn't go"}.</p>;
  }
  return (
    <section className="rounded-[var(--radius-card)] border border-amber/50 p-4">
      <h2 className="mb-3 font-display text-lg">Did you go?</h2>
      <div className="grid grid-cols-2 gap-2">
        <Button onClick={() => act(() => api.checkin(view.outing.id, true))}>Yes, I went</Button>
        <Button variant="outline" onClick={() => act(() => api.checkin(view.outing.id, false))}>No, I didn&apos;t</Button>
      </div>
    </section>
  );
}
```

```tsx
// src/components/outing/LockedSection.tsx
"use client";

import { useState } from "react";
import { Button } from "@/components/Button";
import BottomSheet from "@/components/shell/BottomSheet";
import { api, type OutingView } from "@/lib/api";
import { formatRupees } from "@/lib/money";
import { localDate } from "@/lib/time";
import type { Act } from "./OutingScreen";
import Timeline from "./Timeline";
import HomeByList from "./HomeByList";
import RouteMap from "./RouteMap";
import CheckInCard from "./CheckInCard";
import { THEME_LABEL } from "./labels";

const field = "min-h-12 w-full rounded-2xl border border-line bg-canvas px-4 outline-none focus:border-amber";

export default function LockedSection({ view, act }: { view: OutingView; act: Act }) {
  const { outing, me, members } = view;
  const option = view.options.find((o) => o.id === outing.lockedOptionId);
  const [showtimeFor, setShowtimeFor] = useState<number | null>(null);
  const [time, setTime] = useState("18:00");
  const [leaving, setLeaving] = useState(false);
  const [reason, setReason] = useState("");
  if (!option) return null;

  const myLegs = option.routes.filter((l) => l.attendeeId === me.id);
  const legs = myLegs.length > 0 ? myLegs : option.routes.filter((l) => l.from !== "home" && l.to !== "home");
  const mine = option.costs.find((c) => c.attendeeId === me.id);
  const dayReached = outing.date !== null && localDate(new Date()) >= outing.date;
  const dropouts = view.rsvps.filter((r) => r.status === "cancelled");
  const nameOf = (id: string) => members.find((m) => m.id === id)?.name.split(" ")[0] ?? "Someone";

  return (
    <div className="space-y-6">
      <h2 className="font-display text-xl">Locked in</h2>
      <p className="-mt-4 text-sm text-cream-dim">{THEME_LABEL[option.theme]}</p>

      {me.rsvp === "going" && dayReached && <CheckInCard view={view} act={act} />}

      <RouteMap stops={option.stops} legs={legs} />
      <Timeline stops={option.stops} onShowtime={me.rsvp === "going" || me.canManage ? (i) => setShowtimeFor(i) : undefined} />

      <section>
        <h3 className="mb-2 font-mono text-xs uppercase tracking-widest text-cream-faint">Getting home</h3>
        <HomeByList report={option.homeByReport} members={members} />
      </section>

      {mine && (
        <section className="rounded-2xl bg-surface p-4 text-sm">
          <h3 className="mb-2 font-mono text-xs uppercase tracking-widest text-cream-faint">Your estimate</h3>
          <p>Tickets {formatRupees(mine.entry)} · Food {formatRupees(mine.food)} · Travel {formatRupees(mine.travel)}</p>
          <p className="mt-1 font-display text-lg">{formatRupees(mine.total)}</p>
        </section>
      )}

      {dropouts.length > 0 && (
        <ul className="space-y-1 text-sm text-cream-dim">
          {dropouts.map((d) => <li key={d.userId}>{nameOf(d.userId)} dropped out{d.cancelReason ? ` — ${d.cancelReason}` : ""}</li>)}
        </ul>
      )}

      {me.rsvp === "going" && !dayReached && (
        <Button variant="ghost" onClick={() => setLeaving(true)}>I can&apos;t make it</Button>
      )}

      <BottomSheet open={showtimeFor !== null} onClose={() => setShowtimeFor(null)} title="When's the show?">
        <label className="mb-3 block">
          <span className="mb-2 block text-sm text-cream-dim">Show time</span>
          <input aria-label="Show time" type="time" className={field} value={time} onChange={(e) => setTime(e.target.value)} />
        </label>
        <Button className="w-full" onClick={async () => { if (await act(() => api.showtime(outing.id, showtimeFor!, time))) setShowtimeFor(null); }}>
          Save show time
        </Button>
      </BottomSheet>

      <BottomSheet open={leaving} onClose={() => setLeaving(false)} title="Can't make it?">
        <label className="mb-3 block">
          <span className="mb-2 block text-sm text-cream-dim">Reason (optional)</span>
          <input aria-label="Reason (optional)" className={field} value={reason} onChange={(e) => setReason(e.target.value)} />
        </label>
        <Button className="w-full" onClick={async () => { if (await act(() => api.rsvp(outing.id, "cancelled", reason || undefined))) setLeaving(false); }}>
          Cancel my spot
        </Button>
      </BottomSheet>
    </div>
  );
}
```

- [ ] **Step 10: `OutcomeSummary.tsx` and `Expenses.tsx`**

```tsx
// src/components/outing/OutcomeSummary.tsx
import type { OutingView } from "@/lib/api";
import StatusChip from "@/components/shell/StatusChip";

export default function OutcomeSummary({ view }: { view: OutingView }) {
  const { outing, members, checkIns, rsvps } = view;
  const name = (id: string) => members.find((m) => m.id === id)?.name ?? "Someone";
  const came = checkIns.filter((c) => c.attended).map((c) => name(c.userId));
  const dropped = rsvps.filter((r) => r.status === "cancelled");

  return (
    <section className="space-y-3 rounded-[var(--radius-card)] border border-line p-4">
      <StatusChip status={outing.status} />
      {outing.status === "cancelled" && outing.cancelReason && <p className="text-sm text-cream-dim">Reason: {outing.cancelReason}</p>}
      {came.length > 0 && <p className="text-sm">Came: {came.join(", ")}</p>}
      {dropped.length > 0 && (
        <ul className="text-sm text-cream-dim">
          {dropped.map((d) => (
            <li key={d.userId}>
              {name(d.userId)} dropped out{d.cancelledAt ? ` on ${new Date(d.cancelledAt).toLocaleDateString("en-IN")}` : ""}
              {d.cancelReason ? ` — ${d.cancelReason}` : ""}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
```

The E2E expects `Kiran dropped out` while still `locked` (rendered by `LockedSection`) — both sections use the same wording.

```tsx
// src/components/outing/Expenses.tsx
"use client";

import { useState } from "react";
import { Button } from "@/components/Button";
import BottomSheet from "@/components/shell/BottomSheet";
import { api, type OutingView } from "@/lib/api";
import { formatRupees, parseRupees } from "@/lib/money";
import type { Act } from "./OutingScreen";

const field = "min-h-12 w-full rounded-2xl border border-line bg-canvas px-4 outline-none focus:border-amber";

export default function Expenses({ view, act }: { view: OutingView; act: Act }) {
  const { outing, me, members, expenses, transfers, rsvps } = view;
  const first = (id: string) => members.find((m) => m.id === id)?.name.split(" ")[0] ?? "Someone";
  const goingIds = rsvps.filter((r) => r.status === "going").map((r) => r.userId);
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [split, setSplit] = useState<string[]>(goingIds.includes(me.id) ? goingIds : [me.id, ...goingIds]);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    const paise = parseRupees(amount);
    if (!paise) return setError("Enter an amount.");
    if (await act(() => api.addExpense(outing.id, { amount: paise, note, stopIndex: null, splitAmong: split }))) {
      setOpen(false);
      setAmount("");
      setNote("");
      setError(null);
    }
  }

  return (
    <section className="mt-8 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-lg">Expenses</h2>
        <Button size="sm" variant="outline" onClick={() => setOpen(true)}>Add expense</Button>
      </div>
      {expenses.length === 0 && <p className="text-sm text-cream-dim">Nothing logged yet.</p>}
      <ul className="space-y-1.5">
        {expenses.map((e) => (
          <li key={e.id} className="flex min-h-11 items-center justify-between gap-3 text-sm">
            <span className="min-w-0 truncate">{e.note} · paid by {first(e.paidById)}</span>
            <span className="flex items-center gap-2">
              {formatRupees(e.amount)}
              {(e.paidById === me.id || me.role === "admin") && (
                <button aria-label={`Delete ${e.note}`} className="min-h-11 px-2 text-cream-faint" onClick={() => act(() => api.deleteExpense(outing.id, e.id))}>✕</button>
              )}
            </span>
          </li>
        ))}
      </ul>
      {transfers.length > 0 && (
        <div className="rounded-2xl bg-surface p-4">
          <h3 className="mb-2 font-mono text-xs uppercase tracking-widest text-cream-faint">Settle up</h3>
          <ul className="space-y-1 text-sm">
            {transfers.map((t, i) => <li key={i}>{first(t.from)} pays {first(t.to)} {formatRupees(t.amount)}</li>)}
          </ul>
        </div>
      )}

      <BottomSheet open={open} onClose={() => setOpen(false)} title="Add expense">
        <div className="space-y-3">
          <label className="block"><span className="mb-2 block text-sm text-cream-dim">Amount (₹)</span>
            <input aria-label="Amount (₹)" inputMode="decimal" className={field} value={amount} onChange={(e) => setAmount(e.target.value)} />
          </label>
          <label className="block"><span className="mb-2 block text-sm text-cream-dim">What for</span>
            <input aria-label="What for" className={field} value={note} onChange={(e) => setNote(e.target.value)} />
          </label>
          <fieldset className="space-y-1">
            <legend className="mb-1 text-sm text-cream-dim">Split between</legend>
            {members.map((m) => (
              <label key={m.id} className="flex min-h-11 items-center gap-3">
                <input type="checkbox" aria-label={`Split with ${m.name.split(" ")[0]}`} className="size-5 accent-amber"
                  checked={split.includes(m.id)}
                  onChange={(e) => setSplit(e.target.checked ? [...split, m.id] : split.filter((x) => x !== m.id))} />
                {m.name}
              </label>
            ))}
          </fieldset>
          {error && <p role="alert" className="text-sm text-line-coral">{error}</p>}
          <Button className="w-full" onClick={save} disabled={!note.trim() || split.length === 0}>Save expense</Button>
        </div>
      </BottomSheet>
    </section>
  );
}
```

E2E check: Meera is going, Kiran cancelled, so the default split is `[Meera]`; the spec ticks `Split with Kiran` → split `[Meera, Kiran]`; ₹600 → `Kiran pays Meera ₹300`. ✓

- [ ] **Step 11: Run** — `npx tsc --noEmit && npm run lint && npm run test:e2e -- outing` → PASS. Then walk the outing flow by hand at 375px: option cards swipe and snap, the RSVP buttons are reachable with a thumb, sheets don't hide behind the keyboard, and nothing overflows horizontally (`document.documentElement.scrollWidth <= innerWidth`).

- [ ] **Step 12: Commit**

```bash
git add -A
git commit -m "feat: mobile outing screens — availability, options, voting, locked plan, check-in, expenses"
```

---
### Task 27: PWA — manifest, icons, service worker, offline itinerary, install prompt, push toggle

**Files:**
- Create: `src/app/manifest.ts`, `src/app/pwa-icon/[size]/route.tsx`, `src/app/offline/page.tsx`, `public/sw.js`
- Create: `src/components/shell/ServiceWorker.tsx`, `src/components/shell/InstallPrompt.tsx`, `src/components/shell/PushToggle.tsx`
- Modify: `src/app/layout.tsx` (metadata + `<ServiceWorker />`), `src/components/shell/AppShell.tsx` (`<InstallPrompt />`), `src/app/(app)/profile/page.tsx` (`<PushToggle />`, clear caches on sign-out), `next.config.ts` (sw headers), `playwright.config.ts` (`NEXT_PUBLIC_SW_DEV: "1"`)
- Test: `tests/e2e/pwa.spec.ts`

**Interfaces:**
- Manifest at `/manifest.webmanifest`: `name: "Waypoint"`, `display: "standalone"`, `start_url: "/groups"`, `theme_color`/`background_color: "#17162a"`, PNG icons at `/pwa-icon/192` and `/pwa-icon/512` (+ maskable), apple icon `/pwa-icon/180`.
- `public/sw.js`: precaches `/offline`; network-first for `GET /api/outings/:id`, storing the response only when `outing.status === "locked"`; network-first for navigations with cached fallback for `/outings/*`, then `/offline`; cache-first for `/_next/static/*`; shows push notifications and focuses/opens `data.url` on click.
- `ServiceWorker` registers `/sw.js` in production, or in dev when `NEXT_PUBLIC_SW_DEV === "1"`.
- `InstallPrompt`: shown inside the app shell when the user has ≥ 1 outing, the app isn't already installed, and it wasn't dismissed (`localStorage["waypoint.install.dismissed"]`). Android/desktop: button `Install Waypoint` (uses `beforeinstallprompt`). iOS Safari: text "Tap Share, then Add to Home Screen". Button `Not now` dismisses.
- `PushToggle`: button `Turn on notifications` / `Turn off notifications`; hidden with an explanation when push isn't supported or `NEXT_PUBLIC_VAPID_PUBLIC_KEY` is empty.

- [ ] **Step 1: Failing E2E `tests/e2e/pwa.spec.ts`**

```ts
import { test, expect, type Page } from "@playwright/test";
import { newUser } from "./helpers";
import { isoDay } from "./db";

test("manifest and icons are valid", async ({ request }) => {
  const res = await request.get("/manifest.webmanifest");
  expect(res.ok()).toBe(true);
  const m = await res.json();
  expect(m).toMatchObject({ name: "Waypoint", display: "standalone", start_url: "/groups" });
  for (const icon of m.icons) {
    const r = await request.get(icon.src);
    expect(r.headers()["content-type"]).toContain("image/png");
  }
});

async function lockedOuting(a: Page, b: Page) {
  const g = await (await a.request.post("/api/groups", { data: { name: "PWA Crew" } })).json();
  const detail = await (await a.request.get(`/api/groups/${g.group.id}`)).json();
  await b.request.post(`/api/join/${detail.group.inviteCode}`);
  const day = isoDay(2);
  const o = await (await a.request.post(`/api/groups/${g.group.id}/outings`, {
    data: { title: "Offline day", rangeStart: isoDay(1), rangeEnd: isoDay(3), groupHomeBy: null },
  })).json();
  const id = o.outing.id as string;
  for (const p of [a, b]) await p.request.put(`/api/outings/${id}/availability`, { data: { free: [day] } });
  await a.request.post(`/api/outings/${id}/confirm-date`, { data: { date: day } });
  const gen = await (await a.request.post(`/api/outings/${id}/generate`)).json();
  for (const p of [a, b]) {
    await p.request.put(`/api/outings/${id}/vote`, { data: { optionId: gen.optionIds[0] } });
    await p.request.put(`/api/outings/${id}/rsvp`, { data: { status: "going" } });
  }
  await a.request.post(`/api/outings/${id}/lock`, { data: {} });
  return id;
}

test("a locked outing opens offline", async ({ browser }) => {
  const use = test.info().project.use;
  const ctxA = await browser.newContext({ ...use });
  const a = await ctxA.newPage();
  const b = await (await browser.newContext({ ...use })).newPage();
  await newUser(a, "Offa");
  await newUser(b, "Lina", "Female");
  const id = await lockedOuting(a, b);

  await a.goto(`/outings/${id}`);
  await a.evaluate(() => navigator.serviceWorker.ready);
  await a.reload(); // now controlled by the SW: page, chunks and API response get cached
  await expect(a.getByRole("heading", { name: "Locked in" })).toBeVisible();

  await ctxA.setOffline(true);
  await a.reload();
  await expect(a.getByRole("heading", { name: "Locked in" })).toBeVisible();
  await expect(a.getByText(/Offline — showing the last saved plan/)).toBeVisible();
  await ctxA.setOffline(false);
});

test("install prompt appears after the first outing and can be dismissed", async ({ browser }) => {
  const use = test.info().project.use;
  const a = await (await browser.newContext({ ...use })).newPage();
  const b = await (await browser.newContext({ ...use })).newPage();
  await newUser(a, "Inst");
  await newUser(b, "Allie");
  await expect(a.getByText(/Install Waypoint|Add to Home Screen/)).toHaveCount(0);
  await lockedOuting(a, b);
  await a.goto("/groups");
  await expect(a.getByRole("button", { name: "Not now" })).toBeVisible();
  await a.getByRole("button", { name: "Not now" }).click();
  await a.reload();
  await expect(a.getByRole("button", { name: "Not now" })).toHaveCount(0);
});
```

Add `NEXT_PUBLIC_SW_DEV: "1"` to `webServer.env` in `playwright.config.ts`. Run `npm run test:e2e -- pwa` → FAIL.

Note: Chromium only fires `beforeinstallprompt` for installable, engaged sites, so in the test the banner shows the generic copy (see `InstallPrompt` below: when there's no deferred prompt and it's not iOS, it says "Add Waypoint to your home screen from your browser menu") with the `Not now` button. That is what the spec asserts.

- [ ] **Step 2: Manifest, icons, offline page**

Read `node_modules/next/dist/docs/01-app/02-guides/progressive-web-apps.md` and `…/03-api-reference/03-file-conventions/01-metadata/manifest.md` first.

```ts
// src/app/manifest.ts
import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Waypoint",
    short_name: "Waypoint",
    description: "Plan days out that work for the whole group.",
    start_url: "/groups",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#17162a",
    theme_color: "#17162a",
    icons: [
      { src: "/pwa-icon/192", sizes: "192x192", type: "image/png" },
      { src: "/pwa-icon/512", sizes: "512x512", type: "image/png" },
      { src: "/pwa-icon/512", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
```

```tsx
// src/app/pwa-icon/[size]/route.tsx
import { ImageResponse } from "next/og";

const SIZES = new Set([180, 192, 512]);

export async function GET(_req: Request, { params }: { params: Promise<{ size: string }> }) {
  const size = Number((await params).size);
  if (!SIZES.has(size)) return new Response("Not found", { status: 404 });
  const dot = Math.round(size * 0.38);
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#17162a" }}>
        <div style={{ width: dot, height: dot, borderRadius: 9999, background: "#ffb454", boxShadow: `0 0 0 ${Math.round(size * 0.05)}px rgba(255,180,84,0.25)` }} />
      </div>
    ),
    { width: size, height: size }
  );
}
```

```tsx
// src/app/offline/page.tsx
import Wordmark from "@/components/Wordmark";

export const dynamic = "force-static";

export default function Offline() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-4 pt-[max(1rem,env(safe-area-inset-top))]">
      <Wordmark />
      <h1 className="mt-16 font-display text-2xl">You&apos;re offline</h1>
      <p className="mt-2 text-cream-dim">Locked plans you&apos;ve opened before still work offline. Everything else comes back when you reconnect.</p>
    </main>
  );
}
```

In `src/app/layout.tsx` extend `metadata`:

```ts
  appleWebApp: { capable: true, title: "Waypoint", statusBarStyle: "black-translucent" },
  icons: { apple: "/pwa-icon/180" },
```

and render `<ServiceWorker />` as the last child of `<body>`.

- [ ] **Step 3: `public/sw.js`**

```js
// Waypoint service worker. Hand-written; bump VERSION to invalidate caches.
const VERSION = "waypoint-v1";
const SHELL = ["/offline"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

async function put(req, res) {
  const cache = await caches.open(VERSION);
  await cache.put(req, res);
}

async function lockedOutingResponse(res) {
  try {
    const body = await res.clone().json();
    return body && body.outing && body.outing.status === "locked";
  } catch {
    return false;
  }
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Outing detail API: network first; keep a copy only for locked plans.
  if (/^\/api\/outings\/[^/]+$/.test(url.pathname)) {
    event.respondWith(
      fetch(req)
        .then(async (res) => {
          if (res.ok && (await lockedOutingResponse(res))) await put(req, res.clone());
          return res;
        })
        .catch(async () => (await caches.match(req)) || Response.error())
    );
    return;
  }

  // Page navigations: network first; outing pages are kept for offline use.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok && url.pathname.startsWith("/outings/")) put(req, res.clone());
          return res;
        })
        .catch(async () => (await caches.match(req)) || (await caches.match("/offline")) || Response.error())
    );
    return;
  }

  // Build assets are content-hashed: cache first.
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      caches.match(req).then(
        (hit) => hit || fetch(req).then((res) => { if (res.ok) put(req, res.clone()); return res; })
      )
    );
  }
});

self.addEventListener("push", (event) => {
  const data = event.data ? event.data.json() : {};
  event.waitUntil(
    self.registration.showNotification(data.title || "Waypoint", {
      body: data.body,
      icon: "/pwa-icon/192",
      badge: "/pwa-icon/192",
      data: { url: data.url || "/" },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if ("focus" in c) {
          c.navigate(url);
          return c.focus();
        }
      }
      return self.clients.openWindow(url);
    })
  );
});
```

In `next.config.ts` add (merge with the existing config object):

```ts
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
    ];
  },
```

- [ ] **Step 4: Client components**

```tsx
// src/components/shell/ServiceWorker.tsx
"use client";

import { useEffect } from "react";

export default function ServiceWorker() {
  useEffect(() => {
    const enabled = process.env.NODE_ENV === "production" || process.env.NEXT_PUBLIC_SW_DEV === "1";
    if (!enabled || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch(() => {});
  }, []);
  return null;
}
```

```tsx
// src/components/shell/InstallPrompt.tsx
"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/Button";
import { api } from "@/lib/api";

const KEY = "waypoint.install.dismissed";
type BIP = Event & { prompt: () => Promise<void> };

export default function InstallPrompt() {
  const [show, setShow] = useState(false);
  const [deferred, setDeferred] = useState<BIP | null>(null);
  const [ios, setIos] = useState(false);

  useEffect(() => {
    const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone;
    let dismissed = false;
    try { dismissed = localStorage.getItem(KEY) === "1"; } catch {}
    if (standalone || dismissed) return;
    setIos(/iphone|ipad|ipod/i.test(navigator.userAgent));
    const onPrompt = (e: Event) => { e.preventDefault(); setDeferred(e as BIP); };
    window.addEventListener("beforeinstallprompt", onPrompt);
    api.outings().then((r) => setShow(r.outings.length > 0)).catch(() => {});
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  if (!show) return null;
  const dismiss = () => { try { localStorage.setItem(KEY, "1"); } catch {} setShow(false); };

  return (
    <div className="fixed inset-x-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-30 px-4 pb-2">
      <div className="mx-auto flex max-w-md items-center gap-3 rounded-[var(--radius-card)] border border-amber/40 bg-surface p-3 text-sm shadow-lg">
        <p className="flex-1">
          {deferred ? "Install Waypoint for quick access and offline plans."
            : ios ? "Tap Share, then Add to Home Screen to install Waypoint."
            : "Add Waypoint to your home screen from your browser menu."}
        </p>
        {deferred && <Button size="sm" onClick={async () => { await deferred.prompt(); dismiss(); }}>Install Waypoint</Button>}
        <button className="min-h-11 px-2 text-cream-faint" onClick={dismiss}>Not now</button>
      </div>
    </div>
  );
}
```

Mount `<InstallPrompt />` inside `AppShell` just before `<nav>`.

```tsx
// src/components/shell/PushToggle.tsx
"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/Button";
import { api } from "@/lib/api";

function key(b64: string) {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

export default function PushToggle() {
  const vapid = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";
  const [supported, setSupported] = useState(false);
  const [sub, setSub] = useState<PushSubscription | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!vapid || !("serviceWorker" in navigator) || !("PushManager" in window)) return;
    setSupported(true);
    navigator.serviceWorker.ready.then((r) => r.pushManager.getSubscription()).then(setSub).catch(() => {});
  }, [vapid]);

  if (!supported) {
    return <p className="text-xs text-cream-faint">Notifications need the installed app (on iPhone: Share → Add to Home Screen).</p>;
  }

  async function on() {
    try {
      const reg = await navigator.serviceWorker.ready;
      const s = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key(vapid) });
      await api.subscribePush(s.toJSON());
      setSub(s);
    } catch {
      setError("Notifications were blocked. You can allow them in your browser settings.");
    }
  }
  async function off() {
    if (!sub) return;
    await api.unsubscribePush(sub.endpoint).catch(() => {});
    await sub.unsubscribe();
    setSub(null);
  }

  return (
    <div>
      {sub
        ? <Button size="sm" variant="outline" onClick={off}>Turn off notifications</Button>
        : <Button size="sm" variant="outline" onClick={on}>Turn on notifications</Button>}
      {error && <p role="alert" className="mt-1 text-xs text-line-coral">{error}</p>}
    </div>
  );
}
```

In `src/app/(app)/profile/page.tsx`: replace `<div data-slot="push-toggle" />` with `<PushToggle />`, and make sign-out clear offline data:

```tsx
onClick={async () => {
  await api.signOut();
  if ("caches" in window) await Promise.all((await caches.keys()).map((k) => caches.delete(k)));
  router.replace("/signin");
}}
```

- [ ] **Step 5: Run** — `npx tsc --noEmit && npm run lint && npm run test:e2e -- pwa` → PASS. If the offline test is flaky under `next dev` (HMR requests failing offline can throw overlay errors), keep it — but first confirm the SW-cached page renders by hand with DevTools → Application → Service Workers → Offline. Do not weaken the assertion.

Also run Lighthouse's PWA/installability check manually on a production build (`npm run build && npm start` with real env) — "Installable" must pass.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: PWA manifest, icons, service worker, offline itinerary, install prompt, push toggle"
```

---

## Phase E — Ship

### Task 28: CI, deployment docs, production migration, final verification

**Files:**
- Create: `.github/workflows/ci.yml`
- Modify: `DEPLOYMENT.md`, `README.md`, `.env.example` (already done in Task 1 — re-check)

- [ ] **Step 1: CI workflow** (the repo has a GitHub remote: `Thirumurugan7/friends-group-planner`)

```yaml
name: CI
on:
  push:
    branches: [main]
  pull_request:

jobs:
  test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_USER: waypoint
          POSTGRES_PASSWORD: waypoint
          POSTGRES_DB: waypoint_test
        ports: ["5432:5432"]
        options: >-
          --health-cmd "pg_isready -U waypoint" --health-interval 5s --health-timeout 5s --health-retries 10
    env:
      DATABASE_URL_TEST: postgresql://waypoint:waypoint@localhost:5432/waypoint_test
      DATABASE_URL: postgresql://waypoint:waypoint@localhost:5432/waypoint_test
      SESSION_SECRET: ci-secret
      APP_URL: http://localhost:3200
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: npm }
      - run: npm ci
      - run: npx prisma generate
      - run: npx tsc --noEmit
      - run: npm run lint
      - run: npm test
      - run: npm run build
      - run: npx playwright install --with-deps chromium
      - run: npm run test:e2e
      - uses: actions/upload-artifact@v4
        if: failure()
        with: { name: playwright-traces, path: test-results }
```

- [ ] **Step 2: Update `DEPLOYMENT.md`** — add a section "Waypoint outings release" covering, in order:
  1. New env vars (copy the list from `.env.example`); generate VAPID keys with `npx web-push generate-vapid-keys`; set both `VAPID_PUBLIC_KEY` and `NEXT_PUBLIC_VAPID_PUBLIC_KEY` **before** `npm run build` (public env is baked in at build time).
  2. Google OAuth: in Google Cloud Console create an OAuth client (Web), authorised redirect URI `https://REPLACE_DOMAIN/api/auth/google/callback`; set `APP_URL=https://REPLACE_DOMAIN`.
  3. HTTPS is required for service workers, install, and push.
  4. Database: `npx prisma migrate deploy` (see Step 3 for the one-time switch).
  5. PM2: `pm2 start ecosystem.config.js` now starts two apps — `waypoint` and `waypoint-outcomes` (daily 09:00 IST cron); `pm2 save`.
  6. Nominatim usage policy: max 1 request/second, identifying User-Agent (`NOMINATIM_CONTACT`); the onboarding search is debounced 300 ms.
  7. Optional `GOOGLE_MAPS_API_KEY` enables Google Places + Routes (enable "Places API (New)" and "Routes API"; set a budget alert).
  8. Rotate the keys that were shared in plaintext during the July design.

- [ ] **Step 3: Production database switch — ASK THE HUMAN FIRST**

The Neon database was created with `prisma db push` and has the old `Plan` table. The spec says the existing data is test data and is not carried over. The switch is destructive:

```bash
# Only after explicit approval from the human, with the production DATABASE_URL:
npx prisma migrate reset --force --skip-seed
```

STOP and ask for approval before running this. Do not run it as part of normal task execution. If the human wants to keep data instead, baseline with `npx prisma migrate diff` + `npx prisma migrate resolve --applied <name>` and write a data migration — that is a separate task.

- [ ] **Step 4: README** — replace the create-next-app boilerplate with: what Waypoint is (one paragraph), local setup (`npm install`, `createdb waypoint_test`, copy `.env.example` → `.env.local`, `npx prisma migrate dev`, `npm run dev`), test commands (`npm test`, `npm run test:e2e`, `npm run test:live`), and `WAYPOINT_FAKES=1` for offline development with fake maps/AI and OTP `1234`.

- [ ] **Step 5: Full verification**

Run each and confirm the output before moving on:

```bash
npx tsc --noEmit          # no errors
npm run lint              # no errors
npm test                  # all unit/contract/integration/privacy tests pass
npm run build             # production build succeeds
npm run test:e2e          # all Playwright specs pass (onboarding, groups, outing, pwa)
npm run test:live         # optional, needs network/keys: OSM + OSRM pass; Google suites pass or skip without a key
```

Then a manual pass on a real phone (or Chrome device mode at 375×812) against `npm run dev` with real keys: sign in with OTP, onboarding map search, create group, join from a second device, full outing flow with real OSM/OSRM data in your city, install to home screen, airplane mode → locked plan still opens, a push notification arrives when the other device drops out.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: CI, deployment guide, README"
```

---

## Spec Coverage Map

| Spec section | Tasks |
|---|---|
| Phone OTP + rate limit | 4 |
| Google sign-in + linking | 5, 25 (profile link) |
| Required email + gender, profile completeness | 3, 4, 24 |
| Effective home-by rule (personal / group / female default) | 6, 18 (`toAttendee`) |
| Roles, invite rotation, member removal, 404 for outsiders | 3, 7 |
| Coordinates never leave the server; area-only map; route redaction | 3, 7, 18, 20 |
| Per-outing availability, date ranking, organiser confirms | 12, 18, 26 |
| Engine pipeline (sketch → area → fill → route → home-by/repair → costs → narrate) | 8–17 |
| Free providers / Google when keyed / fallback / 24h route cache | 9, 10, 11 |
| Movies via TMDB + manual showtimes | 10, 14, 20, 21, 26 |
| Generate 3 options, progress, partial failure, double-tap guard | 20, 26 |
| Vote, RSVP, lock (ties), cancel, user dropout + recalculation | 21, 26 |
| Check-in, completed / failed / cancelled, daily job, history | 17, 22, 25, 26 |
| Cost estimates, expense log, settle-up | 16, 17, 23, 26 |
| Web push (vote, lock, dropout, check-in reminder) | 19, 20, 21, 22, 27 |
| Mobile-first UI, bottom tabs, sheets, safe areas | 24, 25, 26 |
| PWA manifest, SW, offline locked plan, install prompt, iOS hint | 27 |
| Error handling (provider fallback, LLM retry, template day, ≥ 2 attendees, zod) | 9, 11, 13, 16, 20, 3 |
| Testing: unit, contract, live, integration, privacy, E2E, PWA, CI | every task, 11, 27, 28 |
| Deployment (PM2 cron, env, OAuth, HTTPS, Neon switch) | 22, 28 |
