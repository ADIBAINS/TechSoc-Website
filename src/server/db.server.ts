// Database layer: Postgres (Neon) when DATABASE_URL is set, else local SQLite.
// - Local without DATABASE_URL: ./data/techsoc.db + ./uploads/ on disk.
// - Prod (Vercel): set DATABASE_URL (Neon) + BLOB_READ_WRITE_TOKEN (Vercel Blob).
//   Uploads go to Blob; /tmp fallback only when Blob token is missing.
import { DatabaseSync } from 'node:sqlite'
import bcrypt from 'bcryptjs'
import path from 'node:path'
import fs from 'node:fs'

export type SqlValue = string | number | bigint | null

export const isPostgres = !!process.env.DATABASE_URL

/** Convert `?` placeholders to Postgres `$1, $2, ...` */
function toPostgres(sql: string): string {
  let i = 0
  return sql.replace(/\?/g, () => `$${++i}`)
}

const POSTGRES_SCHEMA = `
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
`

let schemaEnsured = false
async function ensurePostgresSchema() {
  if (schemaEnsured) return
  const { neonQuery } = await import('./pg-query')
  for (const stmt of POSTGRES_SCHEMA.split(';').map((s) => s.trim()).filter(Boolean)) {
    await neonQuery(`${stmt}`)
  }
  schemaEnsured = true
}

// ---------- SQLite fallback (sync, wrapped async) ----------
const localBase = process.env.VERCEL && !process.env.DATABASE_URL ? '/tmp' : process.cwd()
const dataDir = path.join(localBase, 'data')
let sqliteDb: DatabaseSync | null = null

function getSqlite(): DatabaseSync {
  if (sqliteDb) return sqliteDb
  fs.mkdirSync(dataDir, { recursive: true })
  sqliteDb = new DatabaseSync(path.join(dataDir, 'techsoc.db'))
  sqliteDb.exec(`
  pragma journal_mode = WAL;
  create table if not exists admins (id integer primary key, email text unique not null, password_hash text not null, created_at text not null default current_timestamp);
  create table if not exists sessions (token text primary key, admin_id integer not null references admins(id) on delete cascade, expires_at text not null);
  create table if not exists members (id integer primary key, name text not null, role text default '', bio text default '', image_path text, github_url text, linkedin_url text, portfolio_url text, sort_order integer default 0, published integer not null default 1, created_at text not null default current_timestamp);
  create table if not exists events (id integer primary key, title text not null, kind text default 'Workshop', description text default '', starts_at text, location text default '', registration_url text, cover_image_path text, published integer not null default 1, created_at text not null default current_timestamp);
  create table if not exists memories (id integer primary key, title text not null, caption text default '', image_path text not null, event_id integer references events(id) on delete set null, sort_order integer default 0, published integer not null default 1, created_at text not null default current_timestamp);
  create table if not exists memory_media (id integer primary key, memory_id integer not null references memories(id) on delete cascade, path text not null, kind text default 'image', caption text default '', sort_order integer default 0, created_at text not null default current_timestamp);
  create index if not exists memory_media_memory on memory_media (memory_id, sort_order);
  create table if not exists site_settings (key text primary key, value text not null default '{}', updated_at text not null default current_timestamp);
  create table if not exists contact_submissions (id integer primary key, name text not null, email text not null, involvement text default '', message text not null, created_at text not null default current_timestamp);
  create table if not exists event_rsvps (id integer primary key, event_id integer not null references events(id) on delete cascade, name text not null, email text not null, created_at text not null default current_timestamp);
  create unique index if not exists event_rsvps_event_email on event_rsvps (event_id, email);
`)
  return sqliteDb
}

// Local-disk upload dir (used when Blob token is missing, i.e. local dev).
export const uploadDir = path.join(
  process.env.VERCEL && !process.env.BLOB_READ_WRITE_TOKEN ? '/tmp' : process.cwd(),
  'uploads',
)

// ---------- Unified async API (use this everywhere) ----------
export async function dbAll<T = Record<string, unknown>>(sql: string, params: SqlValue[] = []): Promise<T[]> {
  if (isPostgres) {
    await ensurePostgresSchema()
    const { neonQuery } = await import('./pg-query')
    return neonQuery<T>(toPostgres(sql), params)
  }
  return getSqlite().prepare(sql).all(...params) as T[]
}

export async function dbGet<T = Record<string, unknown>>(sql: string, params: SqlValue[] = []): Promise<T | undefined> {
  const rows = await dbAll<T>(sql, params)
  return rows[0]
}

export async function dbRun(sql: string, params: SqlValue[] = []): Promise<{ lastInsertRowid: number }> {
  if (isPostgres) {
    await ensurePostgresSchema()
    const { neonQuery } = await import('./pg-query')
    await neonQuery(toPostgres(sql), params)
    return { lastInsertRowid: 0 }
  }
  const result = getSqlite().prepare(sql).run(...params)
  return { lastInsertRowid: Number(result.lastInsertRowid) }
}

/**
 * INSERT that needs the new row's id (members/events/memories/memory_media).
 * Do NOT use for tables without an `id` column (sessions, site_settings).
 */
export async function dbInsertReturningId(sql: string, params: SqlValue[] = []): Promise<{ lastInsertRowid: number }> {
  if (isPostgres) {
    await ensurePostgresSchema()
    const { neonQuery } = await import('./pg-query')
    const trimmed = sql.trim().toLowerCase()
    const finalSql = trimmed.includes('returning') ? toPostgres(sql) : `${toPostgres(sql)} RETURNING id`
    const rows = await neonQuery<{ id: number }>(finalSql, params)
    return { lastInsertRowid: Number(rows[0]?.id ?? 0) }
  }
  const result = getSqlite().prepare(sql).run(...params)
  return { lastInsertRowid: Number(result.lastInsertRowid) }
}

export async function ensureAdmin() {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase()
  const password = process.env.ADMIN_PASSWORD
  if (!email || !password) return
  const existing = await dbGet<{ id: number }>('select id from admins limit 1')
  if (existing) return
  await dbRun('insert into admins (email, password_hash) values (?, ?)', [email, bcrypt.hashSync(password, 12)])
}

/** True when uploads should go to Vercel Blob instead of local disk. */
export function useBlob(): boolean {
  return !!process.env.BLOB_READ_WRITE_TOKEN
}
