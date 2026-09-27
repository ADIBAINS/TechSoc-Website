// One-shot migration: mirror local SQLite (./data/techsoc.db) into Neon Postgres.
// Idempotent: content tables are wiped and re-copied (fresh mirror), settings
// are upserted, existing admins are kept. Safe to re-run.
// Sessions are skipped (transient login tokens, not content).
// Usage: DATABASE_URL=postgresql://... npm run db:migrate
import { DatabaseSync } from 'node:sqlite'
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const sqlitePath = path.join(root, 'data', 'techsoc.db')
if (!fs.existsSync(sqlitePath)) {
  console.error(`No SQLite file at ${sqlitePath} — nothing to migrate.`)
  process.exit(1)
}
if (!process.env.DATABASE_URL) {
  console.error('Set DATABASE_URL first (see .env.example).')
  process.exit(1)
}

const { neon } = await import('@neondatabase/serverless')
const sql = neon(process.env.DATABASE_URL)

// Schema first (same as src/server/db.server.ts).
const schema = `
create table if not exists admins (id serial primary key, email text unique not null, password_hash text not null, created_at timestamptz not null default now());
create table if not exists sessions (token text primary key, admin_id integer not null references admins(id) on delete cascade, expires_at timestamptz not null);
create table if not exists members (id serial primary key, name text not null, role text default '', bio text default '', image_path text, github_url text, linkedin_url text, portfolio_url text, sort_order integer default 0, published integer not null default 1, created_at timestamptz not null default now());
create table if not exists events (id serial primary key, title text not null, kind text default 'Workshop', description text default '', starts_at text, location text default '', registration_url text, cover_image_path text, published integer not null default 1, created_at timestamptz not null default now());
create table if not exists memories (id serial primary key, title text not null, caption text default '', image_path text not null, event_id integer references events(id) on delete set null, sort_order integer default 0, published integer not null default 1, created_at timestamptz not null default now());
create table if not exists memory_media (id serial primary key, memory_id integer not null references memories(id) on delete cascade, path text not null, kind text default 'image', caption text default '', sort_order integer default 0, created_at timestamptz not null default now());
create index if not exists memory_media_memory on memory_media (memory_id, sort_order);
create table if not exists site_settings (key text primary key, value text not null default '{}', updated_at timestamptz not null default now());
create table if not exists contact_submissions (id serial primary key, name text not null, email text not null, involvement text default '', message text not null, created_at timestamptz not null default now());
create table if not exists event_rsvps (id serial primary key, event_id integer not null references events(id) on delete cascade, name text not null, email text not null, created_at timestamptz not null default now(), unique (event_id, email));
create table if not exists sponsors (id serial primary key, name text not null, logo_path text, url text default '', tier text default 'Community', sort_order integer default 0, published integer not null default 1, created_at timestamptz not null default now());
create table if not exists admin_actions (id serial primary key, admin_id integer references admins(id) on delete set null, action text not null, target_table text, target_id integer, created_at timestamptz not null default now());
`
for (const stmt of schema.split(';').map((s) => s.trim()).filter(Boolean)) {
  await sql.query(stmt, [])
}

const lite = new DatabaseSync(sqlitePath, { readOnly: true })

// Fresh mirror: wipe + re-copy so re-runs never duplicate. Order respects FKs.
for (const table of ['memory_media', 'memories', 'members', 'events', 'contact_submissions', 'event_rsvps', 'sponsors']) {
  const exists = (() => {
    try {
      lite.prepare(`select 1 from ${table} limit 1`).get()
      return true
    } catch {
      return false
    }
  })()
  await sql.query(`delete from ${table}`, [])
  if (!exists) {
    console.log(`${table}: no local table yet, cleared remote`)
    continue
  }
  const rows = lite.prepare(`select * from ${table}`).all()
  for (const row of rows) {
    const cols = Object.keys(row)
    const placeholders = cols.map((_, i) => `$${i + 1}`).join(', ')
    await sql.query(
      `insert into ${table} (${cols.join(', ')}) values (${placeholders})`,
      cols.map((c) => row[c] ?? null),
    )
  }
  console.log(`${table}: mirrored ${rows.length} rows`)
}

// Admins: keep existing prod rows, add missing ones by email.
for (const row of lite.prepare('select * from admins').all()) {
  await sql.query(
    `insert into admins (id, email, password_hash, created_at) values ($1, $2, $3, $4) on conflict (email) do nothing`,
    [row.id, row.email, row.password_hash, row.created_at],
  )
}
console.log('admins: merged (existing kept)')

// Settings: upsert so local values win per key without wiping prod-only keys.
for (const row of lite.prepare('select * from site_settings').all()) {
  await sql.query(
    `insert into site_settings (key, value, updated_at) values ($1, $2, current_timestamp) on conflict (key) do update set value = excluded.value, updated_at = current_timestamp`,
    [row.key, row.value],
  )
}
console.log('site_settings: upserted')

// Reset serial sequences so new inserts don't clash with mirrored ids.
for (const table of ['admins', 'members', 'events', 'memories', 'memory_media', 'contact_submissions', 'event_rsvps', 'sponsors', 'admin_actions']) {
  await sql.query(`select setval(pg_get_serial_sequence('${table}', 'id'), coalesce(max(id), 1)) from ${table}`, [])
}
console.log('Done. Sequences reset.')
