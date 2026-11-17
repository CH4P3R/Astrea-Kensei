import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import useFitsImage from '../../src/hooks/useFitsImage.js'
import FitsControls from '../../src/components/controls/FitsControls.jsx'
import I18nProvider from '../../src/i18n/I18nProvider.jsx'
import { searchCoordinates, searchImages } from '../../src/services/images.js'

vi.mock('../../src/services/images.js', async (importOriginal) => ({
  ...await importOriginal(),
  searchCoordinates: vi.fn(),
  searchImages: vi.fn(),
  loadMetadata: vi.fn(),
  loadPixels: vi.fn(),
  loadProjection: vi.fn(),
  recropImage: vi.fn(),
}))
vi.mock('../../src/three/core/imageDataUtils.js', () => ({
  decodePixels: vi.fn(),
  validateImage: vi.fn(),
}))

const observer = { latitude: 51, longitude: 0 }
const timeContext = { mode: 'live', at: '2026-11-15T00:00:00Z' }
const restored = { ra: 50, dec: -60, size: 9, detector: 4 }
const result = (ra = 10, dec = 20) => ({
  images: [], has_more: false, query: { ra_deg: ra, dec_deg: dec, size_deg: 7 / 60 },
})
const deferred = () => {
  let resolve, reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

function Probe({ options, controls = false }) {
  const fits = useFitsImage(observer, timeContext, options)
  return <>
    <output data-testid="state">{JSON.stringify({
      coordinates: fits.coordinates, committed: fits.committed, commitPending: fits.commitPending,
      size: fits.size, detector: fits.detector, preparing: fits.preparing, status: fits.status,
    })}</output>
    <button onClick={() => fits.searchByCoordinates(83.63, -5.39)}>coordinates</button>
    <button onClick={() => fits.searchByCoordinates(10, 20)}>point</button>
    <button onClick={() => fits.search({ x: 1, y: 0, z: 0 })}>sky</button>
    <button onClick={() => fits.setSize(12)}>size12</button>
    <button onClick={() => fits.setSize(20)}>size20</button>
    <button onClick={() => fits.setDetector(3)}>d3</button>
    <button onClick={() => fits.setCoordinate('ra', '99')}>editRa</button>
    <button onClick={() => fits.setCoordinate('dec', '-88')}>editDec</button>
    <button onClick={() => fits.cancelPreparation()}>cancelPreparation</button>
    <button onClick={() => fits.cancel()}>cancel</button>
    <button onClick={() => fits.reset()}>reset</button>
    <button onClick={() => fits.restore(restored)}>restore</button>
    <button onClick={() => fits.applyUrl({ status: 'valid', search: restored })}>valid</button>
    <button onClick={() => fits.applyUrl({ status: 'none' })}>none</button>
    <button onClick={() => fits.applyUrl({ status: 'invalid' })}>invalid</button>
    {controls && <FitsControls fits={fits} observer={observer} />}
  </>
}

const state = () => JSON.parse(screen.getByTestId('state').textContent)
const click = (name) => fireEvent.click(screen.getByRole('button', { name, exact: true }))
const settled = () => waitFor(() => expect(state().status).toBe('results'))
const mount = (props = {}) => render(<I18nProvider><Probe {...props} /></I18nProvider>)

beforeEach(() => {
  vi.resetAllMocks()
  searchCoordinates.mockResolvedValue(result())
  searchImages.mockResolvedValue(result(30, 40))
})

describe('committed sky searches', () => {
  it('commits a coordinate submit at dispatch and leaves drafts out of the URL', async () => {
    const onCommittedChange = vi.fn()
    searchCoordinates.mockReturnValue(deferred().promise)
    mount({ options: { onCommittedChange } })
    click('coordinates')
    expect(searchCoordinates).toHaveBeenCalledWith(83.63, -5.39, 7, 0, expect.any(AbortSignal))
    expect(onCommittedChange).toHaveBeenLastCalledWith({ ra: 83.63, dec: -5.39, size: 7, detector: 0 })
    expect(state().committed).toEqual({ ra: 83.63, dec: -5.39, size: 7, detector: 0 })
    expect(state().coordinates).toEqual({ ra: '83.63', dec: '-5.39' })
    click('size12')
    expect(state().size).toBe(12)
    expect(state().committed.size).toBe(7)
    expect(onCommittedChange).toHaveBeenCalledTimes(1)
  })

  it('waits for resolved sky coordinates before committing and keeps the previous commit on failure', async () => {
    const onCommittedChange = vi.fn()
    mount({ options: { onCommittedChange }, controls: true })
    click('point')
    await settled()
    click('size12')
    const pending = deferred()
    searchImages.mockReturnValueOnce(pending.promise)
    click('sky')
    expect(state().commitPending).toBe(true)
    expect(state().committed).toEqual({ ra: 10, dec: 20, size: 7, detector: 0 })
    expect(onCommittedChange).toHaveBeenCalledTimes(1)
    await act(async () => pending.resolve({
      images: [], has_more: false, query: { ra_deg: 30, dec_deg: 40, size_deg: 0.2 },
    }))
    expect(state().committed).toEqual({ ra: 30, dec: 40, size: 12, detector: 0 })
    expect(state().commitPending).toBe(false)
    expect(document.querySelector('input[name="ra"]').value).toBe('30')
    expect(document.querySelector('input[name="dec"]').value).toBe('40')
    expect(onCommittedChange).toHaveBeenCalledTimes(2)
    searchImages.mockRejectedValueOnce(new Error('offline'))
    click('sky')
    await waitFor(() => expect(state().status).toBe('error'))
    expect(state().committed).toEqual({ ra: 30, dec: 40, size: 12, detector: 0 })
    expect(state().commitPending).toBe(false)
    expect(onCommittedChange).toHaveBeenCalledTimes(2)
  })

  it('repeats the detector with the last committed size and commits the new filter', async () => {
    const onCommittedChange = vi.fn()
    mount({ options: { onCommittedChange } })
    click('point')
    await settled()
    click('size20')
    click('d3')
    expect(searchCoordinates).toHaveBeenLastCalledWith(10, 20, 7, 3, expect.any(AbortSignal))
    expect(state().committed).toEqual({ ra: 10, dec: 20, size: 7, detector: 3 })
    expect(onCommittedChange).toHaveBeenLastCalledWith({ ra: 10, dec: 20, size: 7, detector: 3 })
    expect(onCommittedChange).toHaveBeenCalledTimes(2)
    await settled()
    click('coordinates')
    expect(state().detector).toBe(0)
    expect(state().committed.detector).toBe(0)
    await settled()
  })

  it('restores and clears without treating navigation as a user commit', async () => {
    const onCommittedChange = vi.fn()
    mount({ options: { onCommittedChange } })
    for (const action of ['valid', 'restore']) {
      click(action)
      expect(state()).toMatchObject({
        coordinates: { ra: '50', dec: '-60' }, size: 9, detector: 4, committed: restored,
      })
      expect(searchCoordinates).toHaveBeenLastCalledWith(50, -60, 9, 4, expect.any(AbortSignal))
      await settled()
    }
    expect(searchCoordinates).toHaveBeenCalledTimes(2)
    click('none')
    expect(state().committed).toBe(null)
    click('valid')
    const signal = searchCoordinates.mock.lastCall[4]
    click('invalid')
    expect(signal.aborted).toBe(true)
    expect(state()).toMatchObject({ committed: null, commitPending: false, status: 'idle' })
    expect(onCommittedChange).not.toHaveBeenCalled()
  })

  it('cancel preparation restores committed controls and reset clears the commit', async () => {
    const onCommittedChange = vi.fn()
    mount({ options: { onCommittedChange } })
    click('point')
    await settled()
    click('editRa')
    click('editDec')
    click('size12')
    expect(state().preparing).toBe(true)
    click('cancelPreparation')
    expect(state()).toMatchObject({ coordinates: { ra: '10', dec: '20' }, size: 7, preparing: false })
    click('size12')
    click('reset')
    expect(state()).toMatchObject({ committed: null, commitPending: false, size: 12, detector: 0, status: 'idle' })
    expect(onCommittedChange).toHaveBeenLastCalledWith(null)
    expect(onCommittedChange).toHaveBeenCalledTimes(2)
  })

  it('initializes a saved search without dispatching or notifying', () => {
    const onCommittedChange = vi.fn()
    mount({ options: { initialSearch: restored, onCommittedChange } })
    expect(state()).toMatchObject({
      committed: restored, coordinates: { ra: '50', dec: '-60' }, size: 9, detector: 4, commitPending: false,
    })
    expect(searchCoordinates).not.toHaveBeenCalled()
    expect(onCommittedChange).not.toHaveBeenCalled()
  })

  it('cancels unresolved sky commits and ignores late results', async () => {
    const onCommittedChange = vi.fn()
    mount({ options: { onCommittedChange } })
    click('point')
    await settled()
    const pending = deferred()
    searchImages.mockReturnValueOnce(pending.promise)
    click('sky')
    const signal = searchImages.mock.lastCall[4]
    click('cancel')
    expect(signal.aborted).toBe(true)
    expect(state().commitPending).toBe(false)
    await act(async () => pending.resolve(result(30, 40)))
    expect(state().committed).toEqual({ ra: 10, dec: 20, size: 7, detector: 0 })
    expect(onCommittedChange).toHaveBeenCalledTimes(1)
  })

  it('does not let a superseded sky request clear a newer pending commit', async () => {
    mount()
    const first = deferred(), second = deferred()
    searchImages.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
    click('sky')
    click('sky')
    await act(async () => first.resolve(result(1, 2)))
    expect(state().commitPending).toBe(true)
    expect(state().committed).toBe(null)
    await act(async () => second.resolve(result(30, 40)))
    expect(state().commitPending).toBe(false)
    expect(state().committed).toEqual({ ra: 30, dec: 40, size: 7, detector: 0 })
  })

  it.each([[360, 40], [30, 91], [null, 40], [30, '40']])(
    'does not commit invalid backend coordinates %s / %s', async (ra, dec) => {
      const onCommittedChange = vi.fn()
      mount({ options: { initialSearch: restored, onCommittedChange } })
      searchImages.mockResolvedValueOnce(result(ra, dec))
      click('sky')
      await waitFor(() => expect(state().commitPending).toBe(false))
      expect(state().committed).toEqual(restored)
      expect(onCommittedChange).not.toHaveBeenCalled()
    },
  )

  it('uses the latest notification callback even for an in-flight search', async () => {
    const first = vi.fn(), latest = vi.fn(), pending = deferred()
    const view = mount({ options: { onCommittedChange: first } })
    searchImages.mockReturnValueOnce(pending.promise)
    click('sky')
    view.rerender(<I18nProvider><Probe options={{ onCommittedChange: latest }} /></I18nProvider>)
    await act(async () => pending.resolve(result(30, 40)))
    expect(first).not.toHaveBeenCalled()
    expect(latest).toHaveBeenCalledExactlyOnceWith({ ra: 30, dec: 40, size: 7, detector: 0 })
    click('reset')
    expect(latest).toHaveBeenLastCalledWith(null)
  })

  it('controls RA/Dec drafts and submits numeric coordinates through the real form', async () => {
    const onCommittedChange = vi.fn()
    mount({ controls: true, options: { onCommittedChange } })
    const ra = document.querySelector('input[name="ra"]')
    const dec = document.querySelector('input[name="dec"]')
    fireEvent.change(ra, { target: { value: '83.63' } })
    fireEvent.change(dec, { target: { value: '-5.39' } })
    expect(state().coordinates).toEqual({ ra: '83.63', dec: '-5.39' })
    expect(state().preparing).toBe(true)
    expect(onCommittedChange).not.toHaveBeenCalled()
    fireEvent.submit(ra.form)
    expect(searchCoordinates).toHaveBeenCalledWith(83.63, -5.39, 7, 0, expect.any(AbortSignal))
    expect(state().committed).toEqual({ ra: 83.63, dec: -5.39, size: 7, detector: 0 })
    await settled()
  })
})
