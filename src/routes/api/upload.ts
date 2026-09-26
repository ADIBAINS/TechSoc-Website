import { randomUUID } from 'node:crypto'
import path from 'node:path'
import fs from 'node:fs/promises'
import { createFileRoute } from '@tanstack/react-router'
import { authenticate } from '../../server/auth.server'
import { uploadDir } from '../../server/db.server'

const extensions: Record<string, string> = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif', 'video/mp4': '.mp4', 'model/gltf-binary': '.glb', 'model/gltf+json': '.gltf' }

export const Route = createFileRoute('/api/upload')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!authenticate(request)) return Response.json({ error: 'Unauthorized' }, { status: 401 })
        const form = await request.formData()
        const file = form.get('file')
        if (!(file instanceof File)) return Response.json({ error: 'A file is required' }, { status: 400 })
        const extension = extensions[file.type]
        if (!extension) return Response.json({ error: 'Unsupported file type' }, { status: 415 })
        if (file.size > 25 * 1024 * 1024) return Response.json({ error: 'Files must be smaller than 25MB' }, { status: 413 })
        const filename = `${randomUUID()}${extension}`
        await fs.writeFile(path.join(uploadDir, filename), Buffer.from(await file.arrayBuffer()))
        return Response.json({ path: `/api/uploads/${filename}`, filename })
      },
    },
  },
})
