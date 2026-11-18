import { StrictMode } from 'react'
import { act, cleanup, fireEvent, render, renderHook, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import I18nProvider from '../../src/i18n/I18nProvider.jsx'
import SpectralComparison from '../../src/components/blink-hud/SpectralComparison.jsx'
import ImageComparisonPanel from '../../src/components/blink-hud/ImageComparisonPanel.jsx'
import useBlinkPlayback from '../../src/hooks/useBlinkPlayback.js'
import useSpectralComparison from '../../src/hooks/useSpectralComparison.js'
import { loadSpectralSample } from '../../src/services/images.js'

vi.mock('../../src/services/images.js', async (original) => ({ ...await original(), loadSpectralSample: vi.fn() }))
const target = { ra_deg: 42.123456, dec_deg: -12.345678 }
const primary = { metadata: { id: 'A', requested: target, detector: 1, collection: 'dr1', observation: { start_utc: '2026-01-01T00:00:00Z' } } }
const frames = ['A', 'B'].map((id, index) => ({ id, label: id, reference: index === 0,
  image: index === 0 ? primary : { metadata: { ...primary.metadata, id, requested: { ra_deg: 50, dec_deg: 20 } } } }))
const sample = (id, point, wavelength = id === 'A' ? 1.1 : 1.4) => ({ image_id: id,
  target: { ...point, frame: 'ICRS' }, status: 'available', reason: null,
  sample: { pixel_x: 2, pixel_y: 3, detector_x: 500, detector_y: 1500, wavelength_um: wavelength, bandwidth_um: 0.025 },
  calibration: { source_url: 'https://irsa.ipac.caltech.edu/calibration.fits', method: 'CWAVE/CBAND' },
})
const deferred = () => {
  let resolve, reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
const flush = () => act(async () => { await Promise.resolve(); await Promise.resolve() })

beforeEach(() => {
  window.localStorage.setItem('astrea.language', 'en')
  vi.resetAllMocks()
  loadSpectralSample.mockImplementation(async (id, point) => sample(id, point))
})
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks() })

it('reports both measurements at A’s fixed ICRS position without declaring compatibility', async () => {
  render(<I18nProvider><SpectralComparison frames={frames} primary={primary} /></I18nProvider>)
  await flush()
  expect(loadSpectralSample.mock.calls.map(([id, point]) => ({ id, point }))).toEqual([
    { id: 'A', point: target }, { id: 'B', point: target },
  ])
  const section = screen.getByRole('region', { name: 'Wavelength at the target' })
  expect(section.textContent).toContain('RA 42.123456°')
  expect(within(section).getByRole('listitem', { name: 'Reference A' }).textContent).toContain('λ 1.1 µm · bandwidth 0.025 µm')
  expect(within(section).getByRole('listitem', { name: 'Observation B' }).textContent).toContain('Δλ from A: +0.3 µm')
  expect(section.textContent).toContain('does not establish equivalence across the field')
})

it('unavailable samples explain their reason and never substitute nominal detector wavelengths', async () => {
  loadSpectralSample.mockImplementation(async (id, point) => id === 'A'
    ? { ...sample(id, point), status: 'unavailable', reason: 'outside_image', sample: null, calibration: null }
    : sample(id, point))
  render(<I18nProvider><SpectralComparison frames={frames} primary={primary} /></I18nProvider>)
  await flush()
  const row = screen.getByRole('listitem', { name: 'Reference A' })
  expect(row.textContent).toContain('The target is outside this cutout.')
  expect(row.textContent).not.toContain('µm')
  expect(screen.getByText('Δλ unavailable until A has a calibrated sample.')).toBeTruthy()
})

it('a missing target is explicit and does not request a fallback image center', async () => {
  const noTarget = { metadata: { ...primary.metadata, requested: undefined, image: { center: target } } }
  render(<I18nProvider><SpectralComparison frames={frames} primary={noTarget} /></I18nProvider>)
  await flush()
  expect(screen.getByText('The reference has no valid target position.')).toBeTruthy()
  expect(loadSpectralSample).not.toHaveBeenCalled()
})

