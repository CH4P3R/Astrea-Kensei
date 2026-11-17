import { useCallback, useEffect, useRef, useState } from 'react'
import { loadMetadata, loadPixels, loadProjection, observerContext, recropImage, searchImages, searchCoordinates } from '../services/images.js'
import { ANY_DETECTOR, coordinateError, cutoutSizeError, DEFAULT_CUTOUT_SIZE } from '../config/search.js'
import { decodePixels, validateImage } from '../three/core/imageDataUtils.js'
import { errorMessage, LocalizedError } from '../i18n/messages.js'

const emptyState = { status: 'idle', images: [], error: '', active: null, hasMore: false, query: null, notice: null }
const coordinateDraft = (point) => ({ ra: point ? String(point.ra) : '', dec: point ? String(point.dec) : '' })

export default function useFitsImage(observer, timeContext, {
  initialSearch = null, onCommittedChange = () => {},
} = {}) {
  const [initialDraft] = useState(() => ({
    coordinates: coordinateDraft(initialSearch),
    size: initialSearch?.size ?? DEFAULT_CUTOUT_SIZE,
  }))
  const [state, setState] = useState(emptyState)
  const [size, updateSize] = useState(initialDraft.size)
  const [detector, updateDetector] = useState(initialSearch?.detector ?? ANY_DETECTOR)
  const [coordinates, updateCoordinates] = useState(initialDraft.coordinates)
  const [committed, setCommitted] = useState(initialSearch)
  const [commitPending, setCommitPending] = useState(false)
  const onCommittedChangeRef = useRef(onCommittedChange)
  const [preparing, setPreparing] = useState(false)
  const [focus, setFocus] = useState(null)
  const controller = useRef(null)
  const refinement = useRef(null)
  const searchId = useRef(0)
  const pendingLoad = useRef(null)
  const initialIntent = useRef(initialSearch)
  const [detail, setDetail] = useState(null)
  const [detailError, setDetailError] = useState('')
  const [refining, setRefining] = useState(false)
  const contextRef = useRef({ observer, timeContext })
  // Repeat the last search at the same sky point when the detector changes
  const lastSearch = useRef(null)
  const maxTextureSize = useRef(0)
  const [textureLimit, updateTextureLimit] = useState(0)
  const setTextureLimit = useCallback((value) => { maxTextureSize.current = value; updateTextureLimit(value) }, [])
  const beginPreparation = useCallback(() => setPreparing(true), [])
  const cancelPreparation = useCallback(() => {
    updateCoordinates(committed ? coordinateDraft(committed) : initialDraft.coordinates)
    updateSize(committed ? committed.size : initialDraft.size)
    setPreparing(false)
  }, [committed, initialDraft])
  const setCoordinate = useCallback((field, value) => {
    updateCoordinates((previous) => ({ ...previous, [field]: value }))
    beginPreparation()
  }, [beginPreparation])
  const setSize = useCallback((value) => updateSize(value), [])
  const commit = useCallback((search, notify = true) => {
    setCommitted(search)
    updateCoordinates(coordinateDraft(search))
    if (notify) onCommittedChangeRef.current(search)
  }, [])

  useEffect(() => { contextRef.current = { observer, timeContext } }, [observer, timeContext])
  useEffect(() => { onCommittedChangeRef.current = onCommittedChange }, [onCommittedChange])

  const reset = useCallback(({ notify = true } = {}) => {
    initialIntent.current = null
    pendingLoad.current = null
    searchId.current += 1
    controller.current?.abort()
    refinement.current?.abort()
    setDetail(null)
    setDetailError('')
    setRefining(false)
    lastSearch.current = null
    updateDetector(ANY_DETECTOR)
    setState(emptyState)
    setPreparing(false)
    setFocus(null)
    setCommitted(null)
    setCommitPending(false)
    if (notify) onCommittedChangeRef.current(null)
  }, [])

  const cancel = useCallback(() => {
    initialIntent.current = null
    pendingLoad.current = null
    searchId.current += 1
    refinement.current?.abort()
    setRefining(false)
    if (!['searching', 'loading'].includes(state.status)) return
    controller.current?.abort()
    setCommitPending(false)
    setState((previous) => ({ ...previous, status: previous.active ? 'ready' : 'idle', error: '',
      notice: { status: 'cancelled', message: 'search.notices.cancelled' } }))
    setPreparing(false)
  }, [state.status])

  useEffect(() => () => {
    pendingLoad.current = null
    searchId.current += 1
    controller.current?.abort()
    refinement.current?.abort()
  }, [])

  const source = state.active
  useEffect(() => {
    return () => { refinement.current?.abort(); setRefining(false) }
  }, [source, observer, timeContext])

  const refine = useCallback(async (scale) => {
    refinement.current?.abort()
    setDetailError('')
    setRefining(false)
    if (!source || !observer || scale <= 1) { setDetail(null); return }
    const job = new AbortController()
    refinement.current = job
    setRefining(true)
    try {
      const metadata = await recropImage(source.metadata.id, source.metadata.requested.size_deg / scale, job.signal)
      if (job.signal.aborted) return
      validateImage(metadata.image, maxTextureSize.current)
      const [buffer, projection] = await Promise.all([
        loadPixels(metadata.id, job.signal), loadProjection(metadata.id, observerContext(observer, timeContext), job.signal),
      ])
      if (!job.signal.aborted) setDetail({ source, image: {
        metadata, pixels: decodePixels(buffer, metadata.image), projection, observer, timeContext,
      } })
    } catch (error) {
      if (!job.signal.aborted) setDetailError(errorMessage(error))
    } finally {
      if (!job.signal.aborted) setRefining(false)
    }
  }, [source, observer, timeContext])

  useEffect(() => () => {
    if (controller.current?.kind === 'load') controller.current.abort()
  }, [observer, timeContext])

  const load = useCallback(async (id) => {
    initialIntent.current = null
    pendingLoad.current = null
    const { observer, timeContext } = contextRef.current
    controller.current?.abort()
    setCommitPending(false)
    refinement.current?.abort()
    setDetail(null)
    setDetailError('')
    setRefining(false)
    setPreparing(false)
    if (!observer) {
      setState((previous) => ({ ...previous, status: previous.active ? 'ready' : previous.images.length ? 'results' : 'idle',
        error: 'location.notices.required', notice: null }))
      return
    }
    const job = new AbortController()
    job.kind = 'load'
    controller.current = job
    setState((previous) => ({ ...previous, status: 'loading', error: '',
      notice: { status: 'loading', message: 'search.notices.loading' },
      loadObserver: observer, loadTime: timeContext }))
    try {
      const metadata = await loadMetadata(id, job.signal)
      if (job.signal.aborted) return
      validateImage(metadata.image, maxTextureSize.current)
      const [buffer, projection] = await Promise.all([
        loadPixels(id, job.signal), loadProjection(id, observerContext(observer, timeContext), job.signal),
      ])
      if (job.signal.aborted) return
      const pixels = decodePixels(buffer, metadata.image)
      setState((previous) => ({ ...previous, status: 'ready', active: { metadata, pixels, projection, observer, timeContext },
        notice: { status: 'success', message: 'search.notices.loaded' } }))
      setFocus({ id: metadata.id })
    } catch (error) {
      if (!job.signal.aborted) {
        job.abort()
        setState((previous) => ({ ...previous, status: 'error', error: errorMessage(error),
          notice: { status: 'error', message: 'search.notices.loadFailed' } }))
      }
    }
  }, [])

  useEffect(() => {
    const pending = pendingLoad.current
    if (!observer || textureLimit <= 0 || !pending) return
    pendingLoad.current = null
    if (pending.searchId === searchId.current) load(pending.id)
  }, [observer, textureLimit, load])

  const runSearch = useCallback(async (request, keepActive = false, skySearch = null) => {
    initialIntent.current = null
    pendingLoad.current = null
    const id = ++searchId.current
    controller.current?.abort()
    refinement.current?.abort()
    setRefining(false)
    const job = new AbortController()
    controller.current = job
    setCommitPending(Boolean(skySearch))
    setPreparing(false)
    setState((previous) => ({ ...emptyState, active: keepActive ? previous.active : null,
      query: keepActive ? previous.query : null, status: 'searching',
      notice: { status: 'loading', message: 'search.notices.searching' } }))
    try {
      const result = await request(job.signal)
      if (!job.signal.aborted) {
        if (skySearch) {
          const { ra_deg: ra, dec_deg: dec } = result.query
          const error = coordinateError(ra, dec)
          if (error) throw new LocalizedError(error)
          commit({ ra, dec, ...skySearch })
        }
        setCommitPending(false)
        const count = result.images.length
        const message = count === 0 ? 'search.notices.empty'
          : { key: result.has_more ? 'search.notices.foundMore' : 'search.notices.found', values: { count } }
        setState((previous) => ({ ...previous, status: 'results', images: result.images,
          hasMore: result.has_more, query: result.query, notice: { status: count === 0 ? 'empty' : 'success', message } }))
        const { ra_deg: ra, dec_deg: dec, size_deg: sizeDeg } = result.query
        lastSearch.current = (chosen, signal) => searchCoordinates(ra, dec, sizeDeg * 60, chosen, signal)
        if (result.images[0]) {
          if (contextRef.current.observer && maxTextureSize.current > 0) await load(result.images[0].id)
          else pendingLoad.current = { searchId: id, id: result.images[0].id }
        }
      }
    } catch (error) {
      if (!job.signal.aborted) {
        setCommitPending(false)
        setState((previous) => ({ ...previous, status: 'error', error: errorMessage(error),
          notice: { status: 'error', message: 'search.notices.searchFailed' } }))
      }
    }
  }, [load, commit])

  const search = useCallback((direction) => {
    const error = cutoutSizeError(size) || (!observer ? 'location.notices.required' : '')
    if (error) {
      setState((previous) => ({ ...previous, error }))
      return
    }
    const context = observerContext(observer, timeContext)
    updateDetector(ANY_DETECTOR)
    lastSearch.current = (chosen, signal) => searchImages(context, direction, size, chosen, signal)
    return runSearch((signal) => lastSearch.current(ANY_DETECTOR, signal), false, { size, detector: ANY_DETECTOR })
  }, [observer, size, timeContext, runSearch])

  const searchByCoordinates = useCallback((ra, dec) => {
    const error = cutoutSizeError(size) || coordinateError(ra, dec)
    if (error) {
      setState((previous) => ({ ...previous, error }))
      return
    }
    updateDetector(ANY_DETECTOR)
    commit({ ra, dec, size, detector: ANY_DETECTOR })
    lastSearch.current = (chosen, signal) => searchCoordinates(ra, dec, size, chosen, signal)
    return runSearch((signal) => lastSearch.current(ANY_DETECTOR, signal))
  }, [size, runSearch, commit])

  const restore = useCallback((search) => {
    updateSize(search.size)
    updateDetector(search.detector)
    commit(search, false)
    lastSearch.current = (chosen, signal) => searchCoordinates(search.ra, search.dec, search.size, chosen, signal)
    return runSearch((signal) => lastSearch.current(search.detector, signal))
  }, [commit, runSearch])

  useEffect(() => {
    let disposed = false
    // Defer consumption until after Strict Mode's setup/cleanup/setup replay.
    queueMicrotask(() => {
      if (!disposed && initialIntent.current) restore(initialIntent.current)
    })
    return () => { disposed = true }
  }, [restore])

  const applyUrl = useCallback((state) => {
    if (state.status === 'valid') return restore(state.search)
    reset({ notify: false })
  }, [restore, reset])

  const setDetector = useCallback((value) => {
    updateDetector(value)
    if (committed) {
      const search = { ...committed, detector: value }
      commit(search)
      lastSearch.current = (chosen, signal) => searchCoordinates(search.ra, search.dec, search.size, chosen, signal)
    }
    const repeat = lastSearch.current
    if (repeat) runSearch((signal) => repeat(value, signal), true)
  }, [runSearch, committed, commit])

  const currentContext = state.loadObserver === observer && state.loadTime === timeContext
  const visible = !currentContext && state.status === 'loading'
    ? { ...state, status: state.active ? 'ready' : 'results', notice: null } : state
  return { ...visible, size, setSize, detector, setDetector, preparing, beginPreparation, cancelPreparation,
    coordinates, setCoordinate, committed, commitPending, restore, applyUrl,
    detail: detail?.source === visible.active ? detail.image : null, detailError, refining, refine,
    search, searchByCoordinates, load, cancel, reset, focus: visible.active ? focus : null,
    setTextureLimit, textureLimit }
}
