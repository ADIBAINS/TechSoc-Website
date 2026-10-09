import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { ChevronDown, ChevronUp, Eye, EyeOff, KeyRound, Search, ShieldCheck, Users, CalendarDays, Images, Handshake, Home, Inbox as InboxIcon, ImagePlus, LogOut, Pencil, Plus, Save, Star, Trash2, Upload, X } from 'lucide-react'
import { EVENT_KINDS } from '../lib/eventKinds'

export const Route = createFileRoute('/admin')({ component: Admin })

type AdminRecord = Record<string, unknown> & { id: number }
type AdminData = { members: AdminRecord[]; events: AdminRecord[]; memories: AdminRecord[]; sponsors: AdminRecord[] }
type MediaRow = { id: number; path: string; kind: string; caption: string; sort_order: number }
type ContentTab = keyof AdminData
type Tab = ContentTab | 'hero' | 'inbox' | 'admins'
const contentTabs: ContentTab[] = ['members', 'events', 'memories', 'sponsors']
const emptyData: AdminData = { members: [], events: [], memories: [], sponsors: [] }
const isContentTab = (tab: Tab): tab is ContentTab => (contentTabs as string[]).includes(tab)
// Naive de-pluralising breaks on "memories" -> "memorie", so map it explicitly.
const SINGULAR: Record<ContentTab, string> = { members: 'member', events: 'event', memories: 'memory', sponsors: 'sponsor' }
const singular = (tab: ContentTab) => SINGULAR[tab]
const jsonHeaders = { 'content-type': 'application/json' }

type AdminSession = { id: number; email: string; role: string }
const tabInfo = { members: { label: 'Members', detail: 'Manage the people behind TechSoc.', icon: Users }, events: { label: 'Events', detail: 'Plan and publish your next gathering.', icon: CalendarDays }, memories: { label: 'Memories', detail: 'Keep the best moments together.', icon: Images }, sponsors: { label: 'Sponsors', detail: 'Showcase the partners supporting the club.', icon: Handshake }, hero: { label: 'Homepage', detail: 'Update the hero asset and announcement.', icon: Home }, admins: { label: 'Team access', detail: 'Manage accounts and securely reset passwords.', icon: ShieldCheck }, inbox: { label: 'Inbox', detail: 'Read messages from your community.', icon: InboxIcon } }

function Admin() {
  const [admin, setAdmin] = useState<AdminSession | null>(null)
  const [checking, setChecking] = useState(true)
  useEffect(() => { fetch('/api/auth').then((response) => response.json()).then((data) => { setAdmin(data.admin); setChecking(false) }).catch(() => setChecking(false)) }, [])
  if (checking) return <div className="admin-page"><p className="admin-muted">Opening control room…</p></div>
  return admin ? <Dashboard admin={admin} onLogout={() => setAdmin(null)} /> : <Login onLogin={setAdmin} />
}

function Login({ onLogin }: { onLogin: (admin: AdminSession) => void }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError('')
    try {
      const response = await fetch('/api/auth', { method: 'POST', headers: jsonHeaders, body: JSON.stringify({ email, password }) })
      const data = await response.json()
      if (!response.ok) { setError(data.error || 'Unable to sign in'); return }
      onLogin(data.admin)
    } catch { setError('Could not connect. Please try again.') }
    finally { setBusy(false) }
  }
  return <main className="admin-page admin-login"><div className="admin-login-mark">ts</div><span className="admin-kicker">techsoc / control room</span><h1>Welcome back.</h1><p className="admin-muted">Your workspace for the people, events, and stories that make TechSoc.</p><form className="admin-form" onSubmit={submit} aria-busy={busy}><label>Email<input value={email} onChange={(event) => setEmail(event.target.value)} type="email" required autoComplete="username" placeholder="you@techsoc.in" /></label><PasswordField label="Password" value={password} onChange={setPassword} autoComplete="current-password" />{error && <p className="admin-error" role="alert">{error}</p>}<button className="admin-primary" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button><p className="admin-muted admin-help">Forgot your password? Ask another admin to reset it from Team access.</p></form><a className="admin-back" href="/">← Back to public site</a></main>
}

