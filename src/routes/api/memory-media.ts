import { createFileRoute } from '@tanstack/react-router'
import { authenticate, csrfBlock } from '../../server/auth.server'
import { dbAll, dbGet, dbRun, dbInsertReturningId, logAction } from '../../server/db.server'
import { mediaKind } from '../../lib/media'
import { memoryMediaCreateSchema, memoryMediaDeleteSchema, memoryMediaUpdateSchema, readJson } from '../../server/validate'

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
        const blocked = csrfBlock(request)
        if (blocked) return blocked
        const session = await authenticate(request)
        if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })
        const result = await readJson(request, memoryMediaCreateSchema)
        if ('error' in result) return result.error
        const { memory_id: memoryId, path, caption } = result.data
        const memory = await dbGet<{ image_path: string }>('select image_path from memories where id = ?', [memoryId])
        if (!memory) return Response.json({ error: 'Memory not found' }, { status: 404 })
        if (await dbGet('select id from memory_media where memory_id = ? and path = ?', [memoryId, path])) {
          return Response.json({ error: 'That media is already attached' }, { status: 409 })
        }
        const next = await dbGet<{ next: number }>('select coalesce(max(sort_order), -1) + 1 as next from memory_media where memory_id = ?', [memoryId])
        const inserted = await dbInsertReturningId('insert into memory_media (memory_id, path, kind, caption, sort_order) values (?, ?, ?, ?, ?)', [memoryId, path, mediaKind(path), caption, next?.next ?? 0])
        // The first attachment doubles as the cover thumbnail for the grid card.
        if (!memory.image_path) await dbRun('update memories set image_path = ? where id = ?', [path, memoryId])
        logAction(session.id, 'media.attach', 'memory_media', Number(inserted.lastInsertRowid))
        return Response.json({ id: Number(inserted.lastInsertRowid), media: await listMedia(memoryId) }, { status: 201 })
      },
      PUT: async ({ request }) => {
        const blocked = csrfBlock(request)
        if (blocked) return blocked
        const session = await authenticate(request)
        if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })
        const result = await readJson(request, memoryMediaUpdateSchema)
        if ('error' in result) return result.error
        const { id, caption, sort_order } = result.data
        const fields: string[] = []
        const values: (string | number)[] = []
        if (typeof caption === 'string') { fields.push('caption = ?'); values.push(caption) }
        if (typeof sort_order === 'number') { fields.push('sort_order = ?'); values.push(sort_order) }
        await dbRun(`update memory_media set ${fields.join(', ')} where id = ?`, [...values, id])
        logAction(session.id, 'media.update', 'memory_media', id)
        return Response.json({ ok: true })
      },
      DELETE: async ({ request }) => {
        const blocked = csrfBlock(request)
        if (blocked) return blocked
        const session = await authenticate(request)
        if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })
        const result = await readJson(request, memoryMediaDeleteSchema)
        if ('error' in result) return result.error
        await dbRun('delete from memory_media where id = ?', [result.data.id])
        logAction(session.id, 'media.delete', 'memory_media', result.data.id)
        return Response.json({ ok: true })
      },
    },
  },
})
