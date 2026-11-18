import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createProjectionRefresh, originalProjection, projectionContext, projectionContextKey,
  projectionIsCurrent, projectionTime } from './projectionRefresh.js'

// Each frame keeps its own WCS and expiry window. Adding C does not reload A/B.
export default function useProjectedImages(images, observer, timeContext, timestamp) {
  const [results, setResults] = useState({})
  const contextKey = projectionContextKey(observer, timeContext)
  const context = useMemo(() => projectionContext(contextKey), [contextKey])
  const manager = useRef(null)
  const retry = useCallback((id) => manager.current?.retry(id), [])
  const activeIds = new Set(images.map((image) => image.metadata.id))
  if (Object.keys(results).some((id) => !activeIds.has(id))) {
    setResults(Object.fromEntries(Object.entries(results).filter(([id]) => activeIds.has(id))))
  }

  useEffect(() => {
    if (!context) return
    const next = createProjectionRefresh(contextKey, context,
      (record) => setResults((previous) => ({ ...previous, [record.id]: record })))
    manager.current = next
    return () => { next.dispose(); manager.current = null }
  }, [contextKey, context])

  useEffect(() => { manager.current?.reconcile(images) }, [images, contextKey])

  const projected = useMemo(() => Object.fromEntries(images.map((active) => {
    const result = results[active.metadata.id]
    const matches = result?.source === active.metadata && result.contextKey === contextKey
    const original = context ? originalProjection(active, contextKey) : null
    const projection = matches ? result.projection ?? original : original
    return [active.metadata.id, {
      image: projection ? { ...active, projection, ...context } : null,
      error: matches ? result.error : '',
    }]
  })), [images, results, contextKey, context])
  const now = projectionTime(timeContext, timestamp)
  const byId = useMemo(() => Object.fromEntries(Object.entries(projected).map(([id, result]) => {
    const projection = result.image?.projection
    const ready = Boolean(context && projectionIsCurrent(projection, now))
    return [id, { ...result, ready, error: ready ? '' : result.error }]
  })), [projected, context, now])

  return { byId, ready: images.length > 0 && images.every((image) => byId[image.metadata.id].ready), retry }
}
