import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { ChevronDown, ChevronUp, ImagePlus, LogOut, Pencil, Plus, Save, Star, Trash2, Upload, X } from 'lucide-react'
import { EVENT_KINDS } from '../lib/eventKinds'

export const Route = createFileRoute('/admin')({ component: Admin })

type AdminRecord = Record<string, unknown> & { id: number }
type AdminData = { members: AdminRecord[]; events: AdminRecord[]; memories: AdminRecord[] }
type MediaRow = { id: number; path: string; kind: string; caption: string; sort_order: number }
type ContentTab = keyof AdminData
type Tab = ContentTab | 'hero' | 'inbox'
const contentTabs: ContentTab[] = ['members', 'events', 'memories']
const allTabs: Tab[] = [...contentTabs, 'hero', 'inbox']
const emptyData: AdminData = { members: [], events: [], memories: [] }
const isContentTab = (tab: Tab): tab is ContentTab => (contentTabs as string[]).includes(tab)
// Naive de-pluralising breaks on "memories" -> "memorie", so map it explicitly.
const SINGULAR: Record<ContentTab, string> = { members: 'member', events: 'event', memories: 'memory' }
const singular = (tab: ContentTab) => SINGULAR[tab]
const jsonHeaders = { 'content-type': 'application/json' }

function Admin() {
  const [admin, setAdmin] = useState<{ email: string } | null>(null)
  const [checking, setChecking] = useState(true)
  useEffect(() => { fetch('/api/auth').then((response) => response.json()).then((data) => { setAdmin(data.admin); setChecking(false) }).catch(() => setChecking(false)) }, [])
  if (checking) return <div className="admin-page"><p className="admin-muted">Opening control room…</p></div>
  return admin ? <Dashboard admin={admin} onLogout={() => setAdmin(null)} /> : <Login onLogin={setAdmin} />
}

function Login({ onLogin }: { onLogin: (admin: { email: string }) => void }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const submit = async (event: FormEvent) => { event.preventDefault(); setBusy(true); setError(''); const response = await fetch('/api/auth', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password }) }); const data = await response.json(); setBusy(false); if (!response.ok) { setError(data.error || 'Unable to sign in'); return } onLogin(data.admin) }
  return <main className="admin-page admin-login"><div className="admin-login-mark">ts</div><span className="admin-kicker">techsoc / control room</span><h1>Private admin.</h1><p className="admin-muted">Sign in to manage members, events, memories, and the homepage assets.</p><form className="admin-form" onSubmit={submit}><label>Email<input value={email} onChange={(event) => setEmail(event.target.value)} type="email" required autoComplete="email" placeholder="you@example.com" /></label><label>Password<input value={password} onChange={(event) => setPassword(event.target.value)} type="password" required autoComplete="current-password" /></label>{error && <p className="admin-error">{error}</p>}<button className="admin-primary" disabled={busy}>{busy ? 'Signing in…' : 'Enter control room'}</button></form><a className="admin-back" href="/">← Back to public site</a></main>
}

