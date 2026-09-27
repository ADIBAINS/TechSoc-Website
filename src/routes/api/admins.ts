import bcrypt from 'bcryptjs'
import { createFileRoute } from '@tanstack/react-router'
import { csrfBlock, requireAdmin } from '../../server/auth.server'
import { dbAll, dbGet, dbInsertReturningId, dbRun } from '../../server/db.server'
import { adminInviteSchema, adminRemoveSchema, readJson } from '../../server/validate'

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
        return Response.json({ id: Number(inserted.lastInsertRowid), email, role }, { status: 201 })
      },
      DELETE: async ({ request }) => {
        const blocked = csrfBlock(request)
        if (blocked) return blocked
        const session = await requireAdmin(request)
        if (!session) return Response.json({ error: 'Admins only' }, { status: 403 })
        const result = await readJson(request, adminRemoveSchema)
        if ('error' in result) return result.error
        if (result.data.id === session.id) return Response.json({ error: 'You cannot remove yourself' }, { status: 400 })
        await dbRun('delete from admins where id = ?', [result.data.id])
        return Response.json({ ok: true })
      },
    },
  },
})
