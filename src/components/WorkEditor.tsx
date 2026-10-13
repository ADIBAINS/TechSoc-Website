import { useState, type FormEvent } from 'react'
import { Save, X } from 'lucide-react'
import { AssetUploader } from './AssetUploader'
import { MediaSurface } from './MediaSurface'

export function WorkEditor({ initial, onClose, onSaved }: { initial: Record<string, unknown> & { id: number }; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({ title: String(initial.title ?? ''), creator: String(initial.creator ?? ''), description: String(initial.description ?? ''), model_path: String(initial.model_path ?? ''), source_path: String(initial.source_path ?? ''), image_path: String(initial.image_path ?? ''), published: Number(initial.published ?? 1), sort_order: Number(initial.sort_order ?? 0) })
  const [uploads, setUploads] = useState(0)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const busy = saving || uploads > 0
  const set = (patch: Partial<typeof form>) => setForm((current) => ({ ...current, ...patch }))
  const onBusy = (active: boolean) => setUploads((count) => Math.max(0, count + (active ? 1 : -1)))
  const save = async (event: FormEvent) => {
    event.preventDefault(); setError('')
    if (!form.model_path) { setError('Upload a GLB model before saving.'); return }
    setSaving(true)
    try {
      const response = await fetch('/api/admin-content', { method: initial.id ? 'PUT' : 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ type: 'works', ...(initial.id ? { id: initial.id } : {}), data: form }) })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Could not save this work.')
      onSaved()
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Could not connect. Please try again.') }
    finally { setSaving(false) }
  }
  return <aside className="admin-editor">
    <div className="admin-editor-head"><div><span className="admin-kicker">{initial.id ? 'Edit' : 'New'} 3D work</span><h2>Blender showcase</h2></div><button type="button" disabled={busy} onClick={onClose} aria-label="Close 3D work editor"><X size={18} /></button></div>
    <form className="admin-form" onSubmit={save} aria-busy={busy}>
      <fieldset disabled={busy} className="admin-work-fields">
        <label>Title<input value={form.title} onChange={(event) => set({ title: event.target.value })} required maxLength={200} /></label>
        <label>Created by<input value={form.creator} onChange={(event) => set({ creator: event.target.value })} maxLength={200} placeholder="Your name or team" /></label>
        <label>About this work<textarea value={form.description} onChange={(event) => set({ description: event.target.value })} maxLength={5000} rows={3} /></label>
      </fieldset>
      <div className="admin-blender-guide"><strong>From Blender to the browser</strong><p>File → Export → glTF 2.0 → glTF Binary (.glb). Include materials, textures, and animations. Keep the file under 25MB.</p><a href="https://docs.blender.org/manual/en/latest/addons/scene_gltf2.html" target="_blank" rel="noreferrer">Blender export guide ↗</a></div>
      <AssetUploader disabled={saving} label={form.model_path ? 'Replace 3D model' : 'Upload 3D model'} accept=".glb,.gltf" hint="GLB recommended · self-contained GLTF accepted · max 25MB" onUploaded={(model_path) => set({ model_path })} onBusy={onBusy} />
      {form.model_path && <><MediaSurface key={form.model_path} item={{ path: form.model_path, kind: 'model' }} alt={form.title || '3D work preview'} className="admin-model-preview" controls /><p className="admin-muted">Drag to orbit · scroll or pinch to zoom. This preview is how visitors will see your work.</p></>}
      <AssetUploader disabled={saving} label="Upload cover image (optional)" accept="image/jpeg,image/png,image/webp,image/gif" hint="Used in the gallery · JPG, PNG, WebP or GIF" onUploaded={(image_path) => set({ image_path })} onBusy={onBusy} />
      {form.image_path && <div className="admin-work-attachment"><img src={form.image_path} alt="Gallery cover" /><button type="button" disabled={busy} className="admin-secondary" onClick={() => set({ image_path: '' })}>Remove cover</button></div>}
      <AssetUploader disabled={saving} label="Attach Blender source (optional)" accept=".blend" hint="Uncompressed .blend · max 25MB · public download" onUploaded={(source_path) => set({ source_path })} onBusy={onBusy} />
      {form.source_path && <div className="admin-work-attachment"><a href={form.source_path} download>Download attached .blend</a><button type="button" disabled={busy} className="admin-secondary" onClick={() => set({ source_path: '' })}>Remove source</button></div>}
      <fieldset disabled={busy} className="admin-work-fields">
        <label>Visibility<select value={form.published} onChange={(event) => set({ published: Number(event.target.value) })}><option value={1}>Published — visible on the website</option><option value={0}>Draft — hidden from the website</option></select></label>
        <label>Display order<input type="number" min={0} max={99999} step={1} value={form.sort_order} onChange={(event) => set({ sort_order: Number(event.target.value) })} /></label>
      </fieldset>
      {error && <p className="admin-error" role="alert">{error}</p>}
      {!form.model_path && <p className="admin-muted">A 3D model is required to save this work.</p>}
      <button className="admin-primary" disabled={busy || !form.model_path}><Save size={16} />{uploads ? 'Uploading…' : saving ? 'Saving…' : 'Save 3D work'}</button>
    </form>
  </aside>
}
