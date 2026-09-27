import { createFileRoute } from '@tanstack/react-router'
import { authenticate } from '../../server/auth.server'
import { dbAll, dbRun, dbInsertReturningId, type SqlValue } from '../../server/db.server'

const tables = {
  members: { name: 'members', order: 'sort_order asc, created_at desc' },
  events: { name: 'events', order: 'starts_at asc, created_at desc' },
  memories: { name: 'memories', order: 'sort_order asc, created_at desc' },
} as const
type ContentType = keyof typeof tables

const columns: Record<ContentType, string[]> = {
  members: ['name', 'role', 'bio', 'image_path', 'github_url', 'linkedin_url', 'portfolio_url', 'sort_order', 'published'],
  events: ['title', 'kind', 'description', 'starts_at', 'location', 'registration_url', 'cover_image_path', 'published'],
  memories: ['title', 'caption', 'image_path', 'event_id', 'sort_order', 'published'],
}

function table(value: unknown): ContentType | null { return typeof value === 'string' && value in tables ? value as ContentType : null }
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
        if (!(await authenticate(request))) return Response.json({ error: 'Unauthorized' }, { status: 401 })
        const body = await request.json() as { type?: string; data?: Record<string, unknown> }
        const kind = table(body.type)
        if (!kind || !body.data) return Response.json({ error: 'Invalid content payload' }, { status: 400 })
        const { fields, values } = pickedFields(kind, body.data)
        if (!fields.length) return Response.json({ error: 'No fields supplied' }, { status: 400 })
        const result = await dbInsertReturningId(`insert into ${tables[kind].name} (${fields.join(', ')}) values (${fields.map(() => '?').join(', ')})`, values)
        // id last: a client-supplied id in the payload must not shadow the real one
        return Response.json({ ...body.data, id: Number(result.lastInsertRowid) })
      },
      PUT: async ({ request }) => {
        if (!(await authenticate(request))) return Response.json({ error: 'Unauthorized' }, { status: 401 })
        const body = await request.json() as { type?: string; id?: number; data?: Record<string, unknown> }
        const kind = table(body.type)
        if (!kind || !body.id || !body.data) return Response.json({ error: 'Invalid content payload' }, { status: 400 })
        const { fields, values } = pickedFields(kind, body.data)
        if (!fields.length) return Response.json({ error: 'No fields supplied' }, { status: 400 })
        await dbRun(`update ${tables[kind].name} set ${fields.map((field) => `${field} = ?`).join(', ')} where id = ?`, [...values, body.id])
        return Response.json({ ok: true })
      },
      DELETE: async ({ request }) => {
        if (!(await authenticate(request))) return Response.json({ error: 'Unauthorized' }, { status: 401 })
        const body = await request.json() as { type?: string; id?: number }
        const kind = table(body.type)
        if (!kind || !body.id) return Response.json({ error: 'Invalid delete payload' }, { status: 400 })
        // Null out references first (SQLite lacks ON DELETE SET NULL enforcement
        // in some paths; Postgres enforces it) so deletes never 500.
        if (kind === 'events') {
          await dbRun('update memories set event_id = null where event_id = ?', [body.id])
        }
        if (kind === 'memories') {
          await dbRun('delete from memory_media where memory_id = ?', [body.id])
        }
        await dbRun(`delete from ${tables[kind].name} where id = ?`, [body.id])
        return Response.json({ ok: true })
      },
    },
  },
})