function Dashboard({ admin, onLogout }: { admin: { email: string }; onLogout: () => void }) {
  const [tab, setTab] = useState<Tab>('members')
  const [data, setData] = useState<AdminData>(emptyData)
  const [editing, setEditing] = useState<AdminRecord | null>(null)
  const [notice, setNotice] = useState('')
  const [heroAsset, setHeroAsset] = useState('')
  const [messages, setMessages] = useState<AdminRecord[]>([])
  const refresh = () => fetch('/api/admin-content').then((response) => response.json()).then(setData)
  const refreshMessages = () => fetch('/api/contact').then((response) => response.ok ? response.json() : []).then(setMessages).catch(() => {})
  useEffect(() => { refresh(); refreshMessages() }, [])
  useEffect(() => {
    if (tab !== 'hero' || heroAsset) return
    fetch('/api/settings').then((response) => response.ok ? response.json() : null).then((settings) => { if (settings?.hero_asset) setHeroAsset(settings.hero_asset) }).catch(() => {})
  }, [tab])
  const logout = async () => { await fetch('/api/auth', { method: 'DELETE' }); onLogout() }
  const remove = async (type: ContentTab, id: number) => { if (!window.confirm('Delete this item?')) return; await fetch('/api/admin-content', { method: 'DELETE', headers: jsonHeaders, body: JSON.stringify({ type, id }) }); setNotice('Deleted.'); refresh() }
  const saveHero = async () => { if (!heroAsset) return; await fetch('/api/settings', { method: 'PUT', headers: jsonHeaders, body: JSON.stringify({ hero_asset: heroAsset }) }); setNotice('Homepage hero asset saved.') }
  const switchTab = (next: Tab) => { setTab(next); setEditing(null) }
  return <main className="admin-page admin-dashboard"><header className="admin-topbar"><div><span className="admin-kicker">techsoc / control room</span><h1>Content desk.</h1></div><div className="admin-account"><span>{admin.email}</span><button onClick={logout}><LogOut size={15} /> Sign out</button></div></header><div className="admin-tabs">{allTabs.map((item) => <button className={tab === item ? 'active' : ''} key={item} onClick={() => switchTab(item)}>{item === 'hero' ? 'hero asset' : item}{item === 'inbox' ? <b>{messages.length}</b> : isContentTab(item) ? <b>{data[item].length}</b> : null}</button>)}<a href="/">View public site ↗</a></div>{notice && <div className="admin-notice">{notice}<button onClick={() => setNotice('')}><X size={14} /></button></div>}{tab === 'hero' ? <HeroAsset value={heroAsset} onChange={setHeroAsset} onSave={saveHero} /> : tab === 'inbox' ? <Inbox messages={messages} onRefresh={refreshMessages} /> : <ContentPanel tab={tab} data={data} editing={editing} setEditing={setEditing} onDelete={remove} onSaved={() => { setEditing(null); setNotice('Saved.'); refresh() }} onRefresh={refresh} />}<PasswordChange notify={setNotice} /></main>
}

function PasswordChange({ notify }: { notify: (message: string) => void }) {
  const [open, setOpen] = useState(false)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError('')
    const response = await fetch('/api/auth', { method: 'PUT', headers: jsonHeaders, body: JSON.stringify({ currentPassword, newPassword }) })
    const result = await response.json().catch(() => ({})) as { error?: string }
    setBusy(false)
    if (!response.ok) { setError(result.error ?? 'Could not change password'); return }
    setCurrentPassword(''); setNewPassword(''); setOpen(false); notify('Password changed.')
  }
  return <section className="admin-inbox admin-panel"><div className="admin-list-head"><div><span className="admin-kicker">Security</span><h2>Password</h2></div><button className="admin-secondary" onClick={() => setOpen(!open)}>{open ? 'Cancel' : 'Change password'}</button></div>{open && <form className="admin-form" onSubmit={submit}><label>Current password<input value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} type="password" required autoComplete="current-password" /></label><label>New password (8+ characters)<input value={newPassword} onChange={(event) => setNewPassword(event.target.value)} type="password" required minLength={8} autoComplete="new-password" /></label>{error && <p className="admin-error">{error}</p>}<button className="admin-primary" disabled={busy}>{busy ? 'Saving…' : 'Save new password'}</button></form>}</section>
}

function ContentPanel({ tab, data, editing, setEditing, onDelete, onSaved, onRefresh }: { tab: ContentTab; data: AdminData; editing: AdminRecord | null; setEditing: (record: AdminRecord | null) => void; onDelete: (type: ContentTab, id: number) => void; onSaved: () => void; onRefresh: () => void }) {
  return <section className="admin-layout"><div className="admin-list"><div className="admin-list-head"><div><span className="admin-kicker">Published content</span><h2>{tab}</h2></div><button className="admin-secondary" onClick={() => setEditing({ id: 0 })}><Plus size={16} /> Add {singular(tab)}</button></div>{data[tab].map((record) => <AdminRow key={record.id} record={record} onEdit={() => setEditing(record)} onDelete={() => onDelete(tab, record.id)} />)}{!data[tab].length && <div className="admin-empty">Nothing here yet. Add your first {singular(tab)}.</div>}</div>{editing && <Editor type={tab} initial={editing} onClose={() => setEditing(null)} onSaved={onSaved} onRefresh={onRefresh} />}</section>
}

