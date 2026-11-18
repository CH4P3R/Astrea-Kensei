import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import useProjectedImage from '../../src/hooks/useProjectedImage.js'
import useProjectedImages from '../../src/hooks/useProjectedImages.js'
import useComparisonPresentation from '../../src/hooks/useComparisonPresentation.js'
import useBlinkPlayback from '../../src/hooks/useBlinkPlayback.js'
import { loadProjection } from '../../src/services/images.js'

vi.mock('../../src/services/images.js', async (original) => ({ ...await original(), loadProjection: vi.fn() }))
vi.mock('../../src/hooks/useImageAppearance.js', () => ({
  default: () => ({ ready: true, hasData: true, pixels: [] }),
}))

const at = Date.parse('2026-11-17T12:00:00Z')
const observer = { latitude: 13.7, longitude: -89.2 }
const live = { mode: 'live' }
const paused = { mode: 'paused', at: new Date(at).toISOString() }
const projection = (start = at, mode = 'live', duration = 120000) => ({
  sample_times_ms: mode === 'live' ? [start, start + duration] : [start],
  directions: [], uv: [], indices: [],
})
const image = (id = 'A', seed = projection(), context = live) => ({
  metadata: { id, image: { unit: 'MJy/sr' }, observation: { start_utc: `2026-01-0${id === 'A' ? 1 : 2}T00:00:00Z` } },
  pixels: { raw: new Float32Array([1]) }, projection: seed, observer, timeContext: context,
})
const deferred = () => {
  let resolve, reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
const advance = async (milliseconds = 0) => act(async () => { await vi.advanceTimersByTimeAsync(milliseconds) })
const mount = (initialProps = {}) => renderHook(({ images, location, context, timestamp }) =>
  useProjectedImages(images, location, context, timestamp), {
  initialProps: { images: [image()], location: observer, context: live, timestamp: at, ...initialProps },
})

beforeEach(() => {
  vi.resetAllMocks()
  vi.useFakeTimers()
  vi.setSystemTime(at)
  loadProjection.mockImplementation(async (_id, context) => projection(Date.parse(context.at), context.mode))
})
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks() })

it('swaps live windows without declaring a gap when the HUD timestamp lags the response', async () => {
  const { result } = mount()
  const first = result.current.byId.A.image.projection
  await advance(60000)
  expect(loadProjection).toHaveBeenCalledTimes(1)
  expect(result.current.byId.A.image.projection).not.toBe(first)
  expect(result.current.byId.A.image.projection.sample_times_ms[0]).toBe(at + 60000)
  // The unchanged timestamp prop is deliberately behind the new window.
  expect(result.current.ready).toBe(true)
  expect(result.current.byId.A.error).toBe('')
})

it('renews a single image relative to its actual expiry rather than 90 seconds after mount', async () => {
  const active = image('A', projection(at - 45000))
  const { result } = renderHook(() => useProjectedImage(active, observer, live, at))
  await advance(14999)
  expect(loadProjection).not.toHaveBeenCalled()
  await advance(1)
  expect(loadProjection).toHaveBeenCalledTimes(1)
  expect(result.current.ready).toBe(true)
  expect(result.current.image.projection.sample_times_ms[0]).toBe(at + 15000)
})

it('keeps the old valid window during a slow renewal and a rejected attempt, then recovers atomically', async () => {
  const slow = deferred()
  loadProjection.mockReturnValueOnce(slow.promise)
  const { result } = mount()
  const first = result.current.byId.A.image.projection
  await advance(80000)
  expect(result.current.ready).toBe(true)
  expect(result.current.byId.A.image.projection).toBe(first)
  await act(async () => slow.reject(new TypeError('offline')))
  expect(result.current.ready).toBe(true)
  expect(result.current.byId.A.error).toBe('')
  await advance(5000)
  expect(loadProjection).toHaveBeenCalledTimes(2)
  expect(result.current.ready).toBe(true)
  expect(result.current.byId.A.image.projection).not.toBe(first)
})

