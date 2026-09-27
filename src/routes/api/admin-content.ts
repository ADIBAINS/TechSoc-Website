import { createFileRoute } from '@tanstack/react-router'
import { authenticate, csrfBlock } from '../../server/auth.server'
import { dbAll, dbRun, dbInsertReturningId, logAction, type SqlValue } from '../../server/db.server'
import { adminCreateSchema, adminDeleteSchema, adminUpdateSchema, readJson } from '../../server/validate'

const tables = {
  members: { name: 'members', order: 'sort_order asc, created_at desc' },
  events: { name: 'events', order: 'starts_at asc, created_at desc' },
  memories: { name: 'memories', order: 'sort_order asc, created_at desc' },
  sponsors: { name: 'sponsors', order: 'sort_order asc, created_at desc' },
} as const
type ContentType = keyof typeof tables

const columns: Record<ContentType, string[]> = {
  members: ['name', 'role', 'bio', 'image_path', 'github_url', 'linkedin_url', 'portfolio_url', 'sort_order', 'published'],
  events: ['title', 'kind', 'description', 'starts_at', 'location', 'registration_url', 'cover_image_path', 'published'],
  memories: ['title', 'caption', 'image_path', 'event_id', 'sort_order', 'published'],
  sponsors: ['name', 'logo_path', 'url', 'tier', 'sort_order', 'published'],
}

async function allContent() {
  const entries = await Promise.all(
    Object.entries(tables).map(async ([key, config]) => [key, await dbAll(`select * from ${config.name} order by ${config.order}`)]),
  )
  return Object.fromEntries(entries)
}

function sqlValue(input: unknown): SqlValue {
  if (input === null || input === undefined) return ''
  if (typeof input === 'boolean') return input ? 1 : 0
  if (typeof input === 'number' || typeof input === 'bigint' || typeof input === 'string') return input
  return String(input)
}
function pickedFields(kind: ContentType, data: Record<string, unknown>) {
  const fields = columns[kind].filter((field) => field in data)
  return { fields, values: fields.map((field) => sqlValue(data[field])) }
}

export const Route = createFileRoute('/api/admin-content')({
  server: {
    handlers: {
      GET: async ({ request }) => (await authenticate(request)) ? Response.json(await allContent()) : Response.json({ error: 'Unauthorized' }, { status: 401 }),
      POST: async ({ request }) => {
        const blocked = csrfBlock(request)
        if (blocked) return blocked
        const session = await authenticate(request)
        if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })
        const result = await readJson(request, adminCreateSchema)
        if ('error' in result) return result.error
        const { type: kind, data } = result.data
        const { fields, values } = pickedFields(kind, data as Record<string, unknown>)
        if (!fields.length) return Response.json({ error: 'No fields supplied' }, { status: 400 })
        const inserted = await dbInsertReturningId(`insert into ${tables[kind].name} (${fields.join(', ')}) values (${fields.map(() => '?').join(', ')})`, values)
        logAction(session.id, 'content.create', tables[kind].name, Number(inserted.lastInsertRowid))
        // id last: a client-supplied id in the payload must not shadow the real one
        return Response.json({ ...(data as Record<string, unknown>), id: Number(inserted.lastInsertRowid) })
      },
      PUT: async ({ request }) => {
        const blocked = csrfBlock(request)
        if (blocked) return blocked
        const session = await authenticate(request)
        if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })
        const result = await readJson(request, adminUpdateSchema)
        if ('error' in result) return result.error
        const { type: kind, id, data } = result.data
        const { fields, values } = pickedFields(kind, data as Record<string, unknown>)
        if (!fields.length) return Response.json({ error: 'No fields supplied' }, { status: 400 })
        await dbRun(`update ${tables[kind].name} set ${fields.map((field) => `${field} = ?`).join(', ')} where id = ?`, [...values, id])
        logAction(session.id, 'content.update', tables[kind].name, id)
        return Response.json({ ok: true })
      },
      DELETE: async ({ request }) => {
        const blocked = csrfBlock(request)
        if (blocked) return blocked
        const session = await authenticate(request)
        if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })
        const result = await readJson(request, adminDeleteSchema)
        if ('error' in result) return result.error
        const { type: kind, id } = result.data
        // Null out references first (SQLite lacks ON DELETE SET NULL enforcement
        // in some paths; Postgres enforces it) so deletes never 500.
        if (kind === 'events') {
          await dbRun('update memories set event_id = null where event_id = ?', [id])
        }
        if (kind === 'memories') {
          await dbRun('delete from memory_media where memory_id = ?', [id])
        }
        await dbRun(`delete from ${tables[kind].name} where id = ?`, [id])
        logAction(session.id, 'content.delete', tables[kind].name, id)
        return Response.json({ ok: true })
      },
    },
  },
})