function Dashboard({ admin, onLogout }: { admin: AdminSession; onLogout: () => void }) {
  const isAdmin = admin.role === 'admin'
  // Editors keep content + inbox; hero asset and account management are admin-only.
  const visibleTabs: Tab[] = [...contentTabs, ...(isAdmin ? (['hero', 'admins'] as Tab[]) : []), 'inbox']
  const [tab, setTab] = useState<Tab>('members')
  const [data, setData] = useState<AdminData>(emptyData)
  const [editing, setEditing] = useState<AdminRecord | null>(null)
  const [notice, setNotice] = useState('')
  const [heroAsset, setHeroAsset] = useState('')
  const [announcement, setAnnouncement] = useState({ enabled: false, text: '', link: '' })
  const [messages, setMessages] = useState<AdminRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const refresh = async () => {
    setLoadError(''); setLoading(true)
    try {
      const response = await fetch('/api/admin-content')
      if (!response.ok) throw new Error('Unable to load content. Please try again.')
      setData(await response.json())
    } catch (error) { setLoadError(error instanceof Error ? error.message : 'Could not connect.') }
    finally { setLoading(false) }
  }
  const refreshMessages = () => fetch('/api/contact').then((response) => response.ok ? response.json() : []).then(setMessages).catch(() => {})
  useEffect(() => {
    refresh(); refreshMessages()
    // Surface pre-Blob images that never made it to Blob (see db:migrate-uploads).
    fetch('/api/settings')
      .then((response) => (response.ok ? response.json() : null))
      .then((settings) => {
        const broken = Array.isArray(settings?.broken_images) ? settings.broken_images : []
        if (broken.length) setNotice(`${broken.length} image${broken.length === 1 ? '' : 's'} could not be moved to Blob — re-upload them in the editors below.`)
      })
      .catch(() => {})
  }, [])
  useEffect(() => {
    if (tab !== 'hero' || heroAsset) return
    fetch('/api/settings').then((response) => response.ok ? response.json() : null).then((settings) => {
      if (settings?.hero_asset) setHeroAsset(settings.hero_asset)
      if (settings?.announcement && typeof settings.announcement === 'object') {
        setAnnouncement({
          enabled: !!settings.announcement.enabled,
          text: String(settings.announcement.text ?? ''),
          link: String(settings.announcement.link ?? ''),
        })
      }
    }).catch(() => {})
  }, [tab])
  const logout = async () => { await fetch('/api/auth', { method: 'DELETE' }); onLogout() }
  const remove = async (type: ContentTab, id: number) => {
    if (!window.confirm('Delete this item?')) return
    try {
      const response = await fetch('/api/admin-content', { method: 'DELETE', headers: jsonHeaders, body: JSON.stringify({ type, id }) })
      if (!response.ok) { const result = await response.json(); setNotice(result.error || 'Could not delete item.'); return }
      setNotice('Item deleted.'); refresh()
    } catch { setNotice('Could not connect. Please try again.') }
  }
  const saveHero = async () => {
    if (!heroAsset && !announcement.text) return
    try {
      const response = await fetch('/api/settings', { method: 'PUT', headers: jsonHeaders, body: JSON.stringify({ hero_asset: heroAsset, announcement }) })
      if (!response.ok) { const result = await response.json(); setNotice(result.error || 'Could not save homepage.'); return }
      setNotice('Homepage changes saved.')
    } catch { setNotice('Could not connect. Please try again.') }
  }
  const switchTab = (next: Tab) => { setTab(next); setEditing(null) }
  return <main className="admin-page admin-dashboard">
    <aside className="admin-sidebar"><a className="admin-brand" href="/">ts<span>TechSoc<small>Control room</small></span></a><nav className="admin-tabs" aria-label="Admin sections">{visibleTabs.map((item) => { const Icon = tabInfo[item].icon; return <button type="button" aria-current={tab === item ? 'page' : undefined} className={tab === item ? 'active' : ''} key={item} onClick={() => switchTab(item)}><Icon size={18} /><span>{tabInfo[item].label}</span>{item === 'inbox' ? <b>{messages.length}</b> : isContentTab(item) ? <b>{data[item].length}</b> : null}</button> })}</nav><a className="admin-public-link" href="/">View public site ↗</a><div className="admin-account"><span>{admin.email}<small>{isAdmin ? 'Administrator' : 'Content editor'}</small></span><button onClick={logout}><LogOut size={15} /> Sign out</button></div></aside>
    <div className="admin-workspace"><header className="admin-topbar"><div><span className="admin-kicker">Workspace / {tabInfo[tab].label}</span><h1>{tabInfo[tab].label}</h1><p className="admin-muted">{tabInfo[tab].detail}</p></div></header>
    {notice && <div className="admin-notice" role="status">{notice}<button aria-label="Dismiss notification" onClick={() => setNotice('')}><X size={16} /></button></div>}
    {tab === 'hero' ? <HeroAsset value={heroAsset} onChange={setHeroAsset} onSave={saveHero} announcement={announcement} onAnnouncement={setAnnouncement} /> : tab === 'inbox' ? <Inbox messages={messages} onRefresh={refreshMessages} /> : tab === 'admins' ? <TeamAccess admin={admin} /> : loading ? <div className="admin-list admin-loading" role="status">Loading {tabInfo[tab].label.toLowerCase()}…</div> : loadError ? <div className="admin-list"><p className="admin-error" role="alert">{loadError}</p><button className="admin-secondary" onClick={refresh}>Try again</button></div> : <ContentPanel key={tab} tab={tab} data={data} editing={editing} setEditing={setEditing} onDelete={remove} onSaved={() => { setEditing(null); setNotice('Changes saved.'); refresh() }} onRefresh={refresh} />}
    <PasswordChange notify={setNotice} /></div>
  </main>
}

