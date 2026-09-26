export type MediaKind = 'image' | 'video' | 'model'

export type MediaItem = { path: string; kind: MediaKind; caption?: string }

const VIDEO = /\.(mp4|webm|ogg|mov)(\?.*)?$/i
const MODEL = /\.(glb|gltf)(\?.*)?$/i

export function mediaKind(path: string): MediaKind {
  if (VIDEO.test(path)) return 'video'
  if (MODEL.test(path)) return 'model'
  return 'image'
}

/**
 * Collapses a memory's own cover, its attached media rows, and the cover of the
 * event it belongs to into one de-duplicated list, so a visitor clicking a moment
 * sees everything connected to that gathering.
 */
export function collectMedia(sources: ({ path?: string | null; caption?: string | null } | null | undefined)[]): MediaItem[] {
  const seen = new Set<string>()
  const items: MediaItem[] = []
  for (const source of sources) {
    const path = source?.path?.trim()
    if (!path || seen.has(path)) continue
    seen.add(path)
    items.push({ path, kind: mediaKind(path), caption: source?.caption ?? undefined })
  }
  return items
}
