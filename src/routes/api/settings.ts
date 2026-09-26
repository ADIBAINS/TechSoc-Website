import { createFileRoute } from '@tanstack/react-router'
import { authenticate } from '../../server/auth.server'
import { db } from '../../server/db.server'

export const Route = createFileRoute('/api/settings')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!authenticate(request)) return Response.json({ error: 'Unauthorized' }, { status: 401 })
        const settings = Object.fromEntries((db.prepare('select key, value from site_settings').all() as { key: string; value: string }[]).map((item) => [item.key, JSON.parse(item.value)]))
        return Response.json(settings)
      },
      PUT: async ({ request }) => {
        if (!authenticate(request)) return Response.json({ error: 'Unauthorized' }, { status: 401 })
        const body = await request.json() as Record<string, unknown>
        const save = db.prepare(`insert into site_settings (key, value, updated_at) values (?, ?, current_timestamp) on conflict(key) do update set value = excluded.value, updated_at = current_timestamp`)
        for (const [key, value] of Object.entries(body)) save.run(key, JSON.stringify(value))
        return Response.json({ ok: true })
      },
    },
  },
})
