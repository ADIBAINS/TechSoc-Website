import { createFileRoute } from '@tanstack/react-router'
import { dbAll, dbRun } from '../../server/db.server'
import { authenticate } from '../../server/auth.server'

export const Route = createFileRoute('/api/contact')({
  server: {
    handlers: {
      GET: async ({ request }) => (await authenticate(request)) ? Response.json(await dbAll('select * from contact_submissions order by created_at desc')) : Response.json({ error: 'Unauthorized' }, { status: 401 }),
      POST: async ({ request }) => {
        const body = await request.json() as { name?: string; email?: string; involvement?: string; message?: string }
        if (!body.name?.trim() || !body.email?.includes('@') || !body.message?.trim()) return Response.json({ error: 'Please complete all required fields' }, { status: 400 })
        await dbRun('insert into contact_submissions (name, email, involvement, message) values (?, ?, ?, ?)', [body.name.trim(), body.email.trim(), body.involvement || '', body.message.trim()])
        return Response.json({ ok: true })
      },
    },
  },
})
