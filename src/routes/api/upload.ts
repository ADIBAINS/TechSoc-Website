import { randomUUID } from 'node:crypto'
import path from 'node:path'
import fs from 'node:fs/promises'
import { createFileRoute } from '@tanstack/react-router'
import { authenticate, csrfBlock } from '../../server/auth.server'
import { uploadDir, useBlob, logAction } from '../../server/db.server'
import { MAX_UPLOAD_BYTES, sniffKind, uploadContentTypes } from '../../server/upload-validation'

export const Route = createFileRoute('/api/upload')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const blocked = csrfBlock(request)
        if (blocked) return blocked
        const session = await authenticate(request)
        if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })
        let form: FormData
        try { form = await request.formData() }
        catch { return Response.json({ error: 'Invalid upload form' }, { status: 400 }) }
        const file = form.get('file')
        if (!(file instanceof File)) return Response.json({ error: 'A file is required' }, { status: 400 })
        const suffix = path.extname(file.name).toLowerCase()
        const extension = suffix === '.jpeg' ? '.jpg' : suffix
        if (!uploadContentTypes[extension]) return Response.json({ error: 'Upload an image, MP4, GLB, self-contained GLTF, or uncompressed .blend file.' }, { status: 415 })
        if (file.size > MAX_UPLOAD_BYTES) return Response.json({ error: 'Files must be 25MB or smaller' }, { status: 413 })
        const buffer = Buffer.from(await file.arrayBuffer())
        // Extension gate first, then magic-byte sniff must agree with it.
        const sniffed = sniffKind(new Uint8Array(buffer))
        if (!sniffed || sniffed !== extension) {
          return Response.json({ error: extension === '.glb' || extension === '.gltf' ? 'Invalid or incomplete 3D model. Export from Blender as glTF Binary (.glb) with textures included.' : extension === '.blend' ? 'Use an uncompressed Blender file (disable Compress when saving).' : 'File contents do not match its extension' }, { status: 415 })
        }
        const filename = `${randomUUID()}${extension}`

        // Prod (Blob token set): permanent public URL on Vercel Blob CDN.
        if (useBlob()) {
          const { put } = await import('@vercel/blob')
          const blob = await put(`uploads/${filename}`, buffer, {
            access: 'public',
            contentType: uploadContentTypes[extension],
          })
          logAction(session.id, 'upload', undefined, undefined)
          return Response.json({ path: blob.url, filename })
        }

        // Local dev: write to ./uploads (or /tmp/uploads on Vercel without Blob).
        await fs.mkdir(uploadDir, { recursive: true })
        await fs.writeFile(path.join(uploadDir, filename), buffer)
        logAction(session.id, 'upload', undefined, undefined)
        return Response.json({ path: `/api/uploads/${filename}`, filename })
      },
    },
  },
})
