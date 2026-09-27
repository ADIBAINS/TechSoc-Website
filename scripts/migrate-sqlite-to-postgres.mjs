// One-shot migration: copy local SQLite (./data/techsoc.db) into Neon Postgres.
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

// Create Postgres schema first (same as src/server/db.server.ts).
const schema = `
create table if not exists admins (id serial primary key, email text unique not null, password_hash text not null, created_at timestamptz not null default now());
create table if not exists sessions (token text primary key, admin_id integer not null references admins(id) on delete cascade, expires_at timestamptz not null);
create table if not exists members (id serial primary key, name text not null, role text default '', bio text default '', image_path text, github_url text, linkedin_url text, portfolio_url text, sort_order integer default 0, published integer not null default 1, created_at timestamptz not null default now());
create table if not exists events (id serial primary key, title text not null, kind text default 'Workshop', description text default '', starts_at text, location text default '', registration_url text, cover_image_path text, published integer not null default 1, created_at timestamptz not null default now());
create table if not exists memories (id serial primary key, title text not null, caption text default '', image_path text not null, event_id integer references events(id) on delete set null, sort_order integer default 0, published integer not null default 1, created_at timestamptz not null default now());
create table if not exists memory_media (id serial primary key, memory_id integer not null references memories(id) on delete cascade, path text not null, kind text default 'image', caption text default '', sort_order integer default 0, created_at timestamptz not null default now());
create index if not exists memory_media_memory on memory_media (memory_id, sort_order);
create table if not exists site_settings (key text primary key, value text not null default '{}', updated_at timestamptz not null default now());
create table if not exists contact_submissions (id serial primary key, name text not null, email text not null, involvement text default '', message text not null, created_at timestamptz not null default current_timestamp);
`
for (const stmt of schema.split(';').map((s) => s.trim()).filter(Boolean)) {
  await sql.query(stmt, [])
}

const lite = new DatabaseSync(sqlitePath, { readOnly: true })
const tables = ['admins', 'sessions', 'members', 'events', 'memories', 'memory_media', 'site_settings', 'contact_submissions']

for (const table of tables) {
  const rows = lite.prepare(`select * from ${table}`).all()
  if (!rows.length) {
    console.log(`${table}: 0 rows, skipped`)
    continue
  }
  const cols = Object.keys(rows[0])
  const placeholders = cols.map((_, i) => `$${i + 1}`).join(', ')
  let n = 0
  for (const row of rows) {
    const values = cols.map((c) => row[c] ?? null)
    await sql.query(
      `insert into ${table} (${cols.join(', ')}) values (${placeholders}) on conflict do nothing`,
      values,
    )
    n++
  }
  console.log(`${table}: migrated ${n} rows`)
}

// Reset serial sequences so new inserts don't clash with migrated ids.
for (const table of ['admins', 'members', 'events', 'memories', 'memory_media', 'contact_submissions']) {
  await sql.query(`select setval(pg_get_serial_sequence('${table}', 'id'), coalesce(max(id), 1)) from ${table}`, [])
}
console.log('Done. Sequences reset.')
