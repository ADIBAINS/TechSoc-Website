import { useCallback, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import { MediaSurface } from './MediaSurface'
import type { MediaItem } from '../lib/media'

export function MediaViewer({ title, items, index, onIndexChange, onClose }: { title: string; items: MediaItem[]; index: number; onIndexChange: (next: number) => void; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null)
  const restoreRef = useRef<Element | null>(null)
  const count = items.length
  const go = useCallback((delta: number) => {
    if (count < 2) return
    onIndexChange((index + delta + count) % count)
  }, [count, index, onIndexChange])

  useEffect(() => {
    restoreRef.current = document.activeElement
    closeRef.current?.focus()
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previousOverflow
      ;(restoreRef.current as HTMLElement | null)?.focus?.()
    }
  }, [])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); onClose() }
      if (event.key === 'ArrowRight') { event.preventDefault(); go(1) }
      if (event.key === 'ArrowLeft') { event.preventDefault(); go(-1) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [go, onClose])

  if (typeof document === 'undefined' || !count) return null
  const item = items[index]
  const multiple = count > 1

  return createPortal(
    <div className="media-viewer" role="dialog" aria-modal="true" aria-label={`${title} — media viewer`} onClick={onClose}>
      <div className="media-viewer-panel" onClick={(event) => event.stopPropagation()}>
        <header className="media-viewer-head">
          <div><span className="reference-kicker">{title}</span>{multiple && <b>{index + 1} / {count}</b>}</div>
          <button ref={closeRef} onClick={onClose} aria-label="Close viewer"><X size={20} /></button>
        </header>

        <div className="media-viewer-stage">
          {multiple && <button className="media-viewer-nav is-prev" onClick={() => go(-1)} aria-label="Previous media"><ChevronLeft size={22} /></button>}
          <MediaSurface key={item.path} item={item} alt={`${title} — ${index + 1} of ${count}`} className="media-viewer-media" controls autoRotate />
          {multiple && <button className="media-viewer-nav is-next" onClick={() => go(1)} aria-label="Next media"><ChevronRight size={22} /></button>}
        </div>

        <footer className="media-viewer-foot">
          <p>{item.caption || title}</p>
          {multiple && <div className="media-viewer-dots">{items.map((entry, dot) => <button key={entry.path} className={dot === index ? 'is-active' : ''} onClick={() => onIndexChange(dot)} aria-label={`Go to media ${dot + 1}`} aria-current={dot === index} />)}</div>}
        </footer>
      </div>
    </div>,
    document.body,
  )
}
