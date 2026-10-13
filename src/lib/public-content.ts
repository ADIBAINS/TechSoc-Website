import { createServerFn } from '@tanstack/react-start'
import type { MediaItem } from './media'

export type Member = {
  id: number; name: string; role?: string; bio?: string; image_path?: string
  github_url?: string; linkedin_url?: string; portfolio_url?: string
}
export type EventItem = {
  id: number; title: string; kind?: string; description?: string; starts_at?: string
  location?: string; registration_url?: string; cover_image_path?: string
}
export type Memory = { id: number; title: string; caption?: string; image_path?: string; event_id?: number | null; media?: MediaItem[] }
export type Sponsor = { id: number; name: string; logo_path?: string; url?: string; tier?: string }
export type Work = { id: number; title: string; description?: string; creator?: string; model_path: string; source_path?: string; image_path?: string }
type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue }
export type Content = { members: Member[]; events: EventItem[]; memories: Memory[]; sponsors?: Sponsor[]; works?: Work[]; settings?: Record<string, JsonValue> }

export const getPublicContent = createServerFn({ method: 'GET' }).handler(async () => {
  const { readPublicContent } = await import('../server/content.server')
  return readPublicContent()
})
