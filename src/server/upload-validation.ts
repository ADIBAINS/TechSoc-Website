export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024
export const uploadContentTypes: Record<string, string> = {
  '.jpg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif',
  '.mp4': 'video/mp4', '.glb': 'model/gltf-binary', '.gltf': 'model/gltf+json', '.blend': 'application/octet-stream',
}

function gltfDocument(bytes: Uint8Array): Record<string, unknown> | null {
  try {
    const document = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
    if (!document || document.asset?.version !== '2.0') return null
    // A single upload cannot resolve companion .bin/texture files after renaming.
    for (const entries of [document.buffers, document.images]) {
      if (entries !== undefined && !Array.isArray(entries)) return null
      if (entries?.some((entry: { uri?: unknown }) => !entry || (entry.uri !== undefined && (typeof entry.uri !== 'string' || !/^data:[^,]+,/i.test(entry.uri))))) return null
    }
    return document
  } catch { return null }
}

/** Extension allowlist is checked by the handler before these byte checks. */
export function sniffKind(bytes: Uint8Array): string | null {
  const ascii = (start: number, end: number) => new TextDecoder().decode(bytes.subarray(start, end))
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return '.jpg'
  if (bytes.length >= 8 && [137, 80, 78, 71, 13, 10, 26, 10].every((byte, index) => bytes[index] === byte)) return '.png'
  if (bytes.length >= 12 && ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return '.webp'
  if (bytes.length >= 6 && ['GIF87a', 'GIF89a'].includes(ascii(0, 6))) return '.gif'
  if (bytes.length >= 12 && ascii(4, 8) === 'ftyp') return '.mp4'
  if (bytes.length >= 12 && /^BLENDER[_-][vV]\d{3}$/.test(ascii(0, 12))) return '.blend'
  // Blender 5+ supports a 17-byte header for large data-blocks.
  if (bytes.length >= 17 && /^BLENDER17-01v\d{4}$/.test(ascii(0, 17))) return '.blend'
  if (bytes.length >= 20 && ascii(0, 4) === 'glTF') {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    if (view.getUint32(4, true) !== 2 || view.getUint32(8, true) !== bytes.length) return null
    let offset = 12
    let chunks = 0
    while (offset < bytes.length) {
      if (offset + 8 > bytes.length) return null
      const length = view.getUint32(offset, true)
      const kind = view.getUint32(offset + 4, true)
      if (length % 4 || offset + 8 + length > bytes.length) return null
      if (!chunks && (kind !== 0x4e4f534a || !gltfDocument(bytes.subarray(offset + 8, offset + 8 + length)))) return null
      offset += 8 + length
      chunks++
    }
    return chunks ? '.glb' : null
  }
  return gltfDocument(bytes) ? '.gltf' : null
}