function PasswordChange({ notify }: { notify: (message: string) => void }) {
  const [open, setOpen] = useState(false)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError('')
    try {
      const response = await fetch('/api/auth', { method: 'PUT', headers: jsonHeaders, body: JSON.stringify({ currentPassword, newPassword }) })
      const result = await response.json().catch(() => ({})) as { error?: string }
      if (!response.ok) { setError(result.error ?? 'Could not change password'); return }
      setCurrentPassword(''); setNewPassword(''); setOpen(false); notify('Password changed.')
    } catch { setError('Could not connect. Please try again.') }
    finally { setBusy(false) }
  }
  return <section className="admin-inbox admin-panel admin-security"><div className="admin-list-head"><div><span className="admin-kicker">Your account</span><h2>Password & security</h2></div><button className="admin-secondary" disabled={busy} onClick={() => { setOpen(!open); setCurrentPassword(''); setNewPassword(''); setError('') }}>{open ? 'Cancel' : 'Change password'}</button></div>{open && <form className="admin-form" onSubmit={submit} aria-busy={busy}><PasswordField label="Current password" value={currentPassword} onChange={setCurrentPassword} autoComplete="current-password" /><PasswordField label="New password (8+ characters)" value={newPassword} onChange={setNewPassword} minLength={8} />{error && <p className="admin-error" role="alert">{error}</p>}<button className="admin-primary" disabled={busy}>{busy ? 'Saving…' : 'Save new password'}</button></form>}</section>
}

function ContentPanel({ tab, data, editing, setEditing, onDelete, onSaved, onRefresh }: { tab: ContentTab; data: AdminData; editing: AdminRecord | null; setEditing: (record: AdminRecord | null) => void; onDelete: (type: ContentTab, id: number) => void; onSaved: () => void; onRefresh: () => void }) {
  const [query, setQuery] = useState('')
  const records = data[tab].filter((record) => [record.name, record.title, record.role, record.kind, record.tier, record.caption].some((value) => String(value || '').toLowerCase().includes(query.trim().toLowerCase())))
  return <section className={`admin-layout ${editing ? 'admin-layout-editing' : ''}`}><div className="admin-list"><div className="admin-list-head"><div><span className="admin-kicker">Content library</span><h2>{data[tab].length} {tab}</h2></div><button className="admin-primary" onClick={() => setEditing({ id: 0 })}><Plus size={16} /> Add {singular(tab)}</button></div><label className="admin-search"><Search size={18} /><input aria-label={`Search ${tab}`} type="search" placeholder={`Search ${tab}…`} value={query} onChange={(event) => setQuery(event.target.value)} /></label>{records.map((record) => <AdminRow key={record.id} record={record} onEdit={() => setEditing(record)} onDelete={() => onDelete(tab, record.id)} />)}{!records.length && <div className="admin-empty">{query ? 'No matches. Try another search.' : `No ${tab} yet. Add your first ${singular(tab)} to get started.`}</div>}</div>{editing && <Editor key={`${tab}-${editing.id}`} type={tab} initial={editing} onClose={() => setEditing(null)} onSaved={onSaved} onRefresh={onRefresh} />}</section>
}

