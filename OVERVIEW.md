# TechSoc Website — Overview

Community site for **techsoc**, a builders/designers tech club. Public homepage +
private admin control room, backed by Postgres (prod) or SQLite (local dev).

## Stack

| Layer    | Choice |
|----------|--------|
| Framework | TanStack Start (`@tanstack/react-start`) + TanStack Router (file-based routes) |
| UI | React 18, hand-written CSS (`src/styles.css`), `framer-motion`, `lucide-react` |
| Server | Nitro (`nitro/vite` plugin) → Vercel Functions (Fluid compute) |
| DB (prod) | Neon Postgres via `@neondatabase/serverless`, when `DATABASE_URL` is set |
| DB (local) | SQLite file `data/techsoc.db` via `node:sqlite`, when `DATABASE_URL` is absent |
| Uploads (prod) | Vercel Blob (`@vercel/blob`), when `BLOB_READ_WRITE_TOKEN` is set |
| Uploads (local) | `./uploads/` on disk, served by `GET /api/uploads/$filename` |
| Build | Vite 7 (`vite build`), Node ≥ 22.5 |
| Hosting | Vercel, framework preset **TanStack Start**, root `./`, Node 22.x |

## Project map

```
src/
  routes/
    __root.tsx        # <html> shell, meta, favicon, 404 page
    index.tsx         # public homepage (all sections, 279 lines)
    admin.tsx         # /admin control room: login + dashboard (256 lines)
    api/
      auth.ts         # GET session / POST login (rate-limited) / DELETE logout / PUT password change
      content.ts      # GET public feed: members+events+memories+sponsors+settings
      admin-content.ts# GET/POST/PUT/DELETE members|events|memories|sponsors (auth, zod)
      contact.ts      # GET inbox (auth) / POST public contact form (rate-limited, zod)
      settings.ts     # GET (auth) / PUT (admin-only) site_settings key/values (zod)
      memory-media.ts # GET/POST/PUT/DELETE attachments of a memory (auth, zod)
      upload.ts       # POST file → Blob or local disk, magic-byte verified (auth)
      uploads.$filename.ts # GET local file server (dev fallback)
      rsvp.ts         # GET attendees (auth) / POST public registration (rate-limited, zod)
      admins.ts       # GET/POST/DELETE admin accounts (admin-only)
      health.ts       # GET liveness + DB + prod-env check
      cron-cleanup.ts # GET nightly hygiene, Bearer CRON_SECRET (Vercel Cron)
  server/
    db.server.ts      # DB layer: dbAll/dbGet/dbRun/dbInsertReturningId,
                      # ensureAdmin, logAction, uploadDir, useBlob, isPostgres
    pg-query.ts       # Neon driver wrapper (parameterized $1,$2 queries)
    auth.server.ts    # authenticate/requireAdmin/createSession/clearSession/
                      # sessionCookie/csrfBlock (Origin+Referer check)
    ratelimit.ts      # in-memory fixed-window limiter (per-instance caveat)
    validate.ts       # zod schemas + readJson() for every mutating body
    env.ts            # missingProdEnv()/warnProdEnvOnce() cold-start audit
  components/
    Carousel.tsx      # sliding-window carousel + usePerView(breakpoints)
    MediaSurface.tsx  # renders image | video | 3D model (lazy model-viewer)
    MediaViewer.tsx   # fullscreen lightbox portal (arrows, esc, focus trap)
  lib/
    media.ts          # mediaKind() + collectMedia() (dedupe cover+attachments+event cover)
    eventKinds.ts     # 5-kind taxonomy + fuzzy matcher for legacy free-text kinds
  router.tsx / routeTree.gen.ts  # router setup (generated file — do not edit)
scripts/migrate-sqlite-to-postgres.mjs  # idempotent SQLite → Neon mirror
scripts/migrate-uploads-to-blob.mjs     # backfill /api/uploads/* rows to Blob URLs
```

## Pages

### `/` — public homepage (`index.tsx`)
Single-page, anchor nav (`#home #about #team #events #glimpses #community`).
Fetches `GET /api/content` on mount; if a list is empty it renders **hardcoded
fallbacks** (demo members/events/memories) so the page never looks broken.
Sections: announcement banner (from `settings.announcement`, dismissible via
localStorage) → hero (asset from `settings.hero_asset`, supports img/MP4/GLB) →
about pillars → team carousel → events (filter by kind, real RSVP form) →
sponsors grid → memory gallery (lightbox viewer) → community links + contact
form → footer.

