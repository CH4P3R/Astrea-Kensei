import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { loadMetadata, loadPixels, loadProjection, observerContext, searchObservations } from '../services/images.js'
import { decodePixels, validateImage } from '../three/core/imageDataUtils.js'
import { errorMessage, LocalizedError } from '../i18n/messages.js'
import { compatibleUnits } from '../config/appearance.js'
import { comparisonCandidate, comparisonQuery, comparisonYears, observationDay } from '../config/comparison.js'

function initialState(primary) {
  const years = comparisonYears()
  const observedYear = Number(observationDay(primary?.metadata.observation?.start_utc)?.slice(0, 4))
  const year = years.includes(observedYear) ? observedYear : years[0]
  return { source: primary?.metadata.id ?? null, observations: [], candidates: [], hasMore: false,
    status: 'idle', error: '', pendingId: null, year, sameDetector: true,
    searchedYear: null, searchedSameDetector: null,
    request: { year, sameDetector: true }, completedRequest: null }
}

export default function useImageComparison(primary, enabled, observer, timeContext, textureLimit) {
  const [state, setState] = useState(() => initialState(primary))
  const loadController = useRef(null)
  const searchController = useRef(null)
  const source = primary?.metadata.id ?? null
  const metadata = primary?.metadata
  const contextKey = JSON.stringify([source, observer?.latitude, observer?.longitude, timeContext?.mode, timeContext?.at])
  if (state.source !== source) setState(initialState(primary))
  else if (state.pendingId && state.loadContext !== contextKey) setState({ ...state, pendingId: null, status: 'results' })
  const current = state.source === source ? state : initialState(primary)
  const { request, completedRequest } = current
  useEffect(() => {
    if (!metadata || !enabled || !request || completedRequest === request) return
    const query = comparisonQuery(metadata, request.year, request.sameDetector)
    const job = new AbortController()
    searchController.current = job
    async function discover() {
      try {
        if (!query) throw new LocalizedError('inspector.compare.invalidYear')
        const result = await searchObservations(query, job.signal)
        if (!job.signal.aborted) setState((previous) => previous.source !== source || previous.request !== request ? previous : ({ ...previous,
          completedRequest: request, searchedYear: request.year, searchedSameDetector: request.sameDetector,
          status: previous.pendingId ? 'loading' : 'results', error: '', hasMore: Boolean(result.has_more),
          candidates: result.images.filter((candidate) => comparisonCandidate(metadata, candidate, request.sameDetector)) }))
      } catch (failure) {
        if (!job.signal.aborted) setState((previous) => previous.source !== source || previous.request !== request ? previous : ({ ...previous,
          completedRequest: request, status: 'error', error: errorMessage(failure) }))
      }
    }
    discover()
    return () => job.abort()
  }, [metadata, source, enabled, request, completedRequest])

  // A selection made in an old sky/observer context must never be appended later.
  useEffect(() => () => loadController.current?.abort(), [contextKey])

  const discoverYear = useCallback((year, sameDetector) => {
    if (!metadata || !comparisonQuery(metadata, year, sameDetector)) return
    searchController.current?.abort()
    setState((previous) => ({ ...previous, year, sameDetector,
      request: { year, sameDetector }, candidates: [], hasMore: false,
      status: previous.pendingId ? 'loading' : 'idle', error: '' }))
  }, [metadata])
  const setYear = useCallback((year) => {
    if (year !== current.year) discoverYear(year, current.sameDetector)
  }, [current.year, current.sameDetector, discoverYear])
  const setSameDetector = useCallback((sameDetector) => {
    if (sameDetector !== current.sameDetector) discoverYear(current.year, sameDetector)
  }, [current.sameDetector, current.year, discoverYear])
  const search = useCallback(() => {
    if (loadController.current && !loadController.current.signal.aborted) return
    discoverYear(current.year, current.sameDetector)
  }, [current.year, current.sameDetector, discoverYear])

  const load = useCallback(async (id) => {
    if (!primary || !observer || id === source || current.observations.some((image) => image.metadata.id === id)) return
    // A rapid double-click cannot start two downloads or discard the first one.
    if (loadController.current && !loadController.current.signal.aborted) return
    const job = new AbortController()
    loadController.current = job
    setState((previous) => ({ ...previous, status: 'loading', error: '', pendingId: id, loadContext: contextKey }))
    try {
      const loadedMetadata = await loadMetadata(id, job.signal)
      if (job.signal.aborted) return
      if (!compatibleUnits(primary, { metadata: loadedMetadata })) throw new LocalizedError('inspector.compare.incompatibleUnit')
      validateImage(loadedMetadata.image, textureLimit)
      const [buffer, projection] = await Promise.all([
        loadPixels(id, job.signal), loadProjection(id, observerContext(observer, timeContext), job.signal),
      ])
      if (job.signal.aborted) return
      const image = { metadata: loadedMetadata, pixels: decodePixels(buffer, loadedMetadata.image), projection, observer, timeContext }
      setState((previous) => previous.source !== source ? previous : ({ ...previous, status: 'results', error: '', pendingId: null,
        observations: previous.observations.some((entry) => entry.metadata.id === id)
          ? previous.observations : [...previous.observations, image] }))
    } catch (failure) {
      if (!job.signal.aborted) {
        job.abort()
        setState((previous) => previous.source !== source ? previous : ({ ...previous,
          status: 'error', pendingId: null, error: errorMessage(failure) }))
      }
    } finally {
      if (loadController.current === job) loadController.current = null
    }
  }, [primary, observer, timeContext, source, textureLimit, contextKey, current.observations])

  const cancel = useCallback(() => {
    loadController.current?.abort()
    searchController.current?.abort()
    setState((previous) => ({ ...previous, completedRequest: previous.request,
      status: previous.request && previous.request !== previous.completedRequest ? 'cancelled' : 'results',
      pendingId: null, error: '' }))
  }, [])
  const remove = useCallback((id) => setState((previous) => ({ ...previous,
    observations: previous.observations.filter((image) => image.metadata.id !== id) })), [])
  const clear = useCallback(() => {
    loadController.current?.abort()
    setState((previous) => ({ ...previous, observations: [], pendingId: null, status: 'results', error: '' }))
  }, [])

  const images = useMemo(() => primary ? [primary, ...current.observations] : [], [primary, current.observations])
  const dirty = current.year !== current.searchedYear || current.sameDetector !== current.searchedSameDetector
  const searching = Boolean(primary && enabled && request && request !== completedRequest)
  const staleLoad = current.pendingId && current.loadContext !== contextKey
  return { images, observations: current.observations, year: current.year, setYear,
    sameDetector: current.sameDetector, setSameDetector,
    candidates: dirty || searching ? [] : current.candidates, hasMore: !dirty && current.hasMore,
    searchedYear: current.searchedYear, dirty,
    status: searching ? 'searching' : staleLoad ? 'results' : current.status,
    error: searching ? '' : current.error, pendingId: staleLoad ? null : current.pendingId,
    search, retry: search, load, cancel, remove, clear }
}
