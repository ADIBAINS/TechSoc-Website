import { createFileRoute } from '@tanstack/react-router'
import { dbAll, dbRun } from '../../server/db.server'

/**
 * Nightly hygiene (Vercel Cron, see vercel.json). Deletes expired sessions.
 * Contact submissions are intentionally NEVER deleted here — retention vs
 * hard-delete is a club privacy decision (see OVERVIEW.md); this job only
 * reports the count. Manually runnable: same CRON_SECRET as Bearer token.
 */
export const Route = createFileRoute('/api/cron-cleanup')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const secret = process.env.CRON_SECRET
        if (!secret) return Response.json({ error: 'Cron not configured' }, { status: 500 })
        const auth = request.headers.get('authorization')
        if (auth !== `Bearer ${secret}`) return Response.json({ error: 'Unauthorized' }, { status: 401 })
        const nowExpr = process.env.DATABASE_URL ? 'NOW()' : `datetime('now')`
        await dbRun(`delete from sessions where expires_at < ${nowExpr}`)
        const [{ count }] = await dbAll<{ count: number }>('select count(*) as count from contact_submissions')
        return Response.json({ ok: true, contactSubmissionsRetained: Number(count) })
      },
    },
  },
})
