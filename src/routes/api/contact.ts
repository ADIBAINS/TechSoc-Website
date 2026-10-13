import { createFileRoute } from '@tanstack/react-router'
import { dbAll, dbGet, dbRun, logAction } from '../../server/db.server'
import { authenticate, csrfBlock, requireAdmin } from '../../server/auth.server'
import { checkRateLimit, clientIp, rateLimitResponse } from '../../server/ratelimit'
import { contactSchema, contactDeleteSchema, readJson } from '../../server/validate'

export const Route = createFileRoute('/api/contact')({
  server: {
    handlers: {
      GET: async ({ request }) => (await authenticate(request)) ? Response.json(await dbAll('select * from contact_submissions order by created_at desc')) : Response.json({ error: 'Unauthorized' }, { status: 401 }),
      DELETE: async ({ request }) => {
        const blocked = csrfBlock(request)
        if (blocked) return blocked
        const session = await requireAdmin(request)
        if (!session) return Response.json({ error: 'Admins only' }, { status: 403 })
        const result = await readJson(request, contactDeleteSchema)
        if ('error' in result) return result.error
        const { id } = result.data
        if (!await dbGet('select id from contact_submissions where id = ?', [id])) {
          return Response.json({ error: 'Message no longer exists' }, { status: 404 })
        }
        await dbRun('delete from contact_submissions where id = ?', [id])
        logAction(session.id, 'contact.delete', 'contact_submissions', id)
        return Response.json({ ok: true })
      },
      POST: async ({ request }) => {
        const blocked = csrfBlock(request)
        if (blocked) return blocked
        // 10 submissions per hour per IP (spam throttle).
        const limit = checkRateLimit(`contact:${clientIp(request)}`, 10, 60 * 60 * 1000)
        if (!limit.allowed) return rateLimitResponse(limit.retryAfterSec)
        const result = await readJson(request, contactSchema)
        if ('error' in result) return result.error
        const { name, email, involvement, message } = result.data
        await dbRun('insert into contact_submissions (name, email, involvement, message) values (?, ?, ?, ?)', [name, email, involvement, message])
        return Response.json({ ok: true })
      },
    },
  },
})
