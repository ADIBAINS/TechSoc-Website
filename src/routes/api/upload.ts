import { randomUUID } from 'node:crypto'
import path from 'node:path'
import fs from 'node:fs/promises'
import { createFileRoute } from '@tanstack/react-router'
import { authenticate, csrfBlock } from '../../server/auth.server'
import { uploadDir, useBlob } from '../../server/db.server'

const extensions: Record<string, string> = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif', 'video/mp4': '.mp4', 'model/gltf-binary': '.glb', 'model/gltf+json': '.gltf' }
const contentTypes: Record<string, string> = { '.jpg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif', '.mp4': 'video/mp4', '.glb': 'model/gltf-binary', '.gltf': 'model/gltf+json' }

/** Content-sniff the real file type from magic bytes — never trust the
 *  client-sent MIME/extension alone. Returns the verified extension or null. */
function sniffKind(bytes: Uint8Array): string | null {
  const head = (n: number) => bytes.slice(0, n)
  const ascii = (b: Uint8Array) => String.fromCharCode(...b)
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return '.jpg'
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a) return '.png'
  if (bytes.length >= 12 && ascii(head(4)) === 'RIFF' && ascii(bytes.slice(8, 12)) === 'WEBP') return '.webp'
  if (bytes.length >= 6 && (ascii(head(6)) === 'GIF87a' || ascii(head(6)) === 'GIF89a')) return '.gif'
  if (bytes.length >= 12 && ascii(bytes.slice(4, 8)) === 'ftyp') return '.mp4'
  if (bytes.length >= 12 && ascii(head(4)) === 'glTF') return '.glb'
  if (bytes.length >= 2) {
    const text = ascii(head(64)).trimStart()
    if (text.startsWith('{')) {
      try { JSON.parse(new TextDecoder().decode(bytes.slice(0, 4096))); return '.gltf' } catch { return null }
    }
  }
  return null
}

export const Route = createFileRoute('/api/upload')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const blocked = csrfBlock(request)
        if (blocked) return blocked
        if (!(await authenticate(request))) return Response.json({ error: 'Unauthorized' }, { status: 401 })
        const form = await request.formData()
        const file = form.get('file')
        if (!(file instanceof File)) return Response.json({ error: 'A file is required' }, { status: 400 })
        const extension = extensions[file.type]
        if (!extension) return Response.json({ error: 'Unsupported file type' }, { status: 415 })
        if (file.size > 25 * 1024 * 1024) return Response.json({ error: 'Files must be smaller than 25MB' }, { status: 413 })
        const buffer = Buffer.from(await file.arrayBuffer())
        // Extension gate first, then magic-byte sniff must agree with it.
        const sniffed = sniffKind(new Uint8Array(buffer))
        if (!sniffed || sniffed !== extension) {
          return Response.json({ error: 'File contents do not match its claimed type' }, { status: 415 })
        }
        const filename = `${randomUUID()}${extension}`

        // Prod (Blob token set): permanent public URL on Vercel Blob CDN.
        if (useBlob()) {
          const { put } = await import('@vercel/blob')
          const blob = await put(`uploads/${filename}`, buffer, {
            access: 'public',
            contentType: contentTypes[extension] ?? file.type,
          })
          return Response.json({ path: blob.url, filename })
        }

        // Local dev: write to ./uploads (or /tmp/uploads on Vercel without Blob).
        await fs.mkdir(uploadDir, { recursive: true })
        await fs.writeFile(path.join(uploadDir, filename), buffer)
        return Response.json({ path: `/api/uploads/${filename}`, filename })
      },
    },
  },
})
