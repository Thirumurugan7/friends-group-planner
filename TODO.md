# Waypoint — TODO

Ordered by what blocks bringing the app to users.

## 1. Before inviting the first friends

### Accounts & secrets (owner)
- [ ] Link billing to the Google Cloud project **Waypoint** (`project-b16a1cc1-c872-4b78-9fd`, personal account) — the Maps key works today without billing, but Google can cut it off: https://console.cloud.google.com/billing/linkedaccount?project=project-b16a1cc1-c872-4b78-9fd
- [ ] Add a budget alert on that billing account (e.g. ₹500/month)
- [ ] Reset the production Neon DB password (it was pasted in chat), then update `DATABASE_URL` in Vercel and redeploy
- [ ] Rotate the secrets in `.env.local` (Groq, apitxt, session secret) and update Vercel

### SMS OTP
- [ ] Confirm with apitxt that `sendOTP` uses a DLT-registered sender ID and template (unregistered OTP SMS are silently dropped by Indian carriers)
- [ ] Test OTP delivery on Jio, Airtel and Vi numbers
- [ ] Add a timeout to the apitxt `sendOTP` call
- [ ] Check apitxt's real status field instead of regex-matching "error|invalid|fail"

### Place search (onboarding)
- [ ] Onboarding home/work search calls Nominatim on every keystroke — debounce it (Nominatim forbids autocomplete, 1 req/s)
- [ ] Use Google for home/work search when `GOOGLE_MAPS_API_KEY` is set
- [ ] Geocode route hides failures as "no results" — log errors and show a message in the UI
- [ ] Show "No places found" in the place picker when a search returns nothing
- [ ] Fail loudly when `NOMINATIM_CONTACT` is missing (placeholder contacts get HTTP 403)

### Monitoring
- [ ] Add error tracking (e.g. Sentry free tier) or at least Vercel log alerts, so failures surface without a user reporting them
- [ ] Vercel `logs` returned no records for the production deployment — confirm runtime logs are actually being captured

## 2. Before opening it beyond friends (legal — India DPDP Act)
- [ ] Privacy policy page: what's collected (phone, home/work location, age, gender, interests), why, who in a group sees what, retention
- [ ] Consent line + privacy policy link on the sign-in / onboarding screen
- [ ] "Delete my account" in profile — removes the user and their data (groups they created need an owner hand-off or cascade rule)
- [ ] Terms of use page

## 3. Product polish (retention)
- [ ] The three themes (relaxed / adventurous / foodie) pick near-identical venues — steer options away from each other's venues (prod test 2026-10-17: foodie and adventurous share their first three stops)
- [ ] Push notifications — generate VAPID keys, set `VAPID_*` and `NEXT_PUBLIC_VAPID_PUBLIC_KEY` (vote now / plan locked / day-before reminders)
- [ ] Custom domain (e.g. waypoint.app) instead of friends-group-planner.vercel.app — better WhatsApp invite links; set `APP_URL`
- [ ] Connect the Vercel project to GitHub so pushes to `master` auto-deploy (currently CLI deploys only)
- [ ] Map display uses openstreetmap.org tiles (not allowed for heavy app use) — switch to a proper tile provider before growth
- [ ] Domino's/fast-food chains get labelled as street food (OSM `amenity=fast_food` → `street_food`; only without a Google key)
- [ ] Google sign-in — `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` and `APP_URL`
- [ ] Movie listings — `TMDB_API_KEY`

## 4. Costs to watch
- [ ] Google Maps — ~15–25 Places/Routes calls per plan generation; budget alert (see section 1)
- [ ] Groq — usage limits on the free tier
- [ ] apitxt — per-SMS cost for every OTP
- [ ] Neon and Vercel free-tier limits (DB storage/compute, function duration and invocations)

## 5. Fallback paths (only matter without a Google key)
- [ ] Routing uses the public OSRM demo server and public-transport times are an estimate (driving × 1.6 + 15 min)
- [ ] Production may need `OVERPASS_URL` set to a mirror if overpass-api.de blocks Vercel

## 6. Cleanup
- [ ] Delete the merged `feature/outings` branch (local + origin) and its worktree in `.worktrees/`
- [ ] Delete the local `backup/before-attribution-strip` branch once the rewritten history is confirmed
- [ ] `npm run lint` scans `.worktrees/` — add it to the ESLint ignores
- [ ] Old Neon DB (in `.env.local`) still has the legacy schema and 3 users — decide whether to keep it, and point local dev at a local DB
- [ ] Upgrade the global Vercel CLI (`npm i -g vercel@latest`; v41 is rejected)

## Done
- [x] Run plan generation in production — 3 plans in 8s with Google (2026-10-17)
- [x] Full end-to-end test on production (4 users: groups → plans → vote → lock → check-in → expenses → removal)
