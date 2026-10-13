import { useEffect, useRef, useState } from 'react'
import { mediaKind, type MediaItem } from '../lib/media'
import { ModelSurface } from './ModelSurface'

export function MediaSurface({ item, alt, className, autoRotate = false, controls = false, eager = false, autoPlay = controls }: { item: MediaItem; alt: string; className?: string; autoRotate?: boolean; controls?: boolean; eager?: boolean; autoPlay?: boolean }) {
  const kind = mediaKind(item.path)
  const placeholder = useRef<HTMLDivElement>(null)
  const [nearViewport, setNearViewport] = useState(false)
  const active = eager || controls || nearViewport

  useEffect(() => {
    if (active || kind === 'image') return
    if (!('IntersectionObserver' in window)) { setNearViewport(true); return }
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) setNearViewport(true)
    }, { rootMargin: '250px' })
    if (placeholder.current) observer.observe(placeholder.current)
    return () => observer.disconnect()
  }, [active, kind])

  if (kind !== 'image' && !active) return <div ref={placeholder} className={className} data-loading="deferred" aria-label={alt} />
  if (kind === 'video') return <video src={item.path} className={className} controls={controls} autoPlay={autoPlay} preload={controls || eager ? 'auto' : 'metadata'} loop muted={!controls} playsInline aria-label={alt} />
  if (kind === 'model') {
    return <ModelSurface key={item.path} path={item.path} alt={alt} className={className} autoRotate={autoRotate} controls={controls} autoPlay={autoPlay} />
  }
  return <img src={item.path} alt={alt} className={className} loading={eager || controls ? 'eager' : 'lazy'} fetchPriority={eager ? 'high' : undefined} decoding="async" width={controls ? undefined : 960} height={controls ? undefined : 720} />
}