function HeroAsset({ value, onChange, onSave }: { value: string; onChange: (value: string) => void; onSave: () => void }) {
  return <section className="admin-assets admin-panel"><div><span className="admin-kicker">Visual assets</span><h2>Homepage Blender / hero asset</h2><p className="admin-muted">Upload an image, MP4, or GLB file, then save its public path for the homepage hero. The homepage picks this up on its next load.</p>{value && <p className="admin-muted">Currently serving <code>{value}</code></p>}</div><AssetUploader onUploaded={onChange} /><div className="asset-save"><input value={value} onChange={(event) => onChange(event.target.value)} placeholder="Uploaded asset path" /><button className="admin-primary" onClick={onSave} disabled={!value}><Save size={15} /> Save hero asset</button></div></section>
}

function AdminRow({ record, onEdit, onDelete }: { record: AdminRecord; onEdit: () => void; onDelete: () => void }) { return <div className="admin-row"><div>{typeof record.image_path === 'string' && record.image_path ? <img src={record.image_path} alt="" /> : typeof record.cover_image_path === 'string' && record.cover_image_path ? <img src={record.cover_image_path} alt="" /> : <span className="admin-row-mark">✳</span>}<div><strong>{String(record.name || record.title || 'Untitled')}</strong><small>{String(record.role || record.kind || record.caption || 'Published content')}</small></div></div><span className="admin-row-date">{String(record.starts_at || record.created_at || '')}</span><div className="admin-row-actions"><button onClick={onEdit} aria-label="Edit"><Pencil size={15} /></button><button onClick={onDelete} aria-label="Delete"><Trash2 size={15} /></button></div></div> }

function FileDrop({ label, hint, accept, multiple, onFiles, disabled }: { label: string; hint: string; accept: string; multiple?: boolean; onFiles: (files: FileList | null) => void; disabled?: boolean }) {
  return (
    <label className="file-drop">
      <Upload size={16} />
      <span><strong>{label}</strong><small>{hint}</small></span>
      <input type="file" accept={accept} multiple={multiple} disabled={disabled} onChange={(event) => onFiles(event.target.files)} />
    </label>
  )
}

