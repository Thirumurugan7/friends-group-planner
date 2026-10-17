# Waypoint — TODO

## Do now
- [ ] Link billing to the Google Cloud project **Waypoint** (`project-b16a1cc1-c872-4b78-9fd`, personal account) — the Maps key works today without billing, but Google can cut it off: https://console.cloud.google.com/billing/linkedaccount?project=project-b16a1cc1-c872-4b78-9fd
- [ ] Add a budget alert on that billing account (e.g. ₹500/month)
- [ ] Reset the production Neon DB password (it was pasted in chat), then update `DATABASE_URL` in Vercel and redeploy
- [ ] Connect the Vercel project to GitHub so pushes to `master` auto-deploy (currently CLI deploys only)
- [ ] Rotate the secrets in `.env.local` (Groq, apitxt, session secret) and update Vercel

## Maps & location
- [ ] Onboarding home/work search calls Nominatim on every keystroke — debounce it (Nominatim forbids autocomplete, 1 req/s)
- [ ] Use Google for home/work search when `GOOGLE_MAPS_API_KEY` is set
- [ ] Geocode route hides failures as "no results" — log errors and show a message in the UI
- [ ] Show "No places found" in the place picker when a search returns nothing
- [ ] Fail loudly when `NOMINATIM_CONTACT` is missing (placeholder contacts get HTTP 403)
- [ ] Map display uses openstreetmap.org tiles (not allowed for heavy app use) — switch to a proper tile provider before growth
- [ ] Without a Google key, routing uses the public OSRM demo server and public-transport times are an estimate (driving × 1.6 + 15 min)
- [ ] Production may need `OVERPASS_URL` set to a mirror if overpass-api.de blocks Vercel (only matters without a Google key)

## Plans (generation)
- [ ] Run plan generation once in production (locally with Google it takes ~15s, so the 5-minute limit should be fine)
- [ ] The three themes (relaxed / adventurous / foodie) pick near-identical venues — steer options away from each other's venues (still true with Google: all three start at the same Starbucks)- [ ] Domino's/fast-food chains get labelled as street food (OSM `amenity=fast_food` → `street_food`)

## Auth (SMS OTP)
- [ ] Add a timeout to the apitxt `sendOTP` call
- [ ] Check apitxt's real status field instead of regex-matching "error|invalid|fail"

## Optional features (need keys)
- [ ] Push notifications — generate VAPID keys, set `VAPID_*` and `NEXT_PUBLIC_VAPID_PUBLIC_KEY`
- [ ] Google sign-in — `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` and `APP_URL`
- [ ] Movie listings — `TMDB_API_KEY`

## Cleanup
- [ ] Delete the merged `feature/outings` branch (local + origin) and its worktree in `.worktrees/`
- [ ] `npm run lint` scans `.worktrees/` — add it to the ESLint ignores
- [ ] Old Neon DB (in `.env.local`) still has the legacy schema and 3 users — decide whether to keep it, and point local dev at a local DB
- [ ] Upgrade the global Vercel CLI (`npm i -g vercel@latest`; v41 is rejected)
