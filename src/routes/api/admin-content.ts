import { createFileRoute } from '@tanstack/react-router'
import { authenticate } from '../../server/auth.server'
import { db } from '../../server/db.server'

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
function allContent() {
  return Object.fromEntries(Object.entries(tables).map(([key, config]) => [key, db.prepare(`select * from ${config.name} order by ${config.order}`).all()]))
}

type SqlValue = string | number | bigint | null
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
      GET: async ({ request }) => authenticate(request) ? Response.json(allContent()) : Response.json({ error: 'Unauthorized' }, { status: 401 }),
      POST: async ({ request }) => {
        if (!authenticate(request)) return Response.json({ error: 'Unauthorized' }, { status: 401 })
        const body = await request.json() as { type?: string; data?: Record<string, unknown> }
        const kind = table(body.type)
        if (!kind || !body.data) return Response.json({ error: 'Invalid content payload' }, { status: 400 })
        const { fields, values } = pickedFields(kind, body.data)
        if (!fields.length) return Response.json({ error: 'No fields supplied' }, { status: 400 })
        const result = db.prepare(`insert into ${tables[kind].name} (${fields.join(', ')}) values (${fields.map(() => '?').join(', ')})`).run(...values)
        // id last: a client-supplied id in the payload must not shadow the real one
        return Response.json({ ...body.data, id: Number(result.lastInsertRowid) })
      },
      PUT: async ({ request }) => {
        if (!authenticate(request)) return Response.json({ error: 'Unauthorized' }, { status: 401 })
        const body = await request.json() as { type?: string; id?: number; data?: Record<string, unknown> }
        const kind = table(body.type)
        if (!kind || !body.id || !body.data) return Response.json({ error: 'Invalid content payload' }, { status: 400 })
        const { fields, values } = pickedFields(kind, body.data)
        if (!fields.length) return Response.json({ error: 'No fields supplied' }, { status: 400 })
        db.prepare(`update ${tables[kind].name} set ${fields.map((field) => `${field} = ?`).join(', ')} where id = ?`).run(...values, body.id)
        return Response.json({ ok: true })
      },
      DELETE: async ({ request }) => {
        if (!authenticate(request)) return Response.json({ error: 'Unauthorized' }, { status: 401 })
        const body = await request.json() as { type?: string; id?: number }
        const kind = table(body.type)
        if (!kind || !body.id) return Response.json({ error: 'Invalid delete payload' }, { status: 400 })
        db.prepare(`delete from ${tables[kind].name} where id = ?`).run(body.id)
        return Response.json({ ok: true })
      },
    },
  },
})
