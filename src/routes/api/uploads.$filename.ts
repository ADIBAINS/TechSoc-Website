import path from 'node:path'
import fs from 'node:fs/promises'
import { createFileRoute } from '@tanstack/react-router'
import { uploadDir } from '../../server/db.server'
import { uploadContentTypes } from '../../server/upload-validation'

const types: Record<string, string> = { ...uploadContentTypes, '.jpeg': 'image/jpeg' }

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
          return new Response(file as unknown as BodyInit, { headers: { 'content-type': types[extension], 'cache-control': 'public, max-age=31536000, immutable', 'x-content-type-options': 'nosniff', ...(extension === '.blend' ? { 'content-disposition': `attachment; filename="${filename}"` } : {}) } })
        } catch { return new Response('Not found', { status: 404 }) }
      },
    },
  },
})
