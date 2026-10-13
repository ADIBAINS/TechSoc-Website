import { collectMedia } from '../lib/media'
import type { Content, EventItem, Member, Memory, Sponsor } from '../lib/public-content'
import { dbAll } from './db.server'

type MediaRow = { memory_id: number; path: string; caption: string | null; sort_order: number }

export async function readPublicContent(): Promise<Content> {
  const [members, events, memoryRows, sponsors, settingsRows, mediaRows] = await Promise.all([
    dbAll<Member>('select * from members where published = 1 order by created_at desc'),
    dbAll<EventItem>('select * from events where published = 1 order by created_at desc'),
    dbAll<Memory>('select * from memories where published = 1 order by created_at desc'),
    dbAll<Sponsor>('select * from sponsors where published = 1 order by sort_order asc, created_at desc'),
    dbAll<{ key: string; value: string }>('select key, value from site_settings'),
    dbAll<MediaRow>('select memory_id, path, caption, sort_order from memory_media order by sort_order asc, id asc'),
  ])
  const settings = Object.fromEntries(settingsRows.map((item) => [item.key, JSON.parse(item.value)]))
  const coverFor = new Map(events.map((event) => [event.id, event.cover_image_path]))
  const mediaByMemory = new Map<number, MediaRow[]>()
  for (const row of mediaRows) {
    const list = mediaByMemory.get(row.memory_id) ?? []
    list.push(row)
    mediaByMemory.set(row.memory_id, list)
  }
  const memories = memoryRows.map((memory) => ({
    ...memory,
    media: collectMedia([
      { path: memory.image_path, caption: memory.caption },
      ...(mediaByMemory.get(memory.id) ?? []),
      { path: memory.event_id ? coverFor.get(memory.event_id) : null },
    ]),
  }))
  return { members, events, memories, sponsors, settings }
}
