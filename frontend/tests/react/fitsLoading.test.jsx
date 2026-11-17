import { StrictMode, useEffect } from 'react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import useFitsImage from '../../src/hooks/useFitsImage.js'
import useObserver from '../../src/hooks/useObserver.js'
import { loadMetadata, loadPixels, loadProjection, recropImage, searchCoordinates, searchImages } from '../../src/services/images.js'

vi.mock('../../src/services/images.js', async (importOriginal) => ({
  ...await importOriginal(),
  searchCoordinates: vi.fn(), searchImages: vi.fn(), loadMetadata: vi.fn(),
  loadPixels: vi.fn(), loadProjection: vi.fn(), recropImage: vi.fn(),
}))
vi.mock('../../src/three/core/imageDataUtils.js', () => ({
  decodePixels: (buffer) => buffer, validateImage: vi.fn(),
}))

const observer = { latitude: 51, longitude: 0 }
const otherObserver = { latitude: 19.43, longitude: -99.13 }
const timeContext = { mode: 'live', at: '2026-11-15T00:00:00Z' }
const saved = { ra: 50, dec: -60, size: 9, detector: 4 }
const result = (id = 'A', ra = 10, dec = 20) => ({
  images: [{ id }], has_more: false, query: { ra_deg: ra, dec_deg: dec, size_deg: 7 / 60 },
})
const metadata = (id) => ({ id, image: { width: 1, height: 1 }, requested: { size_deg: 7 / 60 } })
const deferred = () => {
  let resolve, reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

function Probe({ observer: currentObserver = observer, rendererReady = true, options, location }) {
  const fits = useFitsImage(currentObserver, timeContext, options)
  const { setTextureLimit } = fits
  useEffect(() => { if (rendererReady) setTextureLimit(4096) }, [rendererReady, setTextureLimit])
  return <>
    <output data-testid="state">{JSON.stringify({
      status: fits.status, images: fits.images, active: fits.active?.metadata.id ?? null,
      detail: fits.detail?.metadata.id ?? null, refining: fits.refining, error: fits.error,
      notice: fits.notice,
      committed: fits.committed, commitPending: fits.commitPending,
      source: location?.observer?.source, locationError: location?.error,
    })}</output>
    <button onClick={() => fits.searchByCoordinates(10, 20)}>A</button>
    <button onClick={() => fits.searchByCoordinates(30, 40)}>B</button>
    <button onClick={() => fits.search({ x: 1, y: 0, z: 0 })}>sky</button>
    <button onClick={() => fits.load('manual')}>load</button>
    <button onClick={() => fits.refine(2)}>refine</button>
    <button onClick={() => fits.setDetector(3)}>detector</button>
    <button onClick={fits.cancel}>cancel</button>
    <button onClick={() => fits.reset()}>clear</button>
    <button onClick={() => fits.applyUrl({ status: 'invalid' })}>invalid</button>
    <button onClick={() => fits.applyUrl({ status: 'valid', search: saved })}>valid</button>
    <button onClick={() => location?.applyManualLocation(19.43, -99.13)}>manual location</button>
  </>
}

function LocationProbe() {
  const location = useObserver({ automatic: true })
  return <Probe observer={location.observer} location={location} />
}

const state = () => JSON.parse(screen.getByTestId('state').textContent)
const click = (name) => fireEvent.click(screen.getByRole('button', { name, exact: true }))
const status = (value) => waitFor(() => expect(state().status).toBe(value))
const flush = () => act(async () => {})

beforeEach(() => {
  vi.resetAllMocks()
  searchCoordinates.mockImplementation(async (ra, dec) => result(ra === 30 ? 'B' : 'A', ra, dec))
  searchImages.mockResolvedValue(result())
  loadMetadata.mockImplementation(async (id) => metadata(id))
  loadPixels.mockResolvedValue(new ArrayBuffer(4))
  loadProjection.mockResolvedValue({ center: [0, 0] })
  recropImage.mockResolvedValue(metadata('detail'))
})
afterEach(() => vi.unstubAllGlobals())

describe('FITS search and loading lifecycle', () => {
  it.each(['observer', 'renderer'])('waits for %s readiness, then consumes the result once', async (missing) => {
    const props = { observer: missing === 'observer' ? null : observer, rendererReady: missing !== 'renderer' }
    const view = render(<Probe {...props} />)
    click('A')
    await status('results')
    expect(state().images).toEqual([{ id: 'A' }])
    expect(loadMetadata).not.toHaveBeenCalled()
    view.rerender(<Probe />)
    await status('ready')
    expect(loadMetadata).toHaveBeenCalledExactlyOnceWith('A', expect.any(AbortSignal))
    view.rerender(<Probe observer={otherObserver} />)
    await flush()
    expect(loadMetadata).toHaveBeenCalledTimes(1)
  })

  it('waits for both observer and renderer, regardless of which arrives first', async () => {
    const view = render(<Probe observer={null} rendererReady={false} />)
    click('A')
    await status('results')
    view.rerender(<Probe rendererReady={false} />)
    await flush()
    expect(loadMetadata).not.toHaveBeenCalled()
    view.rerender(<Probe />)
    await status('ready')
    expect(loadMetadata).toHaveBeenCalledTimes(1)
  })

  it('does not retry a failed auto-load after an observer change', async () => {
    loadMetadata.mockRejectedValueOnce(new Error('offline'))
    const view = render(<Probe observer={null} />)
    click('A')
    await status('results')
    view.rerender(<Probe />)
    await status('error')
    expect(state().error).toBeTruthy()
    view.rerender(<Probe observer={otherObserver} />)
    await flush()
    expect(loadMetadata).toHaveBeenCalledTimes(1)
  })

  it('recovers from denied geolocation through real manual location and loads once', async () => {
    vi.stubGlobal('isSecureContext', true)
    vi.stubGlobal('navigator', {
      geolocation: { getCurrentPosition: (_success, fail) => fail({ code: 1 }) },
    })
    render(<LocationProbe />)
    await waitFor(() => expect(state().locationError).toBe('location.errors.denied'))
    click('A')
    await status('results')
    expect(state().images).toEqual([{ id: 'A' }])
    expect(loadMetadata).not.toHaveBeenCalled()
    click('manual location')
    await status('ready')
    expect(state().source).toBe('manual')
    expect(loadMetadata).toHaveBeenCalledTimes(1)
    expect(loadProjection.mock.lastCall[1].observer).toEqual({
      latitude_deg: 19.43, longitude_deg: -99.13, elevation_m: 0,
    })
  })

  it.each(['cancel', 'clear', 'invalid'])('%s discards an observer-delayed auto-load', async (action) => {
    const view = render(<Probe observer={null} />)
    click('A')
    await status('results')
    click(action)
    view.rerender(<Probe />)
    await flush()
    expect(loadMetadata).not.toHaveBeenCalled()
    expect(state().active).toBe(null)
    if (action !== 'cancel') expect(state().committed).toBe(null)
  })

  it.each(['cancel', 'clear', 'invalid', 'unmount'])('%s aborts a search and ignores its late response', async (action) => {
    const pending = deferred(), onCommittedChange = vi.fn()
    searchImages.mockReturnValueOnce(pending.promise)
    const view = render(<Probe options={{ onCommittedChange }} />)
    click('sky')
    const signal = searchImages.mock.lastCall[4]
    expect(state().commitPending).toBe(true)
    if (action === 'unmount') view.unmount()
    else click(action)
    expect(signal.aborted).toBe(true)
    await act(async () => pending.resolve(result()))
    expect(loadMetadata).not.toHaveBeenCalled()
    expect(onCommittedChange.mock.calls).toEqual(action === 'clear' ? [[null]] : [])
    if (action !== 'unmount') {
      expect(state().commitPending).toBe(false)
      expect(state().images).toEqual([])
    }
  })

  it.each(['metadata', 'pixels/projection'])('unmount aborts loading at %s and suppresses downstream work', async (boundary) => {
    const pending = deferred()
    if (boundary === 'metadata') loadMetadata.mockReturnValueOnce(pending.promise)
    else loadPixels.mockReturnValueOnce(pending.promise)
    const view = render(<Probe />)
    click('A')
    await waitFor(() => expect(loadMetadata).toHaveBeenCalledTimes(1))
    const signal = loadMetadata.mock.lastCall[1]
    if (boundary !== 'metadata') await waitFor(() => expect(loadPixels).toHaveBeenCalledTimes(1))
    view.unmount()
    expect(signal.aborted).toBe(true)
    await act(async () => pending.resolve(boundary === 'metadata' ? metadata('A') : new ArrayBuffer(4)))
    if (boundary === 'metadata') expect(loadPixels).not.toHaveBeenCalled()
  })

  it('ignores a superseded noncooperative sky search without committing or replacing results', async () => {
    const first = deferred(), second = deferred(), onCommittedChange = vi.fn()
    searchImages.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
    render(<Probe options={{ onCommittedChange }} />)
    click('sky')
    const signal = searchImages.mock.lastCall[4]
    click('sky')
    expect(signal.aborted).toBe(true)
    await act(async () => second.resolve(result('B', 30, 40)))
    await status('ready')
    await act(async () => first.resolve(result('A', 10, 20)))
    expect(state()).toMatchObject({ images: [{ id: 'B' }], active: 'B', committed: { ra: 30, dec: 40 } })
    expect(onCommittedChange).toHaveBeenCalledExactlyOnceWith({ ra: 30, dec: 40, size: 7, detector: 0 })
    expect(loadMetadata).toHaveBeenCalledTimes(1)
  })

  it.each(['metadata', 'pixels', 'projection'])('ignores a superseded load after %s resolves late', async (boundary) => {
    const pending = deferred()
    if (boundary === 'metadata') loadMetadata.mockReturnValueOnce(pending.promise)
    if (boundary === 'pixels') loadPixels.mockReturnValueOnce(pending.promise)
    if (boundary === 'projection') loadProjection.mockReturnValueOnce(pending.promise)
    render(<Probe />)
    click('A')
    await waitFor(() => expect(loadMetadata).toHaveBeenCalledTimes(1))
    if (boundary !== 'metadata') await waitFor(() => expect(loadProjection).toHaveBeenCalledTimes(1))
    const signal = loadMetadata.mock.calls[0][1]
    click('B')
    await status('ready')
    expect(signal.aborted).toBe(true)
    await act(async () => pending.resolve(boundary === 'metadata' ? metadata('A')
      : boundary === 'pixels' ? new ArrayBuffer(4) : { stale: true }))
    expect(state()).toMatchObject({ active: 'B', images: [{ id: 'B' }], committed: { ra: 30, dec: 40 } })
  })

  it('a newer pending search replaces the old intent', async () => {
    const pending = deferred()
    const view = render(<Probe observer={null} />)
    click('A')
    await status('results')
    searchCoordinates.mockReturnValueOnce(pending.promise)
    click('B')
    view.rerender(<Probe />)
    await flush()
    expect(loadMetadata).not.toHaveBeenCalled()
    await act(async () => pending.resolve(result('B', 30, 40)))
    await status('ready')
    expect(loadMetadata).toHaveBeenCalledExactlyOnceWith('B', expect.any(AbortSignal))
  })

  it('manual loading consumes a renderer-delayed intent instead of replaying it', async () => {
    const view = render(<Probe rendererReady={false} />)
    click('A')
    await status('results')
    click('load')
    await status('ready')
    view.rerender(<Probe />)
    await flush()
    expect(state().active).toBe('manual')
    expect(loadMetadata).toHaveBeenCalledExactlyOnceWith('manual', expect.any(AbortSignal))
  })

  it.each(['A', 'clear', 'invalid', 'unmount'])('%s invalidates in-flight refinement', async (action) => {
    const pending = deferred()
    recropImage.mockReturnValueOnce(pending.promise)
    const view = render(<Probe />)
    click('A')
    await status('ready')
    click('refine')
    const signal = recropImage.mock.lastCall[2]
    if (action === 'unmount') view.unmount()
    else click(action)
    expect(signal.aborted).toBe(true)
    await act(async () => pending.resolve(metadata('stale-detail')))
    expect(loadPixels.mock.calls.some(([id]) => id === 'stale-detail')).toBe(false)
    if (action !== 'unmount') expect(state().detail).toBe(null)
  })

  it.each(['cancel', 'clear', 'invalid'].flatMap((action) =>
    ['metadata', 'pixels', 'projection'].map((boundary) => [action, boundary])))(
    '%s suppresses late load state at %s', async (action, boundary) => {
      const pending = deferred()
      if (boundary === 'metadata') loadMetadata.mockReturnValueOnce(pending.promise)
      if (boundary === 'pixels') loadPixels.mockReturnValueOnce(pending.promise)
      if (boundary === 'projection') loadProjection.mockReturnValueOnce(pending.promise)
      render(<Probe />)
      click('A')
      await waitFor(() => expect(loadMetadata).toHaveBeenCalledTimes(1))
      if (boundary !== 'metadata') await waitFor(() => expect(loadProjection).toHaveBeenCalledTimes(1))
      const signal = loadMetadata.mock.lastCall[1]
      click(action)
      expect(signal.aborted).toBe(true)
      await act(async () => pending.resolve(boundary === 'metadata' ? metadata('A')
        : boundary === 'pixels' ? new ArrayBuffer(4) : { stale: true }))
      expect(state()).toMatchObject({ active: null, status: 'idle' })
    },
  )

  it.each(['cancel', 'detector'])('%s immediately invalidates refinement even while retaining the active image', async (action) => {
    const pending = deferred(), search = deferred()
    const view = render(<Probe />)
    click('A')
    await status('ready')
    recropImage.mockReturnValueOnce(pending.promise)
    click('refine')
    const signal = recropImage.mock.lastCall[2]
    searchCoordinates.mockReturnValueOnce(search.promise)
    click(action)
    expect(signal.aborted).toBe(true)
    expect(state().refining).toBe(false)
    await act(async () => pending.resolve(metadata('stale-detail')))
    expect(state().detail).toBe(null)
    expect(loadPixels.mock.calls.some(([id]) => id === 'stale-detail')).toBe(false)
    view.unmount()
  })

  it.each(['pixels', 'projection'])('clear rejects a refinement resolving late at %s', async (boundary) => {
    const pending = deferred()
    render(<Probe />)
    click('A')
    await status('ready')
    if (boundary === 'pixels') loadPixels.mockReturnValueOnce(pending.promise)
    else loadProjection.mockReturnValueOnce(pending.promise)
    click('refine')
    await waitFor(() => expect(loadProjection).toHaveBeenCalledTimes(2))
    const signal = recropImage.mock.lastCall[2]
    click('clear')
    expect(signal.aborted).toBe(true)
    await act(async () => pending.resolve(boundary === 'pixels' ? new ArrayBuffer(4) : { stale: true }))
    expect(state()).toMatchObject({ detail: null, refining: false, active: null, status: 'idle' })
  })

  it('silently hydrates initialSearch once even under Strict Mode effect replay', async () => {
    const requests = [], onCommittedChange = vi.fn()
    searchCoordinates.mockImplementation((_ra, _dec, _size, _detector, signal) => {
      const pending = deferred()
      requests.push({ ...pending, signal })
      return pending.promise
    })
    const view = render(<StrictMode><Probe options={{ initialSearch: saved, onCommittedChange }} /></StrictMode>)
    await waitFor(() => expect(requests.filter(({ signal }) => !signal.aborted)).toHaveLength(1))
    const live = requests.find(({ signal }) => !signal.aborted)
    const dispatches = requests.length
    expect(searchCoordinates).toHaveBeenLastCalledWith(50, -60, 9, 4, live.signal)
    await act(async () => live.resolve(result('saved', 50, -60)))
    await status('ready')
    expect(state().committed).toEqual(saved)
    expect(onCommittedChange).not.toHaveBeenCalled()
    view.rerender(<StrictMode><Probe options={{ initialSearch: { ...saved }, onCommittedChange }} /></StrictMode>)
    await flush()
    expect(requests).toHaveLength(dispatches)
    expect(loadMetadata).toHaveBeenCalledTimes(1)
  })

  it('hydrates without an observer and does not redispatch a failed initial search on rerender', async () => {
    const onCommittedChange = vi.fn()
    searchCoordinates.mockRejectedValueOnce(new Error('offline'))
    const view = render(<Probe observer={null} options={{ initialSearch: saved, onCommittedChange }} />)
    await status('error')
    expect(searchCoordinates).toHaveBeenCalledExactlyOnceWith(50, -60, 9, 4, expect.any(AbortSignal))
    view.rerender(<Probe options={{ initialSearch: { ...saved }, onCommittedChange }} />)
    await flush()
    expect(searchCoordinates).toHaveBeenCalledTimes(1)
    expect(loadMetadata).not.toHaveBeenCalled()
    expect(onCommittedChange).not.toHaveBeenCalled()
  })

  it('manual loading supersedes a noncooperative search', async () => {
    const pending = deferred(), onCommittedChange = vi.fn()
    searchImages.mockReturnValueOnce(pending.promise)
    render(<Probe options={{ onCommittedChange }} />)
    click('sky')
    const signal = searchImages.mock.lastCall[4]
    click('load')
    await status('ready')
    expect(signal.aborted).toBe(true)
    await act(async () => pending.resolve(result()))
    expect(state()).toMatchObject({ active: 'manual', committed: null, commitPending: false })
    expect(loadMetadata).toHaveBeenCalledTimes(1)
    expect(onCommittedChange).not.toHaveBeenCalled()
  })

  it.each(['coordinates', 'sky'])('manual load without an observer supersedes an in-flight %s search', async (kind) => {
    const pending = deferred(), onCommittedChange = vi.fn()
    const options = { onCommittedChange }
    if (kind === 'coordinates') searchCoordinates.mockReturnValueOnce(pending.promise)
    else searchImages.mockReturnValueOnce(pending.promise)
    const view = render(<Probe observer={kind === 'sky' ? observer : null} options={options} />)
    click(kind === 'coordinates' ? 'A' : 'sky')
    const signal = (kind === 'coordinates' ? searchCoordinates : searchImages).mock.lastCall[4]
    view.rerender(<Probe observer={null} options={options} />)
    click('load')
    expect(signal.aborted).toBe(true)
    expect(state()).toMatchObject({
      status: 'idle', active: null, images: [], commitPending: false, error: 'location.notices.required', notice: null,
      committed: kind === 'coordinates' ? { ra: 10, dec: 20, size: 7, detector: 0 } : null,
    })
    const superseded = state()
    await act(async () => pending.resolve(result('old-search', 70, 80)))
    expect(state()).toEqual(superseded)
    view.rerender(<Probe options={options} />)
    await flush()
    expect(state()).toEqual(superseded)
    expect(loadMetadata).not.toHaveBeenCalled()
    expect(onCommittedChange.mock.calls).toEqual(kind === 'coordinates'
      ? [[{ ra: 10, dec: 20, size: 7, detector: 0 }]] : [])
  })

  it('manual load without an observer keeps existing results but cancels their deferred load', async () => {
    const view = render(<Probe observer={null} />)
    click('A')
    await status('results')
    click('load')
    expect(state()).toMatchObject({
      status: 'results', images: [{ id: 'A' }], active: null, error: 'location.notices.required',
    })
    view.rerender(<Probe />)
    await flush()
    expect(loadMetadata).not.toHaveBeenCalled()
    expect(state().status).toBe('results')
  })

  it.each(['cancel', 'clear', 'invalid', 'B', 'valid', 'unmount'])('%s supersedes initial hydration before dispatch', async (action) => {
    const view = render(<Probe options={{ initialSearch: saved }} />)
    if (action === 'unmount') view.unmount()
    else click(action)
    await flush()
    expect(searchCoordinates).toHaveBeenCalledTimes(['B', 'valid'].includes(action) ? 1 : 0)
    if (action === 'B') expect(state().committed).toEqual({ ra: 30, dec: 40, size: 9, detector: 0 })
    if (action === 'valid') expect(state().committed).toEqual(saved)
  })

  it('still rejects sky clicks without an observer', async () => {
    render(<Probe observer={null} />)
    click('sky')
    await flush()
    expect(state().error).toBe('location.notices.required')
    expect(searchImages).not.toHaveBeenCalled()
  })
})
