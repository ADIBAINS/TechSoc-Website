import { randomUUID } from 'node:crypto'
import path from 'node:path'
import fs from 'node:fs/promises'
import { createFileRoute } from '@tanstack/react-router'
import { authenticate } from '../../server/auth.server'
import { uploadDir, useBlob } from '../../server/db.server'

const extensions: Record<string, string> = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif', 'video/mp4': '.mp4', 'model/gltf-binary': '.glb', 'model/gltf+json': '.gltf' }
const contentTypes: Record<string, string> = { '.jpg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif', '.mp4': 'video/mp4', '.glb': 'model/gltf-binary', '.gltf': 'model/gltf+json' }

export const Route = createFileRoute('/api/upload')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!(await authenticate(request))) return Response.json({ error: 'Unauthorized' }, { status: 401 })
        const form = await request.formData()
        const file = form.get('file')
        if (!(file instanceof File)) return Response.json({ error: 'A file is required' }, { status: 400 })
        const extension = extensions[file.type]
        if (!extension) return Response.json({ error: 'Unsupported file type' }, { status: 415 })
        if (file.size > 25 * 1024 * 1024) return Response.json({ error: 'Files must be smaller than 25MB' }, { status: 413 })
        const filename = `${randomUUID()}${extension}`

        // Prod (Blob token set): permanent public URL on Vercel Blob CDN.
        if (useBlob()) {
          const { put } = await import('@vercel/blob')
          const blob = await put(`uploads/${filename}`, file, {
            access: 'public',
            contentType: contentTypes[extension] ?? file.type,
          })
          return Response.json({ path: blob.url, filename })
        }

        // Local dev: write to ./uploads (or /tmp/uploads on Vercel without Blob).
        await fs.mkdir(uploadDir, { recursive: true })
        await fs.writeFile(path.join(uploadDir, filename), Buffer.from(await file.arrayBuffer()))
        return Response.json({ path: `/api/uploads/${filename}`, filename })
      },
    },
  },
})
