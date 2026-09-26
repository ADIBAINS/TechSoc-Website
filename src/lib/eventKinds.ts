export const EVENT_KINDS = [
  { value: 'hackathon', label: 'Hackathon', filter: 'Hackathons' },
  { value: 'webinar', label: 'Webinar', filter: 'Webinars' },
  { value: 'workshop', label: 'Workshop', filter: 'Workshops' },
  { value: 'speaker-talk', label: 'Speaker Talk', filter: 'Speaker Talks' },
  { value: 'misc', label: 'Misc', filter: 'Misc' },
] as const

export type EventCategory = (typeof EVENT_KINDS)[number]['value']

const byValue = new Map(EVENT_KINDS.map((kind) => [kind.value, kind]))
const byLabel = new Map(EVENT_KINDS.map((kind) => [kind.label.toLowerCase(), kind]))

export function eventKind(value: string | null | undefined) {
  return byValue.get(value as EventCategory) ?? byLabel.get((value ?? '').trim().toLowerCase()) ?? byValue.get('misc')!
}

/**
 * Maps whatever is stored on an event — including legacy free-text kinds written
 * before the fixed taxonomy existed — onto one of the five known categories.
 * Order matters: the first matching pattern wins.
 */
const CATEGORY_PATTERNS: [EventCategory, RegExp][] = [
  ['hackathon', /hack|buildathon|build sprint|\bjam\b/i],
  ['speaker-talk', /talk|speaker|keynote|panel|lightning|\bama\b|q\s*&\s*a/i],
  ['webinar', /webinar|online|virtual|live\s?stream|\bstream\b|zoom|remote/i],
  ['workshop', /workshop|\blab\b|bootcamp|hands[\s-]?on|build night/i],
]

export function eventCategory(value: string | null | undefined): EventCategory {
  const text = (value ?? '').trim()
  if (!text) return 'misc'
  const exact = byLabel.get(text.toLowerCase()) ?? byValue.get(text.toLowerCase() as EventCategory)
  if (exact) return exact.value
  return CATEGORY_PATTERNS.find(([, pattern]) => pattern.test(text))?.[0] ?? 'misc'
}
