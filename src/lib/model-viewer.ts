let pending: Promise<void> | null = null

/** Bundle locally so uncompressed models also work offline. */
export function loadModelViewer(): Promise<void> {
  if (customElements.get('model-viewer')) return Promise.resolve()
  pending ??= import('@google/model-viewer').then(() => customElements.whenDefined('model-viewer')).then(() => {}).catch((error) => {
    pending = null
    throw error
  })
  return pending
}