it('failed spectral requests and retries do not stop the real comparison player or trigger requests on frame changes', async () => {
  vi.useFakeTimers()
  const waiting = deferred()
  loadSpectralSample.mockImplementation((id, point) => id === 'B' ? waiting.promise : Promise.resolve(sample(id, point)))
  const comparison = { status: 'results', candidates: [], searchedYear: 2026, year: 2026, sameDetector: true,
    dirty: false, remove: vi.fn(), clear: vi.fn(), setYear: vi.fn(), setSameDetector: vi.fn() }
  const projections = { byId: { A: { ready: true }, B: { ready: true } }, retry: vi.fn() }
  function Player() {
    const playback = useBlinkPlayback(frames, true)
    return <><output aria-label="current-frame">{playback.frameId}</output>
      <ImageComparisonPanel comparison={comparison} playback={playback} reason="" primary={primary} frames={frames} projections={projections} /></>
  }
  render(<I18nProvider><Player /></I18nProvider>)
  await flush()
  fireEvent.click(screen.getByRole('button', { name: 'Play' }))
  await act(async () => { await vi.advanceTimersByTimeAsync(1000) })
  expect(screen.getByLabelText('current-frame').textContent).toBe('B')
  await act(async () => waiting.reject(new TypeError('offline')))
  expect(screen.getByRole('button', { name: 'Pause' })).toBeTruthy()
  await act(async () => { await vi.advanceTimersByTimeAsync(1000) })
  expect(screen.getByLabelText('current-frame').textContent).toBe('A')
  expect(loadSpectralSample).toHaveBeenCalledTimes(2)
  loadSpectralSample.mockImplementation(async (id, point) => sample(id, point))
  fireEvent.click(screen.getByRole('button', { name: 'Retry spectral calibration for B' }))
  await flush()
  expect(screen.getByRole('button', { name: 'Pause' })).toBeTruthy()
  expect(loadSpectralSample).toHaveBeenCalledTimes(3)
})

it('changing the selection or unmounting cancels requests and ignores late responses under StrictMode', async () => {
  const pending = []
  loadSpectralSample.mockImplementation((id, point, signal) => {
    const task = deferred(); pending.push({ id, point, signal, ...task }); return task.promise
  })
  const wrapper = ({ children }) => <StrictMode>{children}</StrictMode>
  const view = renderHook(({ selected }) => useSpectralComparison(selected, target), { initialProps: { selected: frames }, wrapper })
  await flush()
  const originalB = pending.find(({ id, signal }) => id === 'B' && !signal.aborted)
  view.rerender({ selected: [frames[0]] })
  expect(originalB.signal.aborted).toBe(true)
  await act(async () => originalB.resolve(sample('B', target)))
  expect(view.result.current.byId.B).toBeUndefined()
  const a = pending.find(({ id, signal }) => id === 'A' && !signal.aborted)
  view.unmount()
  expect(a.signal.aborted).toBe(true)
})

it('a timed-out request can be retried and cannot overwrite its replacement later', async () => {
  vi.useFakeTimers()
  const stalled = deferred()
  loadSpectralSample.mockReturnValueOnce(stalled.promise)
  const view = renderHook(() => useSpectralComparison([frames[0]], target))
  await flush()
  const signal = loadSpectralSample.mock.calls[0][2]
  await act(async () => { await vi.advanceTimersByTimeAsync(130000) })
  expect(signal.aborted).toBe(true)
  expect(view.result.current.byId.A.status).toBe('error')
  act(() => view.result.current.retry('A'))
  await flush()
  expect(view.result.current.byId.A.result.sample.wavelength_um).toBe(1.1)
  await act(async () => stalled.resolve(sample('A', target, 9)))
  expect(view.result.current.byId.A.result.sample.wavelength_um).toBe(1.1)
})