it('times out a hung renewal, retries while the old window is valid, and ignores its late result', async () => {
  const stuck = deferred()
  loadProjection.mockReturnValueOnce(stuck.promise)
  const { result } = mount()
  await advance(90000)
  expect(loadProjection.mock.calls[0][2].aborted).toBe(true)
  expect(result.current.ready).toBe(true)
  await advance(5000)
  const replacement = result.current.byId.A.image.projection
  expect(replacement.sample_times_ms[0]).toBe(at + 95000)
  await act(async () => stuck.resolve(projection(at + 60000)))
  expect(result.current.byId.A.image.projection).toBe(replacement)
})

it('expires without a HUD update and never presents expired data as ready during repeated failures', async () => {
  loadProjection.mockImplementation(() => new Promise(() => {}))
  const { result } = mount()
  await advance(120001)
  expect(result.current.ready).toBe(false)
  expect(result.current.byId.A.ready).toBe(false)
  expect(result.current.byId.A.error.key).toBe('errors.network')
  loadProjection.mockImplementation(async (_id, context) => projection(Date.parse(context.at)))
  await advance(15000)
  expect(result.current.ready).toBe(true)
  expect(result.current.byId.A.image.projection.sample_times_ms[0]).toBe(at + 135000)
})

it('rejects an already expired response without replacing a still-valid projection', async () => {
  loadProjection.mockResolvedValueOnce(projection(at - 120000))
  const { result } = mount()
  const initial = result.current.byId.A.image.projection
  await advance(60000)
  expect(result.current.byId.A.image.projection).toBe(initial)
  expect(result.current.ready).toBe(true)
  await advance(5000)
  expect(result.current.byId.A.image.projection.sample_times_ms[0]).toBe(at + 65000)
})

it('does not restart a pending image for equivalent props or when another frame is added', async () => {
  const pending = deferred()
  loadProjection.mockReturnValueOnce(pending.promise)
  const a = image()
  const { result, rerender } = mount({ images: [a] })
  act(() => result.current.retry('A'))
  await advance()
  const signal = loadProjection.mock.calls[0][2]
  const equivalent = { images: [{ ...a }], location: { ...observer }, context: { mode: 'live' }, timestamp: at }
  rerender(equivalent)
  await advance()
  expect(signal.aborted).toBe(false)
  expect(loadProjection).toHaveBeenCalledTimes(1)
  rerender({ ...equivalent, images: [{ ...a }, image('B', null)] })
  await advance()
  expect(loadProjection).toHaveBeenCalledTimes(2)
  expect(signal.aborted).toBe(false)
  await act(async () => pending.resolve(projection()))
  expect(result.current.ready).toBe(true)
})

it.each(['observer', 'date'])('invalidates real %s changes and ignores old requests resolving afterward', async (change) => {
  const previous = deferred(), next = deferred()
  loadProjection.mockReturnValueOnce(previous.promise).mockReturnValueOnce(next.promise)
  const active = image('A', null, paused)
  const { result, rerender } = mount({ images: [active], context: paused })
  await advance()
  const signal = loadProjection.mock.calls[0][2]
  const location = change === 'observer' ? { ...observer, latitude: 40 } : observer
  const context = change === 'date' ? { mode: 'paused', at: new Date(at + 3600000).toISOString() } : paused
  const timestamp = Date.parse(context.at)
  rerender({ images: [active], location, context, timestamp })
  expect(result.current.byId.A.image).toBeNull()
  expect(signal.aborted).toBe(true)
  await advance()
  await act(async () => previous.resolve(projection(at, 'paused')))
  expect(result.current.ready).toBe(false)
  await act(async () => next.resolve(projection(timestamp, 'paused')))
  expect(result.current.ready).toBe(true)
  expect(result.current.byId.A.image.observer.latitude).toBe(location.latitude)
})