function MemoryMedia({ memoryId, coverPath, onChanged }: { memoryId: number; coverPath: string; onChanged: () => void }) {
  const [items, setItems] = useState<MediaRow[]>([])
  const [cover, setCover] = useState(coverPath)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { setCover(coverPath) }, [coverPath])

  const load = useCallback(async () => {
    const response = await fetch(`/api/memory-media?memory_id=${memoryId}`)
    const rows: MediaRow[] = response.ok ? await response.json() : []
    // The cover may predate the media table, so make sure it is always listed too.
    if (cover && !rows.some((row) => row.path === cover)) {
      await fetch('/api/memory-media', { method: 'POST', headers: jsonHeaders, body: JSON.stringify({ memory_id: memoryId, path: cover }) })
      const retry = await fetch(`/api/memory-media?memory_id=${memoryId}`)
      setItems(retry.ok ? await retry.json() : rows)
      return
    }
    setItems(rows)
  }, [memoryId, cover])

  useEffect(() => { load() }, [load])

  const add = async (files: FileList | null) => {
    if (!files?.length) return
    setBusy(true); setError('')
    for (const file of Array.from(files)) {
      const payload = new FormData()
      payload.set('file', file)
      const uploaded = await fetch('/api/upload', { method: 'POST', body: payload })
      if (!uploaded.ok) { setError(`Could not upload ${file.name}`); continue }
      const { path } = await uploaded.json() as { path: string }
      const attached = await fetch('/api/memory-media', { method: 'POST', headers: jsonHeaders, body: JSON.stringify({ memory_id: memoryId, path }) })
      if (!attached.ok) {
        const result = await attached.json().catch(() => ({})) as { error?: string }
        setError(result.error ?? `Could not attach ${file.name}`)
      }
    }
    setBusy(false); await load(); onChanged()
  }

  const remove = async (id: number) => {
    await fetch('/api/memory-media', { method: 'DELETE', headers: jsonHeaders, body: JSON.stringify({ id }) })
    await load(); onChanged()
  }

  const makeCover = async (path: string) => {
    const response = await fetch('/api/admin-content', { method: 'PUT', headers: jsonHeaders, body: JSON.stringify({ type: 'memories', id: memoryId, data: { image_path: path } }) })
    if (!response.ok) { setError('Could not set the cover image'); return }
    setCover(path)
    await load(); onChanged()
  }

  const move = async (index: number, delta: number) => {
    const current = items[index]
    const target = items[index + delta]
    if (!current || !target) return
    // Swap the stored values rather than renumbering by index, so no gaps or
    // duplicate sort_order values are introduced.
    await fetch('/api/memory-media', { method: 'PUT', headers: jsonHeaders, body: JSON.stringify({ id: current.id, sort_order: target.sort_order }) })
    await fetch('/api/memory-media', { method: 'PUT', headers: jsonHeaders, body: JSON.stringify({ id: target.id, sort_order: current.sort_order }) })
    await load()
  }

  return (
    <div className="media-manager">
      <div className="media-manager-head">
        <span className="admin-kicker">Media</span>
        <b>{items.length} {items.length === 1 ? 'item' : 'items'}</b>
      </div>

      {items.length > 0 ? (
        <ul className="media-manager-list">
          {items.map((item, index) => {
            const isCover = item.path === cover
            return (
              <li key={item.id} className={isCover ? 'is-cover' : ''}>
                <span className="media-manager-index">{index + 1}</span>
                {item.kind === 'image' ? <img src={item.path} alt="" /> : <span className={`media-manager-file is-${item.kind}`}>{item.kind === 'video' ? 'MP4' : '3D'}</span>}
                <span className="media-manager-meta">
                  <small title={item.path}>{item.path.split('/').pop()}</small>
                  <em>{item.kind === 'model' ? '3D model' : item.kind === 'video' ? 'Video' : 'Image'}{isCover ? ' · cover' : ''}</em>
                </span>
                <span className="media-manager-actions">
                  <button type="button" onClick={() => makeCover(item.path)} disabled={isCover} aria-label={isCover ? 'This is the cover' : `Use ${item.path} as cover`} title={isCover ? 'This is the cover' : 'Use as cover'}><Star size={13} fill={isCover ? 'currentColor' : 'none'} /></button>
                  <button type="button" onClick={() => move(index, -1)} disabled={index === 0} aria-label={`Move ${item.path} earlier`} title="Move earlier"><ChevronUp size={13} /></button>
                  <button type="button" onClick={() => move(index, 1)} disabled={index === items.length - 1} aria-label={`Move ${item.path} later`} title="Move later"><ChevronDown size={13} /></button>
                  <button type="button" className="is-danger" onClick={() => remove(item.id)} aria-label={`Remove ${item.path}`} title="Remove"><Trash2 size={13} /></button>
                </span>
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="media-manager-empty">No media yet. Add photos, clips, or 3D files below — the first one becomes the cover image.</p>
      )}

      <FileDrop label={busy ? 'Uploading…' : 'Attach media'} hint="Images, MP4, GLB or GLTF · pick as many as you like" accept="image/*,video/mp4,.glb,.gltf" multiple onFiles={add} disabled={busy} />
      {error && <p className="admin-error">{error}</p>}
    </div>
  )
}

function Editor({ type, initial, onClose, onSaved, onRefresh }: { type: ContentTab; initial: AdminRecord; onClose: () => void; onSaved: () => void; onRefresh: () => void }) {
  const [form, setForm] = useState<Record<string, string>>(() => Object.fromEntries(Object.entries(initial).map(([key, value]) => [key, String(value ?? '')])))
  const [files, setFiles] = useState<File[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const fields = type === 'members' ? [['name', 'Name'], ['role', 'Role'], ['bio', 'Bio'], ['github_url', 'GitHub URL'], ['linkedin_url', 'LinkedIn URL'], ['portfolio_url', 'Portfolio URL']] : type === 'events' ? [['title', 'Title'], ['kind', 'Kind'], ['description', 'Description'], ['starts_at', 'Starts at'], ['location', 'Location'], ['registration_url', 'Registration URL']] : [['title', 'Title'], ['caption', 'Caption']]
  const set = (key: string, value: string) => setForm((current) => ({ ...current, [key]: value }))
  // A memory needs a cover to exist at all, so require one before it can be saved.
  const needsCover = type === 'memories' && !initial.id
  const missingCover = needsCover && files.length === 0

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (missingCover) { setError('Choose at least one photo for this moment'); return }
    setBusy(true); setError('')
    let values = { ...form }
    delete values.id
    if (type === 'memories' && initial.id) delete values.image_path

    const uploaded: string[] = []
    for (const item of files) {
      const payload = new FormData()
      payload.set('file', item)
      const response = await fetch('/api/upload', { method: 'POST', body: payload })
      if (!response.ok) { setError(`Could not upload ${item.name}`); continue }
      const { path } = await response.json() as { path: string }
      uploaded.push(path)
    }
    if (uploaded.length) {
      if (type === 'memories') values.image_path = uploaded[0]
      else values[type === 'events' ? 'cover_image_path' : 'image_path'] = uploaded[0]
    }

    const response = await fetch('/api/admin-content', { method: initial.id ? 'PUT' : 'POST', headers: jsonHeaders, body: JSON.stringify(initial.id ? { type, id: initial.id, data: values } : { type, data: values }) })
    const result = await response.json().catch(() => ({})) as { id?: number; error?: string }
    if (!response.ok) { setBusy(false); setError(result.error ?? 'Could not save this record'); return }

    // A brand new moment only gets its id after saving, so attach the rest now.
    if (type === 'memories' && !initial.id && result.id) {
      for (const path of uploaded.slice(1)) {
        const attached = await fetch('/api/memory-media', { method: 'POST', headers: jsonHeaders, body: JSON.stringify({ memory_id: result.id, path }) })
        if (!attached.ok) {
          const failure = await attached.json().catch(() => ({})) as { error?: string }
          setError(failure.error ?? `Saved, but ${path.split('/').pop()} could not be attached`)
        }
      }
    }
    setBusy(false)
    onSaved()
  }

  return <aside className="admin-editor"><div className="admin-editor-head"><div><span className="admin-kicker">{initial.id ? 'Edit' : 'New'} record</span><h2>{singular(type)}</h2></div><button onClick={onClose}><X size={18} /></button></div><form className="admin-form" onSubmit={submit}>{fields.map(([key, label]) => <label key={key}>{label}{renderField(key, form[key] ?? '', set)}</label>)}
    {type === 'memories'
      ? initial.id
        ? <MemoryMedia memoryId={initial.id} coverPath={String(initial.image_path ?? form.image_path ?? '')} onChanged={onRefresh} />
        : <div className="media-manager"><div className="media-manager-head"><span className="admin-kicker">Media</span><b>{files.length ? `${files.length} selected` : 'none selected'}</b></div>{files.length > 0 && <ul className="media-manager-list">{files.map((item, index) => <li key={`${item.name}-${index}`}><span className="media-manager-index">{index + 1}</span>{item.type.startsWith('image/') ? <img src={URL.createObjectURL(item)} alt="" /> : <span className="media-manager-file">{item.type.startsWith('video/') ? 'MP4' : 'FILE'}</span>}<span className="media-manager-meta"><small title={item.name}>{item.name}</small><em>{(item.size / 1024).toFixed(0)} KB</em></span><span className="media-manager-actions"><button type="button" className="is-danger" onClick={() => setFiles((current) => current.filter((_, position) => position !== index))} aria-label={`Remove ${item.name}`} title="Remove"><Trash2 size={13} /></button></span></li>)}</ul>}<FileDrop label={files.length ? 'Add more media' : 'Add photos, clips, or 3D files'} hint="Images, MP4, GLB or GLTF · the first becomes the cover" accept="image/*,video/mp4,.glb,.gltf" multiple onFiles={(picked) => setFiles((current) => [...current, ...Array.from(picked ?? [])])} /><small className="admin-muted">Everything here is uploaded when you save. The first file becomes the cover image; the rest join the gallery.</small></div>
      : <FileDrop label={files[0] ? files[0].name : 'Choose a cover file'} hint={type === 'events' ? 'Image or MP4 for the event card' : 'Profile photo shown on the homepage'} accept={type === 'events' ? 'image/*,video/mp4' : 'image/*'} onFiles={(picked) => setFiles(picked ? Array.from(picked).slice(0, 1) : [])} />}
    {type !== 'memories' && (form.image_path || form.cover_image_path) && <small className="admin-muted">Current asset: {form.image_path || form.cover_image_path}</small>}
    {error && <p className="admin-error">{error}</p>}
    <button className="admin-primary" disabled={busy || missingCover}>{busy ? 'Saving…' : 'Save record'}</button>
  </form></aside>
}

function renderField(key: string, value: string, set: (key: string, value: string) => void) {
  if (key === 'kind') return <select value={value || EVENT_KINDS[0].label} onChange={(event) => set(key, event.target.value)}>{EVENT_KINDS.map((option) => <option key={option.value} value={option.label}>{option.label}</option>)}</select>
  if (key === 'bio' || key === 'description' || key === 'caption') return <textarea value={value} onChange={(event) => set(key, event.target.value)} rows={4} />
  return <input value={value} onChange={(event) => set(key, event.target.value)} type={key === 'starts_at' ? 'datetime-local' : key.includes('url') ? 'url' : 'text'} required={key === 'name' || key === 'title'} />
}

function AssetUploader({ onUploaded }: { onUploaded: (path: string) => void }) { const upload = async (file: File) => { const data = new FormData(); data.set('file', file); const response = await fetch('/api/upload', { method: 'POST', body: data }); const result = await response.json(); if (response.ok) onUploaded(result.path) }; return <label className="asset-drop"><ImagePlus size={22} /><span><strong>Choose an asset</strong><small>Images, MP4, GLB, or GLTF · max 25MB</small></span><Upload size={17} /><input type="file" accept="image/*,video/mp4,.glb,.gltf" onChange={(event) => { const file = event.target.files?.[0]; if (file) upload(file) }} /></label> }

function Inbox({ messages, onRefresh }: { messages: AdminRecord[]; onRefresh: () => void }) {
  return <section className="admin-inbox admin-panel"><div className="admin-list-head"><div><span className="admin-kicker">Contact form</span><h2>Inbox <b className="admin-count">{messages.length}</b></h2></div><button className="admin-secondary" onClick={onRefresh}>Refresh</button></div>{messages.length ? messages.map((message) => <article className="inbox-message" key={message.id}><div><strong>{String(message.name)}</strong><a href={`mailto:${String(message.email)}`}>{String(message.email)}</a><small>{String(message.created_at || '')}</small></div><span>{String(message.involvement || 'General inquiry')}</span><p>{String(message.message)}</p></article>) : <div className="admin-empty">No messages yet.</div>}</section>
}
