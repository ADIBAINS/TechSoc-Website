import bcrypt from 'bcryptjs'
import { createFileRoute } from '@tanstack/react-router'
import { clearSession, createSession, authenticate, sessionCookie } from '../../server/auth.server'
import { db, ensureAdmin } from '../../server/db.server'

export const Route = createFileRoute('/api/auth')({
  server: {
    handlers: {
      GET: async ({ request }) => Response.json({ admin: authenticate(request) }),
      POST: async ({ request }) => {
        ensureAdmin()
        const body = await request.json() as { email?: string; password?: string }
        const admin = db.prepare('select id, email, password_hash from admins where email = ?').get(body.email?.trim().toLowerCase() ?? '') as { id: number; email: string; password_hash: string } | undefined
        if (!admin || !body.password || !bcrypt.compareSync(body.password, admin.password_hash)) return Response.json({ error: 'Invalid email or password' }, { status: 401 })
        const session = createSession(admin.id)
        return new Response(JSON.stringify({ admin: { id: admin.id, email: admin.email } }), { headers: { 'content-type': 'application/json', 'set-cookie': sessionCookie(session.token, session.expires) } })
      },
      DELETE: async ({ request }) => {
        clearSession(request)
        return new Response(null, { status: 204, headers: { 'set-cookie': 'techsoc_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0' } })
      },
    },
  },
})