> Gotcha: the RSVP button is **client-side theater** — it shows a toast and
> resets after 3s. No seat is stored anywhere.

### `/admin` — control room (`admin.tsx`)
`GET /api/auth` decides Login vs Dashboard (session carries `role`).
Admins see tabs **members | events | memories | sponsors | hero | team access
| inbox**; editors see everything except **hero** and **team access**.
Editors: generic field form + single cover/logo upload (members/events/sponsors)
or full media manager (memories); event editors show the RSVP attendee list.
Hero tab edits `hero_asset` + `announcement` setting. Team-access tab invites
(`editor` default) and removes accounts (never self). Password change lives at
the bottom for every role.
the bottom for every role.

## API contract

All JSON. Auth = `techsoc_session` HttpOnly cookie (`SameSite=Lax`) + Origin/
Referer CSRF check on every mutation (`csrfBlock`); unauthenticated writes
return 401/403. Rate limits (in-memory, per Vercel isolate): login 5/15min per
IP+email, contact + RSVP 10/hour per IP → `429` + `Retry-After`. Every mutating
body is zod-validated (`validate.ts` + `readJson`). Auth itself: `ensureAdmin()`
seeds the admin from `ADMIN_EMAIL`/`ADMIN_PASSWORD` on first request **only if
`admins` is empty** — changing the password env later does nothing to an
existing row (use the in-app password change instead).

| Endpoint | Method | Auth | Purpose |
|----------|--------|------|---------|
| `/api/content` | GET | no | public feed |
| `/api/contact` | POST | no | contact form → `contact_submissions` |
| `/api/contact` | GET | editor+ | inbox |
| `/api/auth` | GET/POST/DELETE | — | session check / login / logout |
| `/api/auth` | PUT | editor+ | password change (current-password re-entry) |
| `/api/admin-content` | GET/POST/PUT/DELETE | editor+ | `{type, data[, id]}` CRUD, `type` ∈ members/events/memories/sponsors |
| `/api/memory-media` | GET/POST/PUT/DELETE | editor+ | `?memory_id=` list; attach/reorder/remove |
| `/api/settings` | GET | editor+ | settings map |
| `/api/settings` | PUT | admin | settings map (hero asset, announcement) |
| `/api/upload` | POST | editor+ | multipart `file` ≤25MB, magic-byte verified |
| `/api/uploads/:f` | GET | no | local-disk file server (dev only) |
| `/api/rsvp` | POST | no | `{event_id, name, email}`, deduped per event |
| `/api/rsvp` | GET | editor+ | `?event_id=` attendee list |
| `/api/admins` | GET/POST/DELETE | admin | account list / invite / remove (never self) |
| `/api/health` | GET | no | `{ok, db, warnings?}` — ping after deploys |
| `/api/cron-cleanup` | GET | Bearer `CRON_SECRET` | delete expired sessions (nightly via `vercel.json`) |

## Data model (11 tables, same schema in SQLite + Postgres)

`admins(id,email,password_hash,role)` · `sessions(token,admin_id,expires_at 14d)` ·
`members(name,role,bio,image_path,github/linkedin/portfolio_url,sort_order,published)` ·
`events(title,kind,description,starts_at,location,registration_url,cover_image_path,published)` ·
`memories(title,caption,image_path,event_id,sort_order,published)` ·
`memory_media(memory_id,path,kind,caption,sort_order)` ·
`sponsors(name,logo_path,url,tier,sort_order,published)` ·
`event_rsvps(event_id,name,email,unique(event_id,email))` ·
`site_settings(key,value)` · `contact_submissions(name,email,involvement,message)` ·
`admin_actions(admin_id,action,target_table,target_id)` (best-effort audit of
logins, content/settings/media/upload/account mutations).

Media rule: a memory's gallery = its `image_path` + `memory_media` rows +
its event's cover, deduplicated (`collectMedia`). `image_path`/`cover_image_path`
hold either `/api/uploads/<file>` (old local) or `https://…` Blob URLs (new) —
both render as plain `<img src>`.

## DB layer rules (`db.server.ts`)

