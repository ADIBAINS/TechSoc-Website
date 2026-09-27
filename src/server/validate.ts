import { z } from 'zod'

// Shared primitives
const email = z.string().trim().toLowerCase().email().max(254)
const id = z.number().int().positive()
const shortText = (max: number) => z.string().trim().max(max)
const contentType = z.enum(['members', 'events', 'memories', 'sponsors'])

// POST /api/auth
export const loginSchema = z.object({
  email,
  password: z.string().min(1).max(256),
})

// PUT /api/auth (password change)
export const passwordChangeSchema = z.object({
  currentPassword: z.string().min(1).max(256),
  newPassword: z.string().min(8).max(256),
})

// POST /api/contact
export const contactSchema = z.object({
  name: z.string().trim().min(1).max(200),
  email,
  involvement: z.string().trim().max(200).optional().default(''),
  message: z.string().trim().min(1).max(5000),
})

// /api/admin-content — data keys are allowlisted again by pickedFields;
// zod enforces shape + required fields per type.
const dataRecord = z.record(z.string(), z.unknown())
export const adminCreateSchema = z
  .object({ type: contentType, data: dataRecord })
  .superRefine((body, ctx) => {
    const data = body.data as Record<string, unknown>
    if (Object.keys(data).length === 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'No fields supplied' })
      return
    }
    const required = body.type === 'members' || body.type === 'sponsors' ? 'name' : 'title'
    if (typeof data[required] !== 'string' || !(data[required] as string).trim()) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${required} is required` })
    }
  })
export const adminUpdateSchema = z.object({
  type: contentType,
  id,
  data: dataRecord.refine((d) => Object.keys(d).length > 0, 'No fields supplied'),
})
export const adminDeleteSchema = z.object({ type: contentType, id })

// /api/memory-media
export const memoryMediaCreateSchema = z.object({
  memory_id: id,
  path: z.string().trim().min(1).max(2000),
  caption: z.string().trim().max(500).optional().default(''),
})
export const memoryMediaUpdateSchema = z
  .object({ id, caption: z.string().max(2000).optional(), sort_order: z.number().int().optional() })
  .refine((b) => b.caption !== undefined || b.sort_order !== undefined, 'Nothing to update')
export const memoryMediaDeleteSchema = z.object({ id })

// PUT /api/settings — arbitrary keys, JSON-serializable values only.
export const settingsSchema = z
  .record(
    z.string(),
    z.unknown().refine(
      (v) => {
        if (v === undefined || typeof v === 'function') return false
        try {
          JSON.stringify(v)
          return true
        } catch {
          return false
        }
      },
      { message: 'Value must be JSON-serializable' },
    ),
  )
  .refine((o) => Object.keys(o).length > 0, 'Nothing to save')

// POST /api/rsvp (public)
export const rsvpSchema = z.object({
  event_id: id,
  name: z.string().trim().min(1).max(200),
  email,
})

/** Parse request JSON against a schema. Returns data or a 400 Response. */
export async function readJson<T extends z.ZodTypeAny>(
  request: Request,
  schema: T,
): Promise<{ data: z.infer<T> } | { error: Response }> {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return { error: Response.json({ error: 'Invalid JSON body' }, { status: 400 }) }
  }
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return { error: Response.json({ error: parsed.error.issues[0]?.message ?? 'Invalid payload' }, { status: 400 }) }
  }
  return { data: parsed.data }
}
