import { createFileRoute } from '@tanstack/react-router'
import { authenticate } from '../../server/auth.server'
import { dbAll, dbGet, dbRun } from '../../server/db.server'
import { mediaKind } from '../../lib/media'

function listMedia(memoryId: number) {
  return dbAll('select id, memory_id, path, kind, caption, sort_order from memory_media where memory_id = ? order by sort_order asc, id asc', [memoryId])
}

export const Route = createFileRoute('/api/memory-media')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!(await authenticate(request))) return Response.json({ error: 'Unauthorized' }, { status: 401 })
        const id = Number(new URL(request.url).searchParams.get('memory_id'))
        if (!id) return Response.json({ error: 'memory_id is required' }, { status: 400 })
        return Response.json(await listMedia(id))
      },
      POST: async ({ request }) => {
        if (!(await authenticate(request))) return Response.json({ error: 'Unauthorized' }, { status: 401 })
        const body = await request.json() as { memory_id?: number; path?: string; caption?: string }
        const memoryId = Number(body.memory_id)
        const path = body.path?.trim()
        if (!memoryId || !path) return Response.json({ error: 'memory_id and path are required' }, { status: 400 })
        const memory = await dbGet<{ image_path: string }>('select image_path from memories where id = ?', [memoryId])
        if (!memory) return Response.json({ error: 'Memory not found' }, { status: 404 })
        if (await dbGet('select id from memory_media where memory_id = ? and path = ?', [memoryId, path])) {
          return Response.json({ error: 'That media is already attached' }, { status: 409 })
        }
        const next = await dbGet<{ next: number }>('select coalesce(max(sort_order), -1) + 1 as next from memory_media where memory_id = ?', [memoryId])
        const result = await dbRun('insert into memory_media (memory_id, path, kind, caption, sort_order) values (?, ?, ?, ?, ?)', [memoryId, path, mediaKind(path), body.caption?.trim() ?? '', next?.next ?? 0])
        // The first attachment doubles as the cover thumbnail for the grid card.
        if (!memory.image_path) await dbRun('update memories set image_path = ? where id = ?', [path, memoryId])
        return Response.json({ id: Number(result.lastInsertRowid), media: await listMedia(memoryId) }, { status: 201 })
      },
      PUT: async ({ request }) => {
        if (!(await authenticate(request))) return Response.json({ error: 'Unauthorized' }, { status: 401 })
        const body = await request.json() as { id?: number; caption?: string; sort_order?: number }
        if (!body.id) return Response.json({ error: 'id is required' }, { status: 400 })
        const fields: string[] = []
        const values: (string | number)[] = []
        if (typeof body.caption === 'string') { fields.push('caption = ?'); values.push(body.caption) }
        if (typeof body.sort_order === 'number') { fields.push('sort_order = ?'); values.push(body.sort_order) }
        if (!fields.length) return Response.json({ error: 'Nothing to update' }, { status: 400 })
        await dbRun(`update memory_media set ${fields.join(', ')} where id = ?`, [...values, body.id])
        return Response.json({ ok: true })
      },
      DELETE: async ({ request }) => {
        if (!(await authenticate(request))) return Response.json({ error: 'Unauthorized' }, { status: 401 })
        const body = await request.json() as { id?: number }
        if (!body.id) return Response.json({ error: 'id is required' }, { status: 400 })
        await dbRun('delete from memory_media where id = ?', [body.id])
        return Response.json({ ok: true })
      },
    },
  },
})
