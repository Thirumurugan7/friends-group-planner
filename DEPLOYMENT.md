# Deploying Waypoint with PM2 + Nginx

This guide deploys Waypoint to a Linux server that **already runs another app**,
without touching that app. Replace every `REPLACE_*` placeholder with your real
values.

| Placeholder | Meaning | Example |
|---|---|---|
| `REPLACE_DOMAIN` | The domain for the app | `waypoint.yourdomain.com` |
| `REPLACE_APP_DIR` | Where the code lives on the server | `/var/www/waypoint` |
| `REPLACE_SERVER_IP` | The server's public IP | `203.0.113.10` |

Waypoint listens on **port 3100**. Pick a different free port if 3100 is taken
on your server (see [Avoiding conflicts](#0-avoid-conflicts-with-the-other-app));
if you change it, change it in `ecosystem.config.js` and the Nginx config too.

---

## Architecture (read this first)

Waypoint is **one Next.js process** — the pages (frontend) and the `/api/*`
routes (backend) run in the **same** Node server. The browser calls the API
same-origin (`fetch('/api/...')`) and auth is an httpOnly cookie, so the UI and
API **must be served from a single origin**.

That means:

- **Recommended:** one domain → `REPLACE_DOMAIN` serves both UI and API. This is
  what the guide sets up.
- A separate `api.REPLACE_DOMAIN` "backend domain" is **not** a drop-in change —
  it needs CORS, a shared cookie domain (`.REPLACE_DOMAIN`), and a configurable
  API base URL in the client. If you truly need it, see
  [Optional: separate api. subdomain](#optional-separate-api-subdomain).

So "map a domain to both frontend and backend" = point one domain at the one
process. The section below does exactly that.

---

## 0. Avoid conflicts with the other app

Before you start, note what the existing app uses so you don't collide:

```bash
# Ports in use (find a free one for Waypoint; we default to 3100)
sudo ss -tlnp | grep LISTEN

# Existing PM2 processes (Waypoint will be a NEW, separately named process)
pm2 list

# Existing Nginx sites (Waypoint gets its OWN new server block / file)
ls /etc/nginx/sites-enabled/
```

Waypoint keeps its own PM2 name (`waypoint`), its own port (`3100`), and its own
Nginx file. The other app is left untouched.

---

## 1. Prerequisites on the server

```bash
# Node 20 or 22 LTS (Waypoint is built with Next 16 / React 19)
node -v            # expect v20.x or v22.x
# PM2 (already present if the other app uses it)
pm2 -v || sudo npm install -g pm2
# Nginx (already present if the other app is behind it)
nginx -v
```

---

## 2. Get the code onto the server

```bash
sudo mkdir -p REPLACE_APP_DIR
sudo chown "$USER":"$USER" REPLACE_APP_DIR
git clone REPLACE_YOUR_REPO_URL REPLACE_APP_DIR
cd REPLACE_APP_DIR
npm ci
```

## 3. Production environment file

Secrets are **never committed**. Create `.env.production` on the server (Next
loads it automatically for `next start`):

```bash
cat > REPLACE_APP_DIR/.env.production <<'EOF'
DATABASE_URL="postgresql://...neon.tech/neondb?sslmode=require&channel_binding=require"
GROQ_API_KEY="gsk_..."
APITXT_AUTHKEY="..."
SESSION_SECRET="PASTE_A_FRESH_64_CHAR_HEX"     # openssl rand -hex 32
# GOOGLE_MAPS_API_KEY=""   # add when ready
EOF
chmod 600 REPLACE_APP_DIR/.env.production
```

> **Rotate the keys** shared during development before going live, and generate a
> **new** `SESSION_SECRET` for production.

`SESSION_SECRET` matters in prod: `NODE_ENV=production` makes the session cookie
`Secure`, so it only works over **HTTPS** (step 6 sets that up).

## 4. Sync the database schema (Neon)

The Neon database is shared and already migrated during development. On deploy,
just generate the client and ensure the schema is in sync:

```bash
cd REPLACE_APP_DIR
npx prisma generate
npx prisma db push        # syncs schema; no-op if already in sync
```

> For a stricter workflow later, switch to migration files
> (`prisma migrate dev` in development, `prisma migrate deploy` on the server).

## 5. Build and start under PM2

```bash
cd REPLACE_APP_DIR
npm run build

# Start using the committed ecosystem file (name: waypoint, port: 3100)
pm2 start ecosystem.config.js
pm2 save                    # persist across reboots
pm2 startup                 # run the printed command once to enable boot start
```

Verify the process is up and serving locally:

```bash
pm2 status waypoint
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3100    # expect 200
```

Useful later:

```bash
pm2 logs waypoint           # tail logs
pm2 restart waypoint        # after `git pull && npm ci && npm run build`
```

---

## 6. Point the domain at it (Nginx reverse proxy)

### DNS

Create an **A record**: `REPLACE_DOMAIN` → `REPLACE_SERVER_IP`.

### Nginx server block (a NEW file — the other app keeps its own)

```bash
sudo tee /etc/nginx/sites-available/waypoint <<'EOF'
server {
    listen 80;
    server_name REPLACE_DOMAIN;

    # Proxy everything (UI + /api) to the single Waypoint process.
    location / {
        proxy_pass http://127.0.0.1:3100;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
EOF

sudo ln -s /etc/nginx/sites-available/waypoint /etc/nginx/sites-enabled/waypoint
sudo nginx -t          # test config — must pass before reloading
sudo systemctl reload nginx
```

Because Nginx routes by `server_name`, the other app's domain keeps working on
the same server — the two coexist as separate virtual hosts.

## 7. HTTPS (required — the session cookie needs it)

```bash
sudo apt install -y certbot python3-certbot-nginx     # if not installed
sudo certbot --nginx -d REPLACE_DOMAIN
```

Certbot rewrites the server block to listen on 443 and auto-renews. After this,
open `https://REPLACE_DOMAIN` — the full flow (OTP → group → AI plan) runs.

---

## 8. Redeploying new versions

```bash
cd REPLACE_APP_DIR
git pull
npm ci
npx prisma generate && npx prisma db push
npm run build
pm2 restart waypoint
```

---

## Optional: separate `api.` subdomain

Only if you specifically want `api.REPLACE_DOMAIN` distinct from the UI. Since
the app is one process, this is about **origins**, and it requires code changes:

1. **Cookie domain** — set the session cookie's `domain` to `.REPLACE_DOMAIN` in
   `src/lib/session.ts` so it's shared across subdomains.
2. **API base URL** — make the client helpers in `src/lib/api.ts` call an
   absolute `NEXT_PUBLIC_API_BASE` instead of relative `/api`.
3. **CORS** — add CORS headers on the API routes allowing `https://REPLACE_DOMAIN`
   with credentials.
4. **Nginx** — add a second server block for `api.REPLACE_DOMAIN` that proxies to
   the same `127.0.0.1:3100` (optionally only `/api`).

This is real work, not config-only. Tell me if you want it and I'll implement it
— otherwise the single-domain setup above is the right call.

---

## Quick reference

| Thing | Value |
|---|---|
| PM2 app name | `waypoint` |
| Port | `3100` |
| Start | `pm2 start ecosystem.config.js` |
| Env file (server) | `REPLACE_APP_DIR/.env.production` (chmod 600) |
| Nginx site | `/etc/nginx/sites-available/waypoint` |
| Domain | `REPLACE_DOMAIN` → `127.0.0.1:3100` |
| Logs | `pm2 logs waypoint` |