function HeroAsset({ value, onChange, onSave, announcement, onAnnouncement }: {
  value: string
  onChange: (value: string) => void
  onSave: () => void
  announcement: { enabled: boolean; text: string; link: string }
  onAnnouncement: (value: { enabled: boolean; text: string; link: string }) => void
}) {
  const setA = (patch: Partial<{ enabled: boolean; text: string; link: string }>) => onAnnouncement({ ...announcement, ...patch })
  return <section className="admin-assets admin-panel"><div><span className="admin-kicker">Visual assets</span><h2>Homepage Blender / hero asset</h2><p className="admin-muted">Upload an image, MP4, or GLB file, then save its public path for the homepage hero. The homepage picks this up on its next load.</p>{value && <p className="admin-muted">Currently serving <code>{value}</code></p>}<h2>Announcement banner</h2><p className="admin-muted">Shown above the header until dismissed. Leave the text empty to hide it.</p></div><AssetUploader onUploaded={onChange} /><div className="asset-save"><input value={value} onChange={(event) => onChange(event.target.value)} placeholder="Uploaded asset path" /><button className="admin-primary" onClick={onSave} disabled={!value && !announcement.text}><Save size={15} /> Save hero asset</button></div><div className="asset-save"><label className="admin-muted"><input type="checkbox" checked={announcement.enabled} onChange={(event) => setA({ enabled: event.target.checked })} /> Enabled</label><input value={announcement.text} onChange={(event) => setA({ text: event.target.value })} placeholder="Banner text" /><input value={announcement.link} onChange={(event) => setA({ link: event.target.value })} placeholder="Link URL (optional)" /></div></section>
}

