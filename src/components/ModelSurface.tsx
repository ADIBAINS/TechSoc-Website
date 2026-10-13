import { createElement, useEffect, useRef, useState } from 'react'
import type { ModelViewerElement } from '@google/model-viewer'
import { Pause, Play, RotateCcw, Rotate3D } from 'lucide-react'
import { loadModelViewer } from '../lib/model-viewer'

export function ModelSurface({ path, alt, className, autoRotate = false, controls = false, autoPlay = false }: { path: string; alt: string; className?: string; autoRotate?: boolean; controls?: boolean; autoPlay?: boolean }) {
  const viewer = useRef<ModelViewerElement | null>(null)
  const [ready, setReady] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  const [rotating, setRotating] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [hasAnimation, setHasAnimation] = useState(false)
  // Failed assets are cached by model-viewer; use a fresh URL for a real retry.
  const source = (() => {
    if (!retry) return path
    const url = new URL(path, 'https://techsoc.local')
    url.searchParams.set('viewer_retry', String(retry))
    return path.startsWith('/') ? `${url.pathname}${url.search}${url.hash}` : url.href
  })()

  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)')
    const sync = () => { setRotating(autoRotate && !preference.matches); setPlaying(autoPlay && !preference.matches) }
    sync(); preference.addEventListener('change', sync)
    return () => preference.removeEventListener('change', sync)
  }, [autoRotate, autoPlay])

  useEffect(() => {
    let active = true
    setLoaded(false); setError('')
    loadModelViewer().then(() => { if (active) setReady(true) }).catch(() => { if (active) setError('The 3D viewer could not start. Try again.') })
    return () => { active = false }
  }, [path, retry])

  useEffect(() => {
    if (!ready) return
    const element = viewer.current
    if (!element) return
    const onLoad = () => { setLoaded(true); setHasAnimation(element.availableAnimations.length > 0) }
    const onError = () => { setLoaded(false); setError('This model could not load. Try again or download the GLB.') }
    element.addEventListener('load', onLoad)
    element.addEventListener('error', onError)
    if (element.loaded) onLoad()
    return () => { element.removeEventListener('load', onLoad); element.removeEventListener('error', onError) }
  }, [ready, path, retry])

  useEffect(() => {
    if (!loaded || !hasAnimation) return
    if (playing) viewer.current?.play()
    else viewer.current?.pause()
  }, [playing, loaded, hasAnimation])

  return <div className={`${className ?? ''} reference-model-surface`} aria-busy={!loaded && !error}>
    {ready && createElement('model-viewer', {
      key: `${path}-${retry}`, ref: viewer, src: source, alt, loading: 'eager',
      'camera-controls': '', 'auto-rotate': rotating ? '' : undefined,
      autoplay: playing ? '' : undefined,
      'camera-orbit': '-40deg 75deg auto', 'field-of-view': '25deg',
      'shadow-intensity': '1', 'interaction-prompt': 'none', 'touch-action': 'pan-y',
    })}
    {!loaded && <div className="reference-model-status" role={error ? 'alert' : 'status'}>
      <Rotate3D size={24} /><p>{error || 'Loading 3D model…'}</p>
      {error && <div><button type="button" onClick={() => setRetry((value) => value + 1)}>Try again</button><a href={path} download>Download GLB</a></div>}
    </div>}
    {controls && loaded && <div className="reference-model-tools" aria-label="3D model controls">
      <button type="button" aria-label={rotating ? 'Pause rotation' : 'Rotate model'} aria-pressed={rotating} onClick={() => setRotating(!rotating)}><Rotate3D size={16} />{rotating ? 'Pause spin' : 'Spin'}</button>
      <button type="button" onClick={() => { if (viewer.current) { viewer.current.cameraOrbit = '-40deg 75deg auto'; viewer.current.fieldOfView = '25deg'; viewer.current.jumpCameraToGoal() } }}><RotateCcw size={16} />Reset</button>
      {hasAnimation && <button type="button" aria-label={playing ? 'Pause animation' : 'Play animation'} aria-pressed={playing} onClick={() => setPlaying(!playing)}>{playing ? <Pause size={16} /> : <Play size={16} />}Animation</button>}
    </div>}
  </div>
}
