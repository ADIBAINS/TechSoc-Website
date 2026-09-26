import { createFileRoute } from '@tanstack/react-router'
import { authenticate } from '../../server/auth.server'
import { db } from '../../server/db.server'
import { mediaKind } from '../../lib/media'

function listMedia(memoryId: number) {
  return db.prepare('select id, memory_id, path, kind, caption, sort_order from memory_media where memory_id = ? order by sort_order asc, id asc').all(memoryId)
}

export const Route = createFileRoute('/api/memory-media')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!authenticate(request)) return Response.json({ error: 'Unauthorized' }, { status: 401 })
        const id = Number(new URL(request.url).searchParams.get('memory_id'))
        if (!id) return Response.json({ error: 'memory_id is required' }, { status: 400 })
        return Response.json(listMedia(id))
      },
      POST: async ({ request }) => {
        if (!authenticate(request)) return Response.json({ error: 'Unauthorized' }, { status: 401 })
        const body = await request.json() as { memory_id?: number; path?: string; caption?: string }
        const memoryId = Number(body.memory_id)
        const path = body.path?.trim()
        if (!memoryId || !path) return Response.json({ error: 'memory_id and path are required' }, { status: 400 })
        const memory = db.prepare('select image_path from memories where id = ?').get(memoryId) as { image_path: string } | undefined
        if (!memory) return Response.json({ error: 'Memory not found' }, { status: 404 })
        if (db.prepare('select id from memory_media where memory_id = ? and path = ?').get(memoryId, path)) {
          return Response.json({ error: 'That media is already attached' }, { status: 409 })
        }
        const next = db.prepare('select coalesce(max(sort_order), -1) + 1 as next from memory_media where memory_id = ?').get(memoryId) as { next: number }
        const result = db.prepare('insert into memory_media (memory_id, path, kind, caption, sort_order) values (?, ?, ?, ?, ?)').run(memoryId, path, mediaKind(path), body.caption?.trim() ?? '', next.next)
        // The first attachment doubles as the cover thumbnail for the grid card.
        if (!memory.image_path) db.prepare('update memories set image_path = ? where id = ?').run(path, memoryId)
        return Response.json({ id: Number(result.lastInsertRowid), media: listMedia(memoryId) }, { status: 201 })
      },
      PUT: async ({ request }) => {
        if (!authenticate(request)) return Response.json({ error: 'Unauthorized' }, { status: 401 })
        const body = await request.json() as { id?: number; caption?: string; sort_order?: number }
        if (!body.id) return Response.json({ error: 'id is required' }, { status: 400 })
        const fields: string[] = []
        const values: (string | number)[] = []
        if (typeof body.caption === 'string') { fields.push('caption = ?'); values.push(body.caption) }
        if (typeof body.sort_order === 'number') { fields.push('sort_order = ?'); values.push(body.sort_order) }
        if (!fields.length) return Response.json({ error: 'Nothing to update' }, { status: 400 })
        db.prepare(`update memory_media set ${fields.join(', ')} where id = ?`).run(...values, body.id)
        return Response.json({ ok: true })
      },
      DELETE: async ({ request }) => {
        if (!authenticate(request)) return Response.json({ error: 'Unauthorized' }, { status: 401 })
        const body = await request.json() as { id?: number }
        if (!body.id) return Response.json({ error: 'id is required' }, { status: 400 })
        db.prepare('delete from memory_media where id = ?').run(body.id)
        return Response.json({ ok: true })
      },
    },
  },
})
