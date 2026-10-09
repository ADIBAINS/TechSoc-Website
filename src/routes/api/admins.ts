import bcrypt from '../../server/password.server'
import { createFileRoute } from '@tanstack/react-router'
import { csrfBlock, requireAdmin } from '../../server/auth.server'
import { dbAll, dbGet, dbInsertReturningId, dbRun, logAction } from '../../server/db.server'
import { adminInviteSchema, adminRemoveSchema, adminResetPasswordSchema, readJson } from '../../server/validate'
import { checkRateLimit, rateLimitResponse } from '../../server/ratelimit'

/**
 * Admin account management (role: admin only).
 * Editors can use every content route but never this one.
 */
export const Route = createFileRoute('/api/admins')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const session = await requireAdmin(request)
        if (!session) return Response.json({ error: 'Admins only' }, { status: 403 })
        return Response.json(
          await dbAll('select id, email, role, created_at from admins order by created_at asc'),
        )
      },
      POST: async ({ request }) => {
        const blocked = csrfBlock(request)
        if (blocked) return blocked
        const session = await requireAdmin(request)
        if (!session) return Response.json({ error: 'Admins only' }, { status: 403 })
        const result = await readJson(request, adminInviteSchema)
        if ('error' in result) return result.error
        const { email, password, role } = result.data
        if (await dbGet('select id from admins where email = ?', [email])) {
          return Response.json({ error: 'That email already has an account' }, { status: 409 })
        }
        const inserted = await dbInsertReturningId('insert into admins (email, password_hash, role) values (?, ?, ?)', [
          email,
          bcrypt.hashSync(password, 12),
          role,
        ])
        logAction(session.id, 'admin.invite', 'admins', Number(inserted.lastInsertRowid))
        return Response.json({ id: Number(inserted.lastInsertRowid), email, role }, { status: 201 })
      },
      PUT: async ({ request }) => {
        const blocked = csrfBlock(request)
        if (blocked) return blocked
        const session = await requireAdmin(request)
        if (!session) return Response.json({ error: 'Admins only' }, { status: 403 })
        const result = await readJson(request, adminResetPasswordSchema)
        if ('error' in result) return result.error
        const { id, currentPassword, newPassword } = result.data
        if (id === session.id) return Response.json({ error: 'Use Change password for your own account' }, { status: 400 })
        const limit = checkRateLimit(`admin-password-reset:${session.id}`, 5, 15 * 60 * 1000)
        if (!limit.allowed) return rateLimitResponse(limit.retryAfterSec)
        const actor = await dbGet<{ password_hash: string }>('select password_hash from admins where id = ?', [session.id])
        if (!actor || !bcrypt.compareSync(currentPassword, actor.password_hash)) {
          return Response.json({ error: 'Your current password is incorrect' }, { status: 403 })
        }
        if (!await dbGet('select id from admins where id = ?', [id])) {
          return Response.json({ error: 'Account no longer exists' }, { status: 404 })
        }
        await dbRun('update admins set password_hash = ? where id = ?', [bcrypt.hashSync(newPassword, 12), id])
        await dbRun('delete from sessions where admin_id = ?', [id])
        logAction(session.id, 'admin.password-reset', 'admins', id)
        return Response.json({ ok: true })
      },
      DELETE: async ({ request }) => {
        const blocked = csrfBlock(request)
        if (blocked) return blocked
        const session = await requireAdmin(request)
        if (!session) return Response.json({ error: 'Admins only' }, { status: 403 })
        const result = await readJson(request, adminRemoveSchema)
        if ('error' in result) return result.error
        if (result.data.id === session.id) return Response.json({ error: 'You cannot remove yourself' }, { status: 400 })
        await dbRun('delete from sessions where admin_id = ?', [result.data.id])
        await dbRun('delete from admins where id = ?', [result.data.id])
        logAction(session.id, 'admin.remove', 'admins', result.data.id)
        return Response.json({ ok: true })
      },
    },
  },
})
