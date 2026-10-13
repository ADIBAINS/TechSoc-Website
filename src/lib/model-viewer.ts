let pending: Promise<void> | null = null

/** Hero and gallery models share a single on-demand script request. */
export function loadModelViewer(): Promise<void> {
  if (customElements.get('model-viewer')) return Promise.resolve()
  pending ??= new Promise<void>((resolve, reject) => {
    const script = document.createElement('script')
    script.type = 'module'
    script.src = 'https://unpkg.com/@google/model-viewer/dist/model-viewer.min.js'
    script.onload = () => {
      if (customElements.get('model-viewer')) resolve()
      else { pending = null; script.remove(); reject(new Error('Could not load 3D viewer')) }
    }
    script.onerror = () => { pending = null; script.remove(); reject(new Error('Could not load 3D viewer')) }
    document.head.appendChild(script)
  })
  return pending
}
