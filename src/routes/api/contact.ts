import { createFileRoute } from '@tanstack/react-router'
import { dbAll, dbRun } from '../../server/db.server'
import { authenticate, csrfBlock } from '../../server/auth.server'
import { checkRateLimit, clientIp, rateLimitResponse } from '../../server/ratelimit'
import { contactSchema, readJson } from '../../server/validate'

export const Route = createFileRoute('/api/contact')({
  server: {
    handlers: {
      GET: async ({ request }) => (await authenticate(request)) ? Response.json(await dbAll('select * from contact_submissions order by created_at desc')) : Response.json({ error: 'Unauthorized' }, { status: 401 }),
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
