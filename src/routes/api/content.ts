import { createFileRoute } from '@tanstack/react-router'
import { collectMedia } from '../../lib/media'

type MemoryRow = { id: number; image_path: string | null; caption: string | null; event_id: number | null }
type EventRow = { id: number; cover_image_path: string | null }
type MediaRow = { path: string; caption: string | null; sort_order: number }

export const Route = createFileRoute('/api/content')({
  server: {
    handlers: {
      GET: async () => {
        const { db } = await import('../../server/db.server')
        const read = (table: string) => db.prepare(`select * from ${table} where published = 1 order by created_at desc`).all()
        const settings = Object.fromEntries((db.prepare('select key, value from site_settings').all() as { key: string; value: string }[]).map((item) => [item.key, JSON.parse(item.value)]))

        const events = read('events') as unknown as EventRow[]
        const coverFor = new Map(events.map((event) => [event.id, event.cover_image_path]))
        const mediaRows = db.prepare('select memory_id, path, caption, sort_order from memory_media order by sort_order asc, id asc').all() as unknown as (MediaRow & { memory_id: number })[]
        const mediaByMemory = new Map<number, MediaRow[]>()
        for (const row of mediaRows) {
          const list = mediaByMemory.get(row.memory_id) ?? []
          list.push(row)
          mediaByMemory.set(row.memory_id, list)
        }

        const memories = (read('memories') as unknown as MemoryRow[]).map((memory) => ({
          ...memory,
          media: collectMedia([
            { path: memory.image_path, caption: memory.caption },
            ...(mediaByMemory.get(memory.id) ?? []),
            { path: memory.event_id ? coverFor.get(memory.event_id) ?? null : null },
          ]),
        }))

        return Response.json({ members: read('members'), events: read('events'), memories, settings })
      },
    },
  },
})