- Code writes SQLite-style `?` placeholders; the layer rewrites to `$1,$2…`
  for Postgres. Never interpolate values into SQL strings (table names are
  allowlisted constants — that's the only dynamic SQL).
- `dbRun` = plain statement. `dbInsertReturningId` = INSERT needing the new
  `id` — use it **only** for tables with an `id` column (sessions and
  site_settings don't have one; that exact mistake caused the login 500).
- Schema auto-creates on first query (`IF NOT EXISTS`), both dialects.
- `VITE_` prefix is irrelevant here (no client env); server reads
  `process.env` directly. No `dotenv` package — Vite/Nitro loads `.env`.

## Environment

| Var | Where | Purpose |
|-----|-------|---------|
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | local `.env` + Vercel Production | seed admin (first boot only) |
| `DATABASE_URL` | same | Neon pooled URL (`?sslmode=require`); absent → local SQLite. Omit `&channel_binding=require` (breaks the serverless driver) |
| `BLOB_READ_WRITE_TOKEN` / `BLOB_STORE_ID` | same | Vercel Blob; absent → local disk |
| `CRON_SECRET` | Vercel Production (+ local `.env` for manual runs) | Bearer token for `/api/cron-cleanup`; Vercel Cron sends it automatically when set |
| `PORT` | local `.env` only | dev-server port (overrides `vite.config.ts` `3000`) |

`.env` is gitignored. Vercel env changes require **Redeploy + Clear Build Cache**.

## Workflows

```bash
npm install
cp .env.example .env        # fill ADMIN_*; add DATABASE_URL + Blob for hosted mode
npm run dev                 # localhost:8787 (or 3000 without PORT)
npm run typecheck && npm run build
npm run db:migrate          # mirror ./data/techsoc.db → Neon (needs DATABASE_URL, idempotent)
npm run db:migrate-uploads  # backfill /api/uploads/* rows → Blob URLs (needs BLOB token)
```

Deploy: push `main` → Vercel auto-builds → verify `GET /api/health`
(`{ok:true}`), `/`, `/api/content` (200), `/admin` login. New Blob store needs
**Public** access + the read-write token checkbox. `vercel.json` schedules the
nightly cleanup cron (requires `CRON_SECRET` in prod env).

## Adding features (cookbook)

- **New content type** (sponsors is the reference implementation): add table to
  both schemas in `db.server.ts` (+ both migrate scripts) → extend
  `tables`/`columns` in `admin-content.ts` + `contentType` enum and required-field
  rule in `validate.ts` → add `AdminData` key, tab, editor fields, thumbnail +
  upload mapping in `admin.tsx` → include in `/api/content` response → render on
  homepage + `reference-*` CSS.
- **New API route**: create `src/routes/api/<name>.ts` with
  `createFileRoute('/api/<name>')({ server: { handlers: { GET/POST… } } })`,
  zod body via `readJson`, `csrfBlock` on mutations, rate limit if public;
  the route registers itself via `routeTree.gen.ts` on next dev/build
  (typecheck fails until then — rebuild first).
- **New homepage section**: component in `index.tsx` + styles in
  `styles.css` (single global stylesheet, `reference-*` namespace for public,
  `admin-*` for control room).
- **New setting** (like `hero_asset`): `PUT /api/settings {key: value}` stores
  JSON-stringified values; read via `content.settings` on the homepage.

## Known limitations / deliberate trade-offs

- `/tmp` writes (Vercel without Blob) vanish every restart; SQLite-on-Vercel
  mode is crash-safe but ephemeral — Postgres+Blob is the real prod path.
- Remaining `/api/uploads/…` rows 404 on Vercel until re-uploaded; run
  `db:migrate-uploads` while `./uploads/` still exists, or use the
  `broken_images` badge in `/admin` as the re-upload checklist.
- Rate limiting is per serverless isolate (documented in `ratelimit.ts`) —
  upgrade to Redis/Upstash if abuse appears.
- Video uploads are size-capped (25MB) but duration is unchecked (no ffmpeg
  in the pipeline — deliberate). Magic-byte sniffing covers type spoofing.
- Images: no custom resize pipeline — Blob CDN + `loading="lazy"` everywhere;
  revisit only if Lighthouse flags it.
- `contact_submissions` are never auto-deleted (club privacy decision pending);
  the cron only deletes expired sessions and reports the inbox count.
- Fallback demo content masks empty DB — if the homepage shows strangers
  (Maya/Marcus/…), the DB read returned zero rows; check `DATABASE_URL`.
