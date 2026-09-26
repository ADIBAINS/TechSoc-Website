import { DatabaseSync } from 'node:sqlite'
import 'dotenv/config'
import bcrypt from 'bcryptjs'
import path from 'node:path'
import fs from 'node:fs'

const isVercel = !!process.env.VERCEL
// /tmp is the ONLY writable folder on Vercel
const dataDir = isVercel ? path.join('/tmp', 'data') : path.join(process.cwd(), 'data')
fs.mkdirSync(dataDir, { recursive: true })

export const uploadDir = isVercel ? path.join('/tmp', 'uploads') : path.join(process.cwd(), 'uploads')
fs.mkdirSync(uploadDir, { recursive: true })

const dbPath = path.join(dataDir, 'techsoc.db')

// if you committed a seed DB, copy it to /tmp on cold-start (otherwise you start empty)
if (isVercel && !fs.existsSync(dbPath)) {
  const seedPath = path.join(process.cwd(), 'data', 'techsoc.db')
  try {
    if (fs.existsSync(seedPath)) fs.copyFileSync(seedPath, dbPath)
  } catch {}
}

export const db = new DatabaseSync(dbPath)
db.exec(`
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
`)

export function ensureAdmin() {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase()
  const password = process.env.ADMIN_PASSWORD
  if (!email || !password || db.prepare('select id from admins limit 1').get()) return
  db.prepare('insert into admins (email, password_hash) values (?, ?)').run(email, bcrypt.hashSync(password, 12))
}
