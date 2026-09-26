import { createElement, useEffect, useState } from 'react'
import { mediaKind, type MediaItem } from '../lib/media'

let modelViewerLoader: Promise<void> | null = null

function loadModelViewer() {
  if (typeof customElements !== 'undefined' && customElements.get('model-viewer')) return Promise.resolve()
  modelViewerLoader ??= new Promise<void>((resolve) => {
    const script = document.createElement('script')
    script.type = 'module'
    script.src = 'https://unpkg.com/@google/model-viewer/dist/model-viewer.min.js'
    script.onload = () => resolve()
    script.onerror = () => resolve()
    document.head.appendChild(script)
  })
  return modelViewerLoader
}

export function MediaSurface({ item, alt, className, autoRotate = false, controls = false }: { item: MediaItem; alt: string; className?: string; autoRotate?: boolean; controls?: boolean }) {
  const kind = mediaKind(item.path)
  const [modelReady, setModelReady] = useState(false)
  useEffect(() => {
    if (mediaKind(item.path) !== 'model') return
    let active = true
    loadModelViewer().then(() => { if (active) setModelReady(true) })
    return () => { active = false }
  }, [item.path])

  if (kind === 'video') return <video src={item.path} className={className} controls={controls} autoPlay={controls} loop muted={!controls} playsInline aria-label={alt} />
  if (kind === 'model') {
    if (!modelReady) return <div className={className} data-loading="model">Loading 3D model…</div>
    return createElement('model-viewer', { src: item.path, class: className, 'camera-controls': true, 'auto-rotate': autoRotate, 'interaction-prompt': 'none', 'aria-label': alt })
  }
  return <img src={item.path} alt={alt} className={className} loading="lazy" />
}