function AdminRow({ record, onEdit, onDelete }: { record: AdminRecord; onEdit: () => void; onDelete: () => void }) { const thumb = [record.image_path, record.cover_image_path, record.logo_path].find((v) => typeof v === 'string' && v) as string | undefined; return <div className="admin-row"><div>{thumb ? <img src={thumb} alt="" /> : <span className="admin-row-mark">✳</span>}<div><strong>{String(record.name || record.title || 'Untitled')}</strong><small>{String(record.role || record.kind || record.tier || record.caption || 'Published content')}</small></div></div><span className="admin-row-date">{String(record.starts_at || record.created_at || '')}</span><div className="admin-row-actions"><button onClick={onEdit} aria-label="Edit"><Pencil size={15} /></button><button onClick={onDelete} aria-label="Delete"><Trash2 size={15} /></button></div></div> }

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
  const fields = type === 'members' ? [['name', 'Name'], ['role', 'Role'], ['bio', 'Bio'], ['github_url', 'GitHub URL'], ['linkedin_url', 'LinkedIn URL'], ['portfolio_url', 'Portfolio URL']] : type === 'events' ? [['title', 'Title'], ['kind', 'Kind'], ['description', 'Description'], ['starts_at', 'Starts at'], ['location', 'Location'], ['registration_url', 'Registration URL']] : type === 'sponsors' ? [['name', 'Name'], ['tier', 'Tier'], ['url', 'Website URL']] : [['title', 'Title'], ['caption', 'Caption']]
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
      else if (type === 'sponsors') values.logo_path = uploaded[0]
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
    {type === 'events' && initial.id > 0 && <EventRsvps eventId={initial.id} />}
    {type === 'memories'
      ? initial.id
        ? <MemoryMedia memoryId={initial.id} coverPath={String(initial.image_path ?? form.image_path ?? '')} onChanged={onRefresh} />
        : <div className="media-manager"><div className="media-manager-head"><span className="admin-kicker">Media</span><b>{files.length ? `${files.length} selected` : 'none selected'}</b></div>{files.length > 0 && <ul className="media-manager-list">{files.map((item, index) => <li key={`${item.name}-${index}`}><span className="media-manager-index">{index + 1}</span>{item.type.startsWith('image/') ? <img src={URL.createObjectURL(item)} alt="" /> : <span className="media-manager-file">{item.type.startsWith('video/') ? 'MP4' : 'FILE'}</span>}<span className="media-manager-meta"><small title={item.name}>{item.name}</small><em>{(item.size / 1024).toFixed(0)} KB</em></span><span className="media-manager-actions"><button type="button" className="is-danger" onClick={() => setFiles((current) => current.filter((_, position) => position !== index))} aria-label={`Remove ${item.name}`} title="Remove"><Trash2 size={13} /></button></span></li>)}</ul>}<FileDrop label={files.length ? 'Add more media' : 'Add photos, clips, or 3D files'} hint="Images, MP4, GLB or GLTF · the first becomes the cover" accept="image/*,video/mp4,.glb,.gltf" multiple onFiles={(picked) => setFiles((current) => [...current, ...Array.from(picked ?? [])])} /><small className="admin-muted">Everything here is uploaded when you save. The first file becomes the cover image; the rest join the gallery.</small></div>
      : <FileDrop label={files[0] ? files[0].name : 'Choose a cover file'} hint={type === 'events' ? 'Image or MP4 for the event card' : type === 'sponsors' ? 'Logo image shown on the homepage' : 'Profile photo shown on the homepage'} accept={type === 'events' ? 'image/*,video/mp4' : 'image/*'} onFiles={(picked) => setFiles(picked ? Array.from(picked).slice(0, 1) : [])} />}
    {type !== 'memories' && (form.image_path || form.cover_image_path || form.logo_path) && <small className="admin-muted">Current asset: {form.image_path || form.cover_image_path || form.logo_path}</small>}
    {error && <p className="admin-error">{error}</p>}
    <button className="admin-primary" disabled={busy || missingCover}>{busy ? 'Saving…' : 'Save record'}</button>
  </form></aside>
}

function EventRsvps({ eventId }: { eventId: number }) {
  const [attendees, setAttendees] = useState<{ id: number; name: string; email: string; created_at: string }[]>([])
  useEffect(() => {
    fetch(`/api/rsvp?event_id=${eventId}`)
      .then((response) => (response.ok ? response.json() : []))
      .then(setAttendees)
      .catch(() => {})
  }, [eventId])
  return <div className="rsvp-list"><span>{attendees.length} RSVP{attendees.length === 1 ? '' : 's'}</span>{attendees.length > 0 && <ul>{attendees.map((a) => <li key={a.id}>{a.name}<small>{a.email}</small></li>)}</ul>}</div>
}

function renderField(key: string, value: string, set: (key: string, value: string) => void) {  if (key === 'kind') return <select value={value || EVENT_KINDS[0].label} onChange={(event) => set(key, event.target.value)}>{EVENT_KINDS.map((option) => <option key={option.value} value={option.label}>{option.label}</option>)}</select>
  if (key === 'tier') { const tiers = ['Title', 'Gold', 'Silver', 'Community']; return <select value={tiers.includes(value) ? value : 'Community'} onChange={(event) => set(key, event.target.value)}>{tiers.map((option) => <option key={option} value={option}>{option}</option>)}</select> }
  if (key === 'bio' || key === 'description' || key === 'caption') return <textarea value={value} onChange={(event) => set(key, event.target.value)} rows={4} />
  return <input value={value} onChange={(event) => set(key, event.target.value)} type={key === 'starts_at' ? 'datetime-local' : key.includes('url') ? 'url' : 'text'} required={key === 'name' || key === 'title'} />
}

