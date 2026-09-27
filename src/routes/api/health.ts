import { createFileRoute } from '@tanstack/react-router'
import { dbGet, isPostgres } from '../../server/db.server'
import { missingProdEnv } from '../../server/env'

/** Liveness + DB check. Ping after deploys instead of eyeballing /api/content. */
export const Route = createFileRoute('/api/health')({
  server: {
    handlers: {
      GET: async () => {
        const db = isPostgres ? 'postgres' : 'sqlite'
        try {
          await dbGet<{ one: number }>('select 1 as one')
        } catch (error) {
          return Response.json({ ok: false, db, error: String(error) }, { status: 500 })
        }
        // Fatal in prod: no DATABASE_URL means ephemeral /tmp storage.
        if (process.env.VERCEL && !process.env.DATABASE_URL) {
          return Response.json({ ok: false, db, error: 'DATABASE_URL missing: running on ephemeral storage' }, { status: 500 })
        }
        const warnings = missingProdEnv()
        return Response.json({ ok: true, db, warnings })
      },
    },
  },
})
