import bcrypt from 'bcryptjs'
import { createFileRoute } from '@tanstack/react-router'
import { clearSession, createSession, authenticate, sessionCookie, csrfBlock } from '../../server/auth.server'
import { dbGet, dbRun, ensureAdmin } from '../../server/db.server'
import { checkRateLimit, clientIp, rateLimitResponse } from '../../server/ratelimit'
import { loginSchema, passwordChangeSchema, readJson } from '../../server/validate'

export const Route = createFileRoute('/api/auth')({
  server: {
    handlers: {
      GET: async ({ request }) => Response.json({ admin: await authenticate(request) }),
      POST: async ({ request }) => {
        const blocked = csrfBlock(request)
        if (blocked) return blocked
        await ensureAdmin()
        // Validate shape first (cheap), then rate-limit per IP+email.
        const raw = await request.json().catch(() => null)
        const parsed = loginSchema.safeParse(raw)
        if (!parsed.success) return Response.json({ error: 'Valid email and password are required' }, { status: 400 })
        const { email, password } = parsed.data
        const limit = checkRateLimit(`login:${clientIp(request)}:${email}`, 5, 15 * 60 * 1000)
        if (!limit.allowed) return rateLimitResponse(limit.retryAfterSec)
        const admin = await dbGet<{ id: number; email: string; role: string | null; password_hash: string }>(
          'select id, email, role, password_hash from admins where email = ?',
          [email],
        )
        if (!admin || !bcrypt.compareSync(password, admin.password_hash)) return Response.json({ error: 'Invalid email or password' }, { status: 401 })
        const session = await createSession(admin.id)
        return new Response(JSON.stringify({ admin: { id: admin.id, email: admin.email, role: admin.role || 'admin' } }), { headers: { 'content-type': 'application/json', 'set-cookie': sessionCookie(session.token, session.expires) } })
      },
      DELETE: async ({ request }) => {
        const blocked = csrfBlock(request)
        if (blocked) return blocked
        await clearSession(request)
        return new Response(null, { status: 204, headers: { 'set-cookie': 'techsoc_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0' } })
      },
      PUT: async ({ request }) => {
        // Change password: session auth + current-password re-entry.
        const blocked = csrfBlock(request)
        if (blocked) return blocked
        const session = await authenticate(request)
        if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })
        const result = await readJson(request, passwordChangeSchema)
        if ('error' in result) return result.error
        const { currentPassword, newPassword } = result.data
        const admin = await dbGet<{ password_hash: string }>('select password_hash from admins where id = ?', [session.id])
        if (!admin || !bcrypt.compareSync(currentPassword, admin.password_hash)) {
          return Response.json({ error: 'Current password is incorrect' }, { status: 403 })
        }
        await dbRun('update admins set password_hash = ? where id = ?', [bcrypt.hashSync(newPassword, 12), session.id])
        return Response.json({ ok: true })
      },
    },
  },
})