it('limits concurrency and cancels only removed frames, with complete timer cleanup on unmount', async () => {
  loadProjection.mockImplementation(() => new Promise(() => {}))
  const images = ['A', 'B', 'C', 'D'].map((id) => image(id, null))
  const { rerender, unmount } = mount({ images })
  await advance()
  expect(loadProjection).toHaveBeenCalledTimes(3)
  const signals = loadProjection.mock.calls.map((call) => call[2])
  rerender({ images: images.slice(1), location: observer, context: live, timestamp: at })
  await advance()
  expect(signals[0].aborted).toBe(true)
  expect(signals[1].aborted).toBe(false)
  expect(signals[2].aborted).toBe(false)
  expect(loadProjection).toHaveBeenCalledTimes(4)
  unmount()
  expect(loadProjection.mock.calls.every((call) => call[2].aborted)).toBe(true)
  expect(vi.getTimerCount()).toBe(0)
})

it('leaves paused projections fixed without periodic refreshes', async () => {
  const { result } = mount({ images: [image('A', projection(at, 'paused'), paused)], context: paused })
  await advance(3600000)
  expect(result.current.ready).toBe(true)
  expect(loadProjection).not.toHaveBeenCalled()
})

it('keeps comparison playback and its readiness intact through a normal live renewal', async () => {
  const comparison = { images: [image('A'), image('B')], status: 'results' }
  const { result } = renderHook(() => useComparisonPresentation(comparison, observer, live, at, 'ready'))
  expect(result.current.reason).toBe('')
  act(() => result.current.playback.toggle())
  await advance(60500)
  expect(loadProjection).toHaveBeenCalledTimes(2)
  expect(result.current.reason).toBe('')
  expect(result.current.playback.playing).toBe(true)
  expect(result.current.projections.ready).toBe(true)
})

it('holds playback through a real live gap and resumes after valid windows arrive', async () => {
  const first = deferred(), second = deferred()
  loadProjection.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
  const comparison = { images: [image('A', projection(at, 'live', 10000)), image('B', projection(at, 'live', 10000))],
    status: 'results' }
  const { result } = renderHook(() => useComparisonPresentation(comparison, observer, live, at, 'ready'))
  act(() => result.current.playback.toggle())
  await advance(10001)
  expect(result.current.reason).toBe('inspector.compare.position')
  expect(result.current.playback.playing).toBe(true)
  expect(result.current.playback.waiting).toBe(true)
  const frame = result.current.playback.frameId
  await advance(5000)
  expect(result.current.playback.frameId).toBe(frame)
  await act(async () => { first.resolve(projection(Date.now())); second.resolve(projection(Date.now())) })
  expect(result.current.reason).toBe('')
  expect(result.current.playback.waiting).toBe(false)
  await advance(1000)
  expect(result.current.playback.frameId).not.toBe(frame)
})

const frames = [{ id: 'A', label: 'A', reference: true }, { id: 'B', label: 'B' }]
it('does not reset the playback interval for equivalent frame arrays and allows pause while waiting', async () => {
  const props = { entries: frames, ready: true, suspended: false, contextKey: 'same' }
  const { result, rerender } = renderHook(({ entries, ready, ...options }) => useBlinkPlayback(entries, ready, options),
    { initialProps: props })
  act(() => result.current.toggle())
  await advance(600)
  rerender({ ...props, entries: frames.map((frame) => ({ ...frame })) })
  await advance(400)
  expect(result.current.frameId).toBe('B')
  rerender({ ...props, ready: false, suspended: true })
  await advance(5000)
  expect(result.current.frameId).toBe('B')
  expect(result.current.playing).toBe(true)
  act(() => result.current.pause())
  rerender(props)
  expect(result.current.playing).toBe(false)
})

it('resets playback for a real context change and cancels suspended intent when the tab is hidden', async () => {
  const props = { ready: true, suspended: false, contextKey: 'first' }
  const { result, rerender } = renderHook(({ ready, ...options }) => useBlinkPlayback(frames, ready, options),
    { initialProps: props })
  act(() => result.current.toggle())
  await advance(1000)
  rerender({ ready: false, suspended: true, contextKey: 'other' })
  expect(result.current.playing).toBe(false)
  expect(result.current.frameId).toBe('A')
  rerender(props)
  act(() => result.current.toggle())
  rerender({ ...props, ready: false, suspended: true })
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(true)
  act(() => document.dispatchEvent(new Event('visibilitychange')))
  expect(result.current.playing).toBe(false)
})
