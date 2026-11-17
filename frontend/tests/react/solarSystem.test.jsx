import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import useSolarSystem from '../../src/hooks/useSolarSystem.js'
import { loadSolarSystem } from '../../src/services/solarSystem.js'

vi.mock('../../src/services/solarSystem.js', () => ({ loadSolarSystem: vi.fn() }))

const at = Date.parse('2026-11-16T12:00:00Z')
const observer = { latitude: 13.7, longitude: -89.2 }
const otherObserver = { latitude: -33.9, longitude: 151.2 }
const live = { mode: 'live' }
const paused = { mode: 'paused', at: new Date(at).toISOString() }
const snapshot = (mode = 'live', start = at) => ({
  mode, coordinate_frame: 'AltAz', refraction: false,
  sample_times_ms: mode === 'live' ? [start, start + 120000] : [start],
  bodies: [], // Hook tests mock the service; body validation is covered separately.
})
const deferred = () => {
  let resolve
  const promise = new Promise((yes) => { resolve = yes })
  return { promise, resolve }
}
const advance = async (milliseconds = 0) => act(async () => { await vi.advanceTimersByTimeAsync(milliseconds) })
const mount = (props = {}) => renderHook(({ location, context, timestamp, enabled }) =>
  useSolarSystem(location, context, timestamp, enabled), {
  initialProps: { location: observer, context: paused, timestamp: at, enabled: true, ...props },
})

beforeEach(() => {
  vi.resetAllMocks()
  vi.useFakeTimers()
  vi.setSystemTime(at)
  loadSolarSystem.mockImplementation(async (context) => snapshot(context.mode, Date.parse(context.at)))
})
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks() })

it('does not request ephemerides without a location or when the bodies are disabled', async () => {
  const { result, rerender } = mount({ location: null })
  await advance(1000)
  expect(result.current.status).toBe('idle')
  expect(loadSolarSystem).not.toHaveBeenCalled()
  rerender({ location: observer, context: paused, timestamp: at, enabled: false })
  await advance(1000)
  expect(result.current.snapshot).toBeNull()
  expect(loadSolarSystem).not.toHaveBeenCalled()
  rerender({ location: observer, context: paused, timestamp: at, enabled: true })
  await advance()
  expect(loadSolarSystem).toHaveBeenCalledTimes(1)
  expect(result.current.status).toBe('ready')
})

it.each(['location', 'time'])('ignores a late response after the selected %s changes', async (change) => {
  const first = deferred()
  const second = deferred()
  loadSolarSystem.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
  const { result, rerender, unmount } = mount()
  await advance()
  const firstSignal = loadSolarSystem.mock.calls[0][1]
  const context = change === 'time' ? { mode: 'paused', at: new Date(at + 3600000).toISOString() } : paused
  rerender({ location: change === 'location' ? otherObserver : observer, context, timestamp: Date.parse(context.at), enabled: true })
  expect(firstSignal.aborted).toBe(true)
  expect(result.current.snapshot).toBeNull()
  await advance()
  expect(loadSolarSystem).toHaveBeenCalledTimes(2)
  const latest = snapshot('paused', Date.parse(context.at))
  await act(async () => second.resolve(latest))
  expect(result.current.snapshot).toBe(latest)
  await act(async () => first.resolve(snapshot('paused')))
  expect(result.current.snapshot).toBe(latest)
  expect(result.current.status).toBe('ready')
  const lastSignal = loadSolarSystem.mock.calls[1][1]
  unmount()
  expect(lastSignal.aborted).toBe(true)
})

it('refreshes a live window after 90 seconds rather than fetching on clock ticks', async () => {
  const { result, rerender, unmount } = mount({ context: live })
  await advance()
  expect(result.current.status).toBe('ready')
  for (let second = 1; second <= 5; second += 1) {
    await advance(1000)
    rerender({ location: observer, context: live, timestamp: at + second * 1000, enabled: true })
  }
  expect(loadSolarSystem).toHaveBeenCalledTimes(1)
  await advance(84999)
  expect(loadSolarSystem).toHaveBeenCalledTimes(1)
  await advance(1)
  expect(loadSolarSystem).toHaveBeenCalledTimes(2)
  expect(loadSolarSystem.mock.calls[1][0].at).toBe(new Date(at + 90000).toISOString())
  unmount()
  await advance(300000)
  expect(loadSolarSystem).toHaveBeenCalledTimes(2)
})

it('keeps a paused sky fixed and lets an explicit retry recover a failed request', async () => {
  loadSolarSystem.mockRejectedValueOnce(new TypeError('offline'))
  const { result, rerender } = mount()
  await advance()
  expect(result.current.status).toBe('error')
  expect(result.current.error).toEqual({ key: 'errors.network' })
  await advance(300000)
  expect(loadSolarSystem).toHaveBeenCalledTimes(1)
  act(() => result.current.retry())
  await advance()
  const fixed = result.current.snapshot
  expect(result.current.status).toBe('ready')
  await advance(3600000)
  rerender({ location: observer, context: paused, timestamp: at, enabled: true })
  expect(loadSolarSystem).toHaveBeenCalledTimes(2)
  expect(result.current.snapshot).toBe(fixed)
})

it('rejects expired live responses and retries a transient failure after 30 seconds', async () => {
  loadSolarSystem.mockResolvedValueOnce(snapshot('live', at - 121000))
  const { result } = mount({ context: live })
  await advance()
  expect(result.current.status).toBe('error')
  expect(result.current.snapshot).toBeNull()
  expect(result.current.error.key).toBe('sky.solar.expired')
  await advance(29999)
  expect(loadSolarSystem).toHaveBeenCalledTimes(1)
  await advance(1)
  expect(loadSolarSystem).toHaveBeenCalledTimes(2)
  expect(result.current.status).toBe('ready')
})

it('hides expired positions while renewal is pending and aborts when disabled', async () => {
  const pending = deferred()
  loadSolarSystem.mockResolvedValueOnce(snapshot()).mockReturnValueOnce(pending.promise)
  const { result, rerender } = mount({ context: live })
  await advance()
  const first = result.current.snapshot
  await advance(90000)
  expect(result.current.snapshot).toBe(first)
  await advance(30001)
  rerender({ location: observer, context: live, timestamp: at + 120001, enabled: true })
  expect(result.current.snapshot).toBeNull()
  const signal = loadSolarSystem.mock.calls[1][1]
  rerender({ location: observer, context: live, timestamp: at + 120001, enabled: false })
  expect(signal.aborted).toBe(true)
  await act(async () => pending.resolve(snapshot('live', at + 90000)))
  await advance(300000)
  expect(result.current.status).toBe('idle')
  expect(result.current.snapshot).toBeNull()
  expect(loadSolarSystem).toHaveBeenCalledTimes(2)
})