function AssetUploader({ onUploaded }: { onUploaded: (path: string) => void }) { const upload = async (file: File) => { const data = new FormData(); data.set('file', file); const response = await fetch('/api/upload', { method: 'POST', body: data }); const result = await response.json(); if (response.ok) onUploaded(result.path) }; return <label className="asset-drop"><ImagePlus size={22} /><span><strong>Choose an asset</strong><small>Images, MP4, GLB, or GLTF · max 25MB</small></span><Upload size={17} /><input type="file" accept="image/*,video/mp4,.glb,.gltf" onChange={(event) => { const file = event.target.files?.[0]; if (file) upload(file) }} /></label> }

function PasswordField({ label, value, onChange, autoComplete = 'new-password', minLength }: { label: string; value: string; onChange: (value: string) => void; autoComplete?: string; minLength?: number }) {
  const [visible, setVisible] = useState(false)
  return <label>{label}<span className="admin-password-field"><input type={visible ? 'text' : 'password'} value={value} onChange={(event) => onChange(event.target.value)} autoComplete={autoComplete} required minLength={minLength} maxLength={256} /><button type="button" aria-label={visible ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`} aria-pressed={visible} onClick={() => setVisible(!visible)}>{visible ? <EyeOff size={18} /> : <Eye size={18} />}</button></span></label>
}

type TeamAccount = { id: number; email: string; role: string }
function TeamAccess({ admin }: { admin: AdminSession }) {
  const [accounts, setAccounts] = useState<TeamAccount[]>([])
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState('editor')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [target, setTarget] = useState<TeamAccount | null>(null)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const editorRef = useRef<HTMLElement>(null)
  useEffect(() => {
    if (!target) return
    if (window.matchMedia('(max-width: 1150px)').matches) {
      editorRef.current?.scrollIntoView({ block: 'start' })
    }
    editorRef.current?.querySelector('input')?.focus({ preventScroll: true })
  }, [target])
  const load = useCallback(async () => {
    setLoading(true); setLoadError('')
    try {
      const response = await fetch('/api/admins')
      if (!response.ok) throw new Error('Could not load team accounts.')
      setAccounts(await response.json())
    } catch { setLoadError('Could not load team accounts. Please try again.') }
    finally { setLoading(false) }
  }, [])
  useEffect(() => { load() }, [load])
  const mutate = async (method: string, body: unknown) => {
    const response = await fetch('/api/admins', { method, headers: jsonHeaders, body: JSON.stringify(body) })
    const result = await response.json().catch(() => ({})) as { error?: string }
    if (!response.ok) throw new Error(result.error || 'Unable to save changes.')
  }
  const invite = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError(''); setNotice('')
    try {
      await mutate('POST', { email, password, role })
      setNotice(`Account created for ${email}. Share their credentials privately.`)
      setEmail(''); setPassword(''); await load()
    } catch (error) { setError(error instanceof Error ? error.message : 'Could not connect.') }
    finally { setBusy(false) }
  }
  const reset = async (event: FormEvent) => {
    event.preventDefault()
    if (!target) return
    setError(''); setNotice('')
    if (newPassword !== confirmation) { setError('The new passwords do not match.'); return }
    setBusy(true)
    try {
      await mutate('PUT', { id: target.id, currentPassword, newPassword })
      setNotice(`Password reset for ${target.email}. Existing sessions have been signed out. Share the new password privately.`)
      setTarget(null); setCurrentPassword(''); setNewPassword(''); setConfirmation('')
    } catch (error) { setError(error instanceof Error ? error.message : 'Could not connect.') }
    finally { setBusy(false) }
  }
  const remove = async (account: TeamAccount) => {
    if (!window.confirm(`Remove ${account.email}? They will lose access to the control room.`)) return
    setBusy(true); setError(''); setNotice('')
    try {
      await mutate('DELETE', { id: account.id })
      if (target?.id === account.id) { setTarget(null); setCurrentPassword(''); setNewPassword(''); setConfirmation('') }
      setNotice(`Access removed for ${account.email}.`); await load()
    } catch (error) { setError(error instanceof Error ? error.message : 'Could not connect.') }
    finally { setBusy(false) }
  }
  const chooseTarget = (account: TeamAccount | null) => {
    setTarget(account); setError(''); setCurrentPassword(''); setNewPassword(''); setConfirmation('')
  }
  return <section className="admin-team">
    <div className="admin-list"><div className="admin-list-head"><div><span className="admin-kicker">Access directory</span><h2>Team accounts</h2></div><span className="admin-role">{accounts.length} accounts</span></div>
      {notice && <p className="admin-notice" role="status">{notice}</p>}
      {loading ? <p className="admin-muted" role="status">Loading accounts…</p> : loadError ? <div><p className="admin-error" role="alert">{loadError}</p><button className="admin-secondary" onClick={load}>Try again</button></div> : accounts.map((account) => <div className="admin-team-row" key={account.id}><div className="admin-team-identity"><span className="admin-row-mark"><Users size={18} /></span><div><strong>{account.email}</strong><small>{account.id === admin.id ? 'Your account' : account.role === 'admin' ? 'Full control room access' : 'Content and inbox access'}</small></div></div><span className="admin-role">{account.role || 'admin'}</span><div className="admin-team-actions">{account.id !== admin.id && <><button className="admin-secondary" disabled={busy} onClick={() => chooseTarget(account)}><KeyRound size={15} /> Reset password</button><button className="admin-remove" disabled={busy} aria-label={`Remove ${account.email}`} onClick={() => remove(account)}><Trash2 size={16} /></button></>}</div></div>)}
    </div>
    <aside className="admin-editor" ref={editorRef}>{error && <p className="admin-error" role="alert">{error}</p>}{target ? <><div className="admin-editor-head"><div><span className="admin-kicker">Account recovery</span><h2>Reset password</h2></div><button disabled={busy} aria-label="Cancel password reset" onClick={() => chooseTarget(null)}><X size={18} /></button></div><p className="admin-muted">Set a new password for <strong>{target.email}</strong>. This signs them out on every device.</p><form className="admin-form" onSubmit={reset} aria-busy={busy}><PasswordField label="Your current password" value={currentPassword} onChange={setCurrentPassword} autoComplete="current-password" /><PasswordField label="New password (8+ characters)" value={newPassword} onChange={setNewPassword} minLength={8} /><PasswordField label="Confirm new password" value={confirmation} onChange={setConfirmation} minLength={8} /><p className="admin-muted admin-help">Share the new password with the account owner privately.</p><button className="admin-primary" disabled={busy}>{busy ? 'Resetting…' : 'Reset password'}</button><button type="button" className="admin-secondary" disabled={busy} onClick={() => chooseTarget(null)}>Cancel</button></form></> : <><div className="admin-editor-head"><div><span className="admin-kicker">Grow the team</span><h2>Add an account</h2></div><Plus size={20} /></div><p className="admin-muted">Create access for a club member. Editors manage content; admins also manage the homepage and team.</p><form className="admin-form" onSubmit={invite} aria-busy={busy}><label>Email<input value={email} onChange={(event) => setEmail(event.target.value)} type="email" autoComplete="off" required maxLength={254} placeholder="member@techsoc.in" /></label><PasswordField label="Initial password (8+ characters)" value={password} onChange={setPassword} minLength={8} /><label>Access level<select value={role} onChange={(event) => setRole(event.target.value)}><option value="editor">Editor — content & inbox</option><option value="admin">Admin — full access</option></select></label><button className="admin-primary" disabled={busy}>{busy ? 'Creating…' : 'Create account'}</button></form></>}</aside>
  </section>
}

function Inbox({ messages, onRefresh }: { messages: AdminRecord[]; onRefresh: () => void }) {  return <section className="admin-inbox admin-panel"><div className="admin-list-head"><div><span className="admin-kicker">Contact form</span><h2>Inbox <b className="admin-count">{messages.length}</b></h2></div><button className="admin-secondary" onClick={onRefresh}>Refresh</button></div>{messages.length ? messages.map((message) => <article className="inbox-message" key={message.id}><div><strong>{String(message.name)}</strong><a href={`mailto:${String(message.email)}`}>{String(message.email)}</a><small>{String(message.created_at || '')}</small></div><span>{String(message.involvement || 'General inquiry')}</span><p>{String(message.message)}</p></article>) : <div className="admin-empty">No messages yet.</div>}</section>
}
