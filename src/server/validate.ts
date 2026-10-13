import { z } from 'zod'

// Shared primitives
const email = z.string().trim().toLowerCase().email().max(254)
const id = z.number().int().positive()
const shortText = (max: number) => z.string().trim().max(max)
const contentType = z.enum(['members', 'events', 'memories', 'sponsors', 'works'])

const assetPath = (extensions: string) => z.string().trim().max(2000).refine((value) => {
  if (!value) return true
  try {
    const url = new URL(value, 'https://techsoc.local')
    return (value.startsWith('/api/uploads/') || value.startsWith('/models/') || /^https?:\/\//i.test(value)) && ['https:', 'http:'].includes(url.protocol) && new RegExp(`\\.(${extensions})$`, 'i').test(url.pathname)
  } catch { return false }
}, 'Use an uploaded file path or an HTTP(S) URL with the correct file extension')
const workFields = z.object({
  title: shortText(200).min(1, 'Title is required'),
  description: shortText(5000).optional(), creator: shortText(200).optional(),
  model_path: assetPath('glb|gltf').refine(Boolean, 'Upload a GLB model before saving'),
  source_path: assetPath('blend').optional(), image_path: assetPath('jpg|jpeg|png|webp|gif').optional(),
  published: z.union([z.literal(0), z.literal(1)]).optional(), sort_order: z.number().int().min(0).max(99999).optional(),
})

function validateWork(data: Record<string, unknown>, partial: boolean, ctx: z.RefinementCtx) {
  const parsed = (partial ? workFields.partial() : workFields).safeParse(data)
  if (!parsed.success) for (const issue of parsed.error.issues) ctx.addIssue({ code: 'custom', path: ['data', ...issue.path], message: issue.message })
}

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
export const contactDeleteSchema = z.object({ id })

// /api/admin-content — data keys are allowlisted again by pickedFields;
// zod enforces shape + required fields per type.
const dataRecord = z.record(z.string(), z.unknown())
export const adminCreateSchema = z
  .object({ type: contentType, data: dataRecord })
  .superRefine((body, ctx) => {
    const data = body.data as Record<string, unknown>
    if (body.type === 'works') { validateWork(data, false, ctx); return }
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
}).superRefine((body, ctx) => { if (body.type === 'works') validateWork(body.data, true, ctx) })
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

// /api/admins (admin-only account management)
export const adminInviteSchema = z.object({
  email,
  password: z.string().min(8).max(256),
  role: z.enum(['admin', 'editor']).optional().default('editor'),
})
export const adminRemoveSchema = z.object({ id })
export const adminResetPasswordSchema = z.object({
  id,
  currentPassword: z.string().min(1).max(256),
  newPassword: z.string().min(8).max(256),
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
