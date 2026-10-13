import { useState } from 'react'
import { Box, Download, Maximize2, Search } from 'lucide-react'
import type { Work } from '../lib/public-content'
import { MediaSurface } from './MediaSurface'
import type { MediaItem } from '../lib/media'

export const REFERENCE_MODEL = '/models/techsoc.glb'
const reference: Work = { id: -1, title: 'TechSoc in three dimensions', creator: 'TechSoc reference model', description: 'Explore the model from the reference repository. Drag to orbit, scroll or pinch to zoom.', model_path: REFERENCE_MODEL }

export function WorksGallery({ works, onExpand }: { works: Work[]; onExpand: (title: string, items: MediaItem[]) => void }) {
  const [selected, setSelected] = useState<number | null>(null)
  const [query, setQuery] = useState('')
  const filtered = works.filter((work) => `${work.title} ${work.creator ?? ''}`.toLowerCase().includes(query.trim().toLowerCase()))
  const active = works.length ? filtered.find((work) => work.id === selected) ?? filtered[0] : reference

  return <section className="reference-works shell section-padding" id="works" aria-labelledby="works-heading">
    <div className="reference-rule" />
    <div className="reference-works-heading"><div><span className="reference-kicker"><Box size={16} />Made in Blender</span><h2 id="works-heading">Work in another dimension.</h2></div><p>Models, materials, and ideas from our creators. Take a closer look from every angle.</p></div>
    {works.length > 0 && <label className="reference-work-search"><Search size={18} /><input type="search" aria-label="Search 3D works" placeholder="Find a work or creator…" value={query} onChange={(event) => setQuery(event.target.value)} /><span>{filtered.length} {filtered.length === 1 ? 'work' : 'works'}</span></label>}
    {active ? <div className="reference-work-layout">
      <div className="reference-work-feature">
        <div className="reference-work-stage">
          <span className="reference-work-tag">{works.length ? 'Interactive 3D' : 'Reference model'}</span>
          <MediaSurface key={active.model_path} item={{ path: active.model_path, kind: 'model' }} alt={active.title} className="reference-work-model" controls autoPlay={false} />
        </div>
        <div className="reference-work-caption"><div><h3>{active.title}</h3>{active.creator && <span>{active.creator}</span>}</div><button type="button" aria-label={`Expand ${active.title}`} onClick={() => onExpand(active.title, [{ path: active.model_path, kind: 'model', caption: active.description }])}><Maximize2 size={17} />Expand</button></div>
        {active.description && <p className="reference-work-description">{active.description}</p>}
        <div className="reference-work-downloads"><span>Drag to orbit · scroll or pinch to zoom</span><a href={active.model_path} download><Download size={15} />GLB / GLTF</a>{active.source_path && <a href={active.source_path} download><Download size={15} />Blender source</a>}</div>
      </div>
      <div className="reference-work-index">
        {works.length ? <><span className="reference-work-index-label">The collection</span><div className="reference-work-cards">{filtered.map((work) => <button key={work.id} type="button" className={`reference-work-card ${active.id === work.id ? 'is-selected' : ''}`} aria-pressed={active.id === work.id} onClick={() => setSelected(work.id)}>{work.image_path ? <img src={work.image_path} alt="" width={160} height={120} loading="lazy" /> : <span className="reference-work-placeholder"><Box size={28} /></span>}<span><strong>{work.title}</strong><small>{work.creator || '3D model'}</small></span></button>)}</div></> : <div className="reference-work-intro"><Box size={32} /><h3>A space for your next creation.</h3><p>Our 3D collection starts here. For now, explore the TechSoc model; published community work will appear in this gallery.</p><a href="https://github.com/1Nitin1/Techsoc-website" target="_blank" rel="noreferrer">Explore the reference repo ↗</a></div>}
      </div>
    </div> : <div className="reference-work-empty"><Box size={28} /><p>No works match “{query}”.</p><button type="button" onClick={() => setQuery('')}>Clear search</button></div>}
  </section>
}
