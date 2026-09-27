import { createFileRoute } from '@tanstack/react-router'
import { authenticate, csrfBlock } from '../../server/auth.server'
import { dbAll, dbGet, dbRun } from '../../server/db.server'
import { checkRateLimit, clientIp, rateLimitResponse } from '../../server/ratelimit'
import { readJson, rsvpSchema } from '../../server/validate'

export const Route = createFileRoute('/api/rsvp')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!(await authenticate(request))) return Response.json({ error: 'Unauthorized' }, { status: 401 })
        const eventId = Number(new URL(request.url).searchParams.get('event_id'))
        if (!eventId) return Response.json({ error: 'event_id is required' }, { status: 400 })
        return Response.json(
          await dbAll('select id, event_id, name, email, created_at from event_rsvps where event_id = ? order by created_at asc', [eventId]),
        )
      },
      POST: async ({ request }) => {
        const blocked = csrfBlock(request)
        if (blocked) return blocked
        // 10 RSVPs per hour per IP (spam throttle, same as contact).
        const limit = checkRateLimit(`rsvp:${clientIp(request)}`, 10, 60 * 60 * 1000)
        if (!limit.allowed) return rateLimitResponse(limit.retryAfterSec)
        const result = await readJson(request, rsvpSchema)
        if ('error' in result) return result.error
        const { event_id, name, email } = result.data
        const event = await dbGet<{ id: number }>('select id from events where id = ?', [event_id])
        if (!event) return Response.json({ error: 'Event not found' }, { status: 404 })
        if (await dbGet('select id from event_rsvps where event_id = ? and email = ?', [event_id, email])) {
          return Response.json({ error: 'Already registered with this email', registered: true }, { status: 409 })
        }
        await dbRun('insert into event_rsvps (event_id, name, email) values (?, ?, ?)', [event_id, name, email])
        return Response.json({ ok: true }, { status: 201 })
      },
    },
  },
})
