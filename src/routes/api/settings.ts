import { createFileRoute } from '@tanstack/react-router'
import { authenticate, csrfBlock, requireAdmin } from '../../server/auth.server'
import { dbAll, dbRun, logAction } from '../../server/db.server'
import { readJson, settingsSchema } from '../../server/validate'

export const Route = createFileRoute('/api/settings')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!(await authenticate(request))) return Response.json({ error: 'Unauthorized' }, { status: 401 })
        const rows = await dbAll<{ key: string; value: string }>('select key, value from site_settings')
        const settings = Object.fromEntries(rows.map((item) => [item.key, JSON.parse(item.value)]))
        return Response.json(settings)
      },
      PUT: async ({ request }) => {
        const blocked = csrfBlock(request)
        if (blocked) return blocked
        // Site settings (incl. hero asset) are admin-only; editors keep content CRUD.
        const session = await requireAdmin(request)
        if (!session) return Response.json({ error: 'Admins only' }, { status: 403 })
        const result = await readJson(request, settingsSchema)
        if ('error' in result) return result.error
        for (const [key, value] of Object.entries(result.data)) {
          await dbRun(
            `insert into site_settings (key, value, updated_at) values (?, ?, current_timestamp) on conflict(key) do update set value = excluded.value, updated_at = current_timestamp`,
            [key, JSON.stringify(value)],
          )
        }
        logAction(session.id, 'settings.update')
        return Response.json({ ok: true })
      },
    },
  },
})
