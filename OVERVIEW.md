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
      auth.ts         # GET session / POST login / DELETE logout
      content.ts      # GET public feed: members+events+memories+settings
      admin-content.ts# GET/POST/PUT/DELETE members|events|memories (auth)
      contact.ts      # GET inbox (auth) / POST public contact form
      settings.ts     # GET/PUT site_settings key/values (auth)
      memory-media.ts # GET/POST/PUT/DELETE attachments of a memory (auth)
      upload.ts       # POST file → Blob or local disk, returns {path}
      uploads.$filename.ts # GET local file server (dev fallback)
  server/
    db.server.ts      # DB layer: dbAll/dbGet/dbRun/dbInsertReturningId,
                      # ensureAdmin, uploadDir, useBlob, isPostgres
    pg-query.ts       # Neon driver wrapper (parameterized $1,$2 queries)
    auth.server.ts    # authenticate/createSession/clearSession/sessionCookie
  components/
    Carousel.tsx      # sliding-window carousel + usePerView(breakpoints)
    MediaSurface.tsx  # renders image | video | 3D model (lazy model-viewer)
    MediaViewer.tsx   # fullscreen lightbox portal (arrows, esc, focus trap)
  lib/
    media.ts          # mediaKind() + collectMedia() (dedupe cover+attachments+event cover)
    eventKinds.ts     # 5-kind taxonomy + fuzzy matcher for legacy free-text kinds
  router.tsx / routeTree.gen.ts  # router setup (generated file — do not edit)
scripts/migrate-sqlite-to-postgres.mjs  # one-shot SQLite → Neon copy
```

## Pages

### `/` — public homepage (`index.tsx`)
Single-page, anchor nav (`#home #about #team #events #glimpses #community`).
Fetches `GET /api/content` on mount; if a list is empty it renders **hardcoded
fallbacks** (demo members/events/memories) so the page never looks broken.
Sections: hero (asset from `settings.hero_asset`, supports img/MP4/GLB) →
about pillars → team carousel → events (filter by kind) → memory gallery
(lightbox viewer) → community links + contact form → footer.

> Gotcha: the RSVP button is **client-side theater** — it shows a toast and
> resets after 3s. No seat is stored anywhere.

### `/admin` — control room (`admin.tsx`)
`GET /api/auth` decides Login vs Dashboard. Tabs: **members | events |
memories | hero | inbox**, each with item counts. Editors: generic field form
+ single cover upload (members/events) or full media manager (memories:
multi-attach, reorder, set cover). Hero tab stores `hero_asset` in
`site_settings`. Inbox tab reads contact submissions.

## API contract

All JSON. Auth = `techsoc_session` HttpOnly cookie; unauthenticated writes
return 401. Auth itself: `ensureAdmin()` seeds the admin from
`ADMIN_EMAIL`/`ADMIN_PASSWORD` on first request **only if `admins` is empty**
— changing the password env later does nothing to an existing row.

| Endpoint | Method | Auth | Purpose |
|----------|--------|------|---------|
| `/api/content` | GET | no | public feed |
| `/api/contact` | POST | no | contact form → `contact_submissions` |
| `/api/contact` | GET | yes | inbox |
| `/api/auth` | GET/POST/DELETE | — | session check / login / logout |
| `/api/admin-content` | GET/POST/PUT/DELETE | yes | `{type, data[, id]}` CRUD, `type` ∈ members/events/memories |
| `/api/memory-media` | GET/POST/PUT/DELETE | yes | `?memory_id=` list; attach/reorder/remove |
| `/api/settings` | GET/PUT | yes | `site_settings` map (e.g. `hero_asset`) |
| `/api/upload` | POST | yes | multipart `file` ≤25MB (jpg/png/webp/gif/mp4/glb/gltf) |
| `/api/uploads/:f` | GET | no | local-disk file server (dev only) |

## Data model (8 tables, same schema in SQLite + Postgres)

`admins(id,email,password_hash)` · `sessions(token,admin_id,expires_at 14d)` ·
`members(name,role,bio,image_path,github/linkedin/portfolio_url,sort_order,published)` ·
`events(title,kind,description,starts_at,location,registration_url,cover_image_path,published)` ·
`memories(title,caption,image_path,event_id,sort_order,published)` ·
`memory_media(memory_id,path,kind,caption,sort_order)` ·
`site_settings(key,value)` · `contact_submissions(name,email,involvement,message)`.

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
| `PORT` | local `.env` only | dev-server port (overrides `vite.config.ts` `3000`) |

`.env` is gitignored. Vercel env changes require **Redeploy + Clear Build Cache**.

## Workflows

```bash
npm install
cp .env.example .env        # fill ADMIN_*; add DATABASE_URL + Blob for hosted mode
npm run dev                 # localhost:8787 (or 3000 without PORT)
npm run typecheck && npm run build
npm run db:migrate          # copy ./data/techsoc.db → Neon (needs DATABASE_URL)
```

Deploy: push `main` → Vercel auto-builds → verify `/` (200), `/api/content`
(200), `/admin` login. New Blob store needs **Public** access + the
read-write token checkbox.

## Adding features (cookbook)

- **New content type** (e.g. `sponsors`): add table to both schemas in
  `db.server.ts` (+ migrate script schema) → extend `tables`/`columns` in
  `admin-content.ts` → add editor fields in `admin.tsx` `Editor` → render on
  homepage from `/api/content` (extend its `read()` + response).
- **New API route**: create `src/routes/api/<name>.ts` with
  `createFileRoute('/api/<name>')({ server: { handlers: { GET/POST… } } })`;
  the route registers itself via `routeTree.gen.ts` on next dev/build.
- **New homepage section**: component in `index.tsx` + styles in
  `styles.css` (single global stylesheet, `reference-*` namespace for public,
  `admin-*` for control room).
- **New setting** (like `hero_asset`): `PUT /api/settings {key: value}` stores
  JSON-stringified values; read via `content.settings` on the homepage.

## Known limitations

- `/tmp` writes (Vercel without Blob) vanish every restart; SQLite-on-Vercel
  mode is crash-safe but ephemeral — Postgres+Blob is the real prod path.
- Pre-Blob images stored as `/api/uploads/…` 404 on Vercel (files live only
  on the original laptop) until re-uploaded through `/admin`.
- Single admin, no roles, no password change/reset UI, no rate limiting on
  login or contact form.
- `contact_submissions` and `sessions` grow forever — no cleanup job
  (expired sessions were cleared once manually).
- Fallback demo content masks empty DB — if the homepage shows strangers
  (Maya/Marcus/…), the DB read returned zero rows; check `DATABASE_URL`.
