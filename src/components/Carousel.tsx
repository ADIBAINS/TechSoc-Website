import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { useReducedMotion } from 'framer-motion'
import { ChevronLeft, ChevronRight, Pause, Play } from 'lucide-react'

/** Slides visible at once, tracked against the same breakpoints as the stylesheet. */
export function usePerView(desktop: number, tablet: number, mobile: number) {
  const [perView, setPerView] = useState(desktop)
  useEffect(() => {
    const compute = () => setPerView(window.innerWidth <= 700 ? mobile : window.innerWidth <= 960 ? tablet : desktop)
    compute()
    window.addEventListener('resize', compute)
    return () => window.removeEventListener('resize', compute)
  }, [desktop, tablet, mobile])
  return perView
}

/**
 * Sliding-window carousel. Every card keeps an identical width at every position
 * and the track advances one card at a time, so nothing ever reflows or resizes
 * as it revolves. Auto-advances every `interval` ms, pauses on hover or keyboard
 * focus, and never auto-plays for visitors who ask for reduced motion.
 */
export function Carousel({ label, children, perView, interval = 5000, className = '' }: { label: string; children: ReactNode[]; perView: number; interval?: number; className?: string }) {
  const reducedMotion = useReducedMotion()
  const [index, setIndex] = useState(0)
  const [paused, setPaused] = useState(false)
  const [hovered, setHovered] = useState(false)

  const total = children.length
  // Column width always derives from perView, never from how many items exist,
  // so a section with one card renders that card at full intended size rather
  // than stretching it across the row.
  const visible = Math.max(1, perView)
  const lastIndex = Math.max(0, total - visible)
  const canLoop = lastIndex > 0
  const positions = lastIndex + 1
  const go = useCallback((delta: number) => setIndex((current) => {
    const next = current + delta
    if (next > lastIndex) return 0
    if (next < 0) return lastIndex
    return next
  }), [lastIndex])

  useEffect(() => { if (index > lastIndex) setIndex(0) }, [index, lastIndex])
  useEffect(() => {
    if (!canLoop || paused || hovered || reducedMotion) return
    const timer = window.setInterval(() => setIndex((current) => (current >= lastIndex ? 0 : current + 1)), interval)
    return () => window.clearInterval(timer)
  }, [canLoop, hovered, interval, lastIndex, paused, reducedMotion])

  // A hidden tab must not keep advancing in the background.
  useEffect(() => {
    const onVisibility = () => { if (document.hidden) setHovered(true) }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [])

  if (!total) return null

  return (
    <div
      className={`carousel ${className}`}
      role="region"
      aria-roledescription="carousel"
      aria-label={label}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setHovered(true)}
      onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setHovered(false) }}
    >
      <div className="carousel-viewport">
        <ul
          className="carousel-track"
          style={{ '--carousel-per': visible, '--carousel-index': index } as React.CSSProperties}
        >
          {children.map((child, position) => (
            <li
              className="carousel-slide"
              key={position}
              aria-current={position >= index && position < index + visible ? 'true' : undefined}
              aria-label={`${position + 1} of ${total}`}
            >
              {child}
            </li>
          ))}
        </ul>

        {canLoop && (
          <>
            <button className="carousel-nav is-prev" onClick={() => go(-1)} aria-label="Previous"><ChevronLeft size={20} /></button>
            <button className="carousel-nav is-next" onClick={() => go(1)} aria-label="Next"><ChevronRight size={20} /></button>
          </>
        )}
      </div>

      {canLoop && (
        <div className="carousel-controls">
          <button className="carousel-toggle" onClick={() => setPaused((value) => !value)} aria-label={paused ? 'Resume auto-advance' : 'Pause auto-advance'}>
            {paused ? <Play size={13} /> : <Pause size={13} />}
          </button>
          {positions <= 8 ? (
            <div className="carousel-dots">
              {Array.from({ length: positions }, (_, dot) => (
                <button key={dot} className={dot === index ? 'is-active' : ''} onClick={() => setIndex(dot)} aria-label={`Go to card ${dot + 1} of ${total}`} aria-current={dot === index} />
              ))}
            </div>
          ) : (
            <div className="carousel-progress" aria-hidden="true"><span style={{ width: `${((index + 1) / positions) * 100}%` }} /></div>
          )}
          <span className="carousel-count">{index + 1}&thinsp;/&thinsp;{total}</span>
        </div>
      )}
    </div>
  )
}
