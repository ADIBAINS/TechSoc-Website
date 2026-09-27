import path from 'node:path'
import fs from 'node:fs/promises'
import { createFileRoute } from '@tanstack/react-router'
import { uploadDir } from '../../server/db.server'

const types: Record<string, string> = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif', '.mp4': 'video/mp4', '.glb': 'model/gltf-binary', '.gltf': 'model/gltf+json' }

export const Route = createFileRoute('/api/uploads/$filename')({
  server: {
    handlers: {
      GET: async ({ params }) => {
        // Local-dev file server. In prod, uploads live on Vercel Blob (absolute
        // https URLs) and never hit this route.
        const filename = path.basename(params.filename)
        const extension = path.extname(filename).toLowerCase()
        if (!types[extension]) return new Response('Not found', { status: 404 })
        try {
          const file = await fs.readFile(path.join(uploadDir, filename))
          return new Response(file as unknown as BodyInit, { headers: { 'content-type': types[extension], 'cache-control': 'public, max-age=31536000, immutable' } })
        } catch { return new Response('Not found', { status: 404 }) }
      },
    },
  },
})
