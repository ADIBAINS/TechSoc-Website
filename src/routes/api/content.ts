import { createFileRoute } from '@tanstack/react-router'
import { readPublicContent } from '../../server/content.server'

export const Route = createFileRoute('/api/content')({
  server: {
    handlers: {
      GET: async () => Response.json(await readPublicContent()),
    },
  },
})
