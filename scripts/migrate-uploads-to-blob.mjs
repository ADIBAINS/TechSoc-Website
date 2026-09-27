// One-time backfill: re-upload local ./uploads/* files referenced as
// /api/uploads/<file> in the DB to Vercel Blob, and rewrite those rows to the
// public Blob URLs — in BOTH local SQLite and Postgres (when DATABASE_URL set).
// Files missing from ./uploads/ can't be recovered: they're recorded in
// site_settings.broken_images (JSON array of {table, id, path}) so /admin can
// badge them, and printed in the final report for re-upload.
// Usage: BLOB_READ_WRITE_TOKEN=... [DATABASE_URL=...] npm run db:migrate-uploads
import { DatabaseSync } from 'node:sqlite'
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const sqlitePath = path.join(root, 'data', 'techsoc.db')
const uploadsDir = path.join(root, 'uploads')

if (!process.env.BLOB_READ_WRITE_TOKEN) {
  console.error('Set BLOB_READ_WRITE_TOKEN first (see .env.example).')
  process.exit(1)
}
if (!fs.existsSync(sqlitePath)) {
  console.error(`No SQLite file at ${sqlitePath} — nothing to scan.`)
  process.exit(1)
}

const { put } = await import('@vercel/blob')
const lite = new DatabaseSync(sqlitePath)

let pg = null
if (process.env.DATABASE_URL) {
  const { neon } = await import('@neondatabase/serverless')
  pg = neon(process.env.DATABASE_URL)
}

const contentTypes = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif', '.mp4': 'video/mp4', '.glb': 'model/gltf-binary', '.gltf': 'model/gltf+json' }
const isLocalUpload = (p) => typeof p === 'string' && p.startsWith('/api/uploads/')
const filenameOf = (p) => path.basename(p)

// Collect every local-upload reference: { table, idCol, id, col, path }
const refs = []
const scan = (table, idCol, col) => {
  let rows = []
  try {
    rows = lite.prepare(`select ${idCol}, ${col} from ${table}`).all()
  } catch {
    return // table doesn't exist locally yet
  }
  for (const row of rows) {
    if (isLocalUpload(row[col])) refs.push({ table, idCol, id: row[idCol], col, path: row[col] })
  }
}
scan('members', 'id', 'image_path')
scan('events', 'id', 'cover_image_path')
scan('memories', 'id', 'image_path')
scan('memory_media', 'id', 'path')
try {
  const hero = lite.prepare(`select value from site_settings where key = 'hero_asset'`).get()
  if (hero) {
    const p = JSON.parse(hero.value)
    if (isLocalUpload(p)) refs.push({ table: 'site_settings', idCol: 'key', id: 'hero_asset', col: 'value', path: p, json: true })
  }
} catch {}

console.log(`Found ${refs.length} local-upload references.`)
const broken = []
let fixed = 0
for (const ref of new Map(refs.map((r) => [r.path, r])).values()) {
  const file = path.join(uploadsDir, filenameOf(ref.path))
  if (!fs.existsSync(file)) {
    // Flag every row using this missing file.
    for (const row of refs.filter((r) => r.path === ref.path)) {
      broken.push({ table: row.table, id: row.id, path: row.path })
    }
    continue
  }
  const ext = path.extname(file).toLowerCase()
  const blob = await put(`uploads/${filenameOf(ref.path)}`, fs.readFileSync(file), {
    access: 'public',
    contentType: contentTypes[ext] ?? 'application/octet-stream',
  })
  // Rewrite all rows pointing at this path, in both databases.
  for (const row of refs.filter((r) => r.path === ref.path)) {
    const value = row.json ? JSON.stringify(blob.url) : blob.url
    if (row.table === 'site_settings') {
      lite.prepare(`update site_settings set value = ? where key = ?`).run(value, row.id)
    } else {
      lite.prepare(`update ${row.table} set ${row.col} = ? where ${row.idCol} = ?`).run(value, row.id)
    }
    if (pg) {
      if (row.table === 'site_settings') {
        await pg.query(`update site_settings set value = $1 where key = $2`, [value, row.id])
      } else {
        await pg.query(`update ${row.table} set ${row.col} = $1 where ${row.idCol} = $2`, [value, row.id])
      }
    }
  }
  fixed++
  console.log(`Blob: ${ref.path} -> ${blob.url}`)
}

// Persist the broken list where /admin can read it (both databases).
const payload = JSON.stringify(broken)
lite.prepare(
  `insert into site_settings (key, value, updated_at) values ('broken_images', ?, current_timestamp) on conflict(key) do update set value = excluded.value, updated_at = current_timestamp`,
).run(payload)
if (pg) {
  await pg.query(
    `insert into site_settings (key, value, updated_at) values ('broken_images', $1, current_timestamp) on conflict (key) do update set value = excluded.value, updated_at = current_timestamp`,
    [payload],
  )
}

console.log(`\nDone. Fixed ${fixed} files, ${broken.length} rows still broken:`)
for (const b of broken) console.log(`  ${b.table} id=${b.id} ${b.path}`)
if (broken.length) console.log('Re-upload these through /admin; the badge there lists the count.')
