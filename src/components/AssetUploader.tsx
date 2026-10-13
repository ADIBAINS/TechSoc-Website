import { useState } from 'react'
import { Check, Upload } from 'lucide-react'

export function AssetUploader({ onUploaded, onBusy, disabled = false, label = 'Choose an asset', accept = 'image/jpeg,image/png,image/webp,image/gif,video/mp4,.glb,.gltf', hint = 'Images, MP4, GLB or GLTF · max 25MB' }: { onUploaded: (path: string) => void; onBusy?: (busy: boolean) => void; disabled?: boolean; label?: string; accept?: string; hint?: string }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [filename, setFilename] = useState('')
  const upload = async (file: File) => {
    setError(''); setFilename('')
    if (file.size > 25 * 1024 * 1024) { setError('Files must be 25MB or smaller. Reduce textures or simplify the mesh before exporting.'); return }
    setBusy(true); onBusy?.(true)
    try {
      const payload = new FormData(); payload.set('file', file)
      const response = await fetch('/api/upload', { method: 'POST', body: payload })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Could not upload this file.')
      onUploaded(result.path); setFilename(file.name)
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Could not connect. Please try again.') }
    finally { setBusy(false); onBusy?.(false) }
  }
  return <div className="admin-asset-upload" aria-busy={busy}>
    <label className="asset-drop" aria-disabled={busy || disabled}>
      {filename ? <Check size={20} /> : <Upload size={20} />}<span><strong>{busy ? 'Uploading…' : label}</strong><small>{hint}</small></span>
      <input type="file" accept={accept} disabled={busy || disabled} onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void upload(file) }} />
    </label>
    {filename && <p className="admin-muted" role="status">Uploaded: {filename}</p>}
    {error && <p className="admin-error" role="alert">{error}</p>}
  </div>
}
