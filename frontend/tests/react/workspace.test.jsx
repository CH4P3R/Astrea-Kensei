import { StrictMode, useEffect } from 'react'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import AppWorkspace from '../../src/components/layout/AppWorkspace.jsx'
import AppViewport from '../../src/components/layout/AppViewport.jsx'
import I18nProvider from '../../src/i18n/I18nProvider.jsx'
import { languageStorageKey } from '../../src/i18n/core.js'
import { groundOpacityStorageKey } from '../../src/hooks/useGroundOpacity.js'
import { loadMetadata, loadPixels, loadProjection, searchCoordinates, searchImages } from '../../src/services/images.js'

const scene = vi.hoisted(() => ({ fits: null, sky: null, observerAvailable: true }))
vi.mock('@react-three/fiber', () => ({ Canvas: ({ children }) => <>{children}</> }))
vi.mock('../../src/three/core/SkyScene.jsx', () => ({
  default: function Scene({ fits, onSkyClick, skyGuides, surfaceVisible, groundOpacity, dustVisible, observer }) {
    scene.fits = fits
    scene.sky = { guides: skyGuides, surfaceVisible, groundOpacity, dustVisible, observer }
    const { setTextureLimit } = fits
    useEffect(() => { setTextureLimit(4096) }, [setTextureLimit])
    return <button onClick={() => onSkyClick({ x: 1, y: 0, z: 0 }, { x: 20, y: 20 })}>sky click</button>
  },
}))
vi.mock('../../src/hooks/useObserver.js', () => {
  const observer = { latitude: 51, longitude: 0, source: 'manual' }
  return { default: ({ initialObserver } = {}) => ({ observer: scene.observerAvailable ? observer : initialObserver,
    status: scene.observerAvailable || initialObserver ? 'ready' : 'error', error: '', locate() {}, applyManualLocation() {} }) }
})
vi.mock('../../src/hooks/useSkyClock.js', () => {
  const clock = { context: { mode: 'paused', at: '2026-11-15T00:00:00Z' }, timestamp: Date.parse('2026-11-15T00:00:00Z'),
    paused: true, apply() {}, goLive() {}, pause() {} }
  return { default: () => clock }
})
vi.mock('../../src/hooks/useStars.js', () => ({ default: () => ({ status: 'idle', snapshot: null }) }))
vi.mock('../../src/hooks/useSolarSystem.js', () => ({ default: () => ({ status: 'idle', snapshot: null, error: '', retry() {} }) }))
vi.mock('../../src/hooks/useImageViewport.js', () => ({ default: () => ({}) }))
vi.mock('../../src/hooks/useImageComparison.js', () => ({
  default: () => ({ status: 'idle', observations: [], candidates: [], images: [], year: 2026, sameDetector: false }),
}))
vi.mock('../../src/hooks/useProjectedImage.js', () => ({
  default: (image) => ({ ready: Boolean(image), image, error: '', retry() {} }),
}))
vi.mock('../../src/hooks/useComparisonPresentation.js', () => ({
  default: (comparison) => ({
    frames: [], projections: { byId: {} }, primaryProjection: { ready: true },
    appearance: { appliedProcessing: {}, settings: { palette: 'gray', exposure: 0, opacity: 1 }, processing: {},
      ready: true, hasData: true },
    playback: { pause() {}, show() {} }, displayed: comparison.images[0], frameImages: [], layers: [],
  }),
}))
vi.mock('../../src/services/images.js', async (importOriginal) => ({
  ...await importOriginal(),
  searchCoordinates: vi.fn(), searchImages: vi.fn(), loadMetadata: vi.fn(),
  loadPixels: vi.fn(), loadProjection: vi.fn(), recropImage: vi.fn(),
}))
vi.mock('../../src/three/core/imageDataUtils.js', () => ({ decodePixels: (buffer) => buffer, validateImage: vi.fn() }))

const invalid = 'This shared link has invalid search settings. Correct the coordinates or clear the search.'
const historyWarning = 'The address bar could not be updated, but the search still works.'
const result = (ra = 10, dec = 20, images = []) => ({
  images, has_more: false, query: { ra_deg: ra, dec_deg: dec, size_deg: 7 / 60 },
})
const metadata = { id: 'image-A', detector: 3, collection: 'test', observation_id: 'obs-A',
  observation: { start_utc: '2026-11-15T00:00:00Z' }, requested: { ra_deg: 10, dec_deg: 20, size_deg: 7 / 60 },
  image: { width: 1, height: 1, nonfinite_count: 0, finite_min: 0, finite_max: 1, dtype: 'float32' } }
const deferred = () => {
  let resolve
  const promise = new Promise((yes) => { resolve = yes })
  return { promise, resolve }
}
const mount = (element = <AppWorkspace />) => render(<I18nProvider>{element}</I18nProvider>)
const flush = () => act(async () => {})
const input = (name) => document.querySelector(`input[name="${name}"]`)
const sizeInput = () => document.querySelector('#context-search input[type="range"]')
const click = (name) => fireEvent.click(screen.getByRole('button', { name, exact: true }))
const openSearch = () => {
  const trigger = screen.getByRole('button', { name: 'Preparation', exact: true })
  if (trigger.getAttribute('aria-expanded') !== 'true') fireEvent.click(trigger)
}
const edit = (ra, dec) => {
  fireEvent.change(input('ra'), { target: { value: String(ra) } })
  fireEvent.change(input('dec'), { target: { value: String(dec) } })
}
const submit = () => fireEvent.submit(input('ra').form)
const navigate = (href) => act(() => {
  window.history.pushState({}, '', href)
  window.dispatchEvent(new PopStateEvent('popstate'))
})
let clipboardDescriptor
const copyButton = (container) => within(container).getByRole('button', { name: 'Copy link', hidden: true })
const searchFooter = () => document.querySelector('#context-search .context-panel-footer')

beforeEach(() => {
  clipboardDescriptor = Object.getOwnPropertyDescriptor(navigator, 'clipboard')
  vi.resetAllMocks()
  // jsdom has no layout tree; retain the real anchoring hook with a positioned parent.
  vi.spyOn(HTMLElement.prototype, 'offsetParent', 'get').mockImplementation(function () { return this.parentElement })
  window.localStorage.clear()
  scene.fits = null
  scene.sky = null
  scene.observerAvailable = true
  searchCoordinates.mockImplementation(async (ra, dec) => result(ra, dec))
  searchImages.mockResolvedValue(result(30, 40))
  loadMetadata.mockResolvedValue(metadata)
  loadPixels.mockResolvedValue(new ArrayBuffer(4))
  loadProjection.mockResolvedValue({})
})
afterEach(() => {
  if (clipboardDescriptor) Object.defineProperty(navigator, 'clipboard', clipboardDescriptor)
  else delete navigator.clipboard
  vi.restoreAllMocks()
  vi.useRealTimers()
})

it('opens directly into an interactive workspace on the first visit', () => {
  mount(<AppViewport />)
  const root = document.querySelector('.app-viewport')
  expect(root.hasAttribute('inert')).toBe(false)
  expect(root.querySelector('.scene-layer')).toBeTruthy()
  expect(root.querySelector('.ui-layer').hasAttribute('inert')).toBe(false)
  expect(document.querySelector('dialog')).toBeNull()
  expect(screen.queryByRole('button', { name: 'View tutorial' })).toBeNull()
  openSearch()
  expect(screen.getByRole('button', { name: 'Preparation' }).getAttribute('aria-expanded')).toBe('true')
  expect(searchCoordinates).not.toHaveBeenCalled()
})

it('dismisses sidebar tooltips after toggling panels without losing button focus', () => {
  mount()
  const trigger = screen.getByRole('button', { name: 'Time', exact: true })
  const tooltip = document.getElementById(trigger.getAttribute('aria-describedby'))
  fireEvent.pointerEnter(trigger, { pointerType: 'mouse' })
  act(() => trigger.focus())
  expect(tooltip.dataset.open).toBe('true')
  fireEvent.click(trigger)
  expect(trigger.getAttribute('aria-expanded')).toBe('true')
  fireEvent.click(trigger)
  expect(trigger.getAttribute('aria-expanded')).toBe('false')
  expect(tooltip.dataset.open).toBe('false')
  expect(document.activeElement).toBe(trigger)
  fireEvent.pointerLeave(trigger, { pointerType: 'mouse' })
  expect(tooltip.dataset.open).toBe('false')

  // A new hover may show the name, but retained click focus must not pin it.
  fireEvent.pointerEnter(trigger, { pointerType: 'mouse' })
  expect(tooltip.dataset.open).toBe('true')
  fireEvent.pointerLeave(trigger, { pointerType: 'mouse' })
  expect(tooltip.dataset.open).toBe('false')
  act(() => trigger.blur())
  act(() => trigger.focus())
  expect(tooltip.dataset.open).toBe('true')
  fireEvent.keyDown(trigger, { key: 'Escape' })
  expect(tooltip.dataset.open).toBe('false')
  expect(trigger.getAttribute('aria-expanded')).toBe('false')
})

it('does not revive a clicked sidebar tooltip when a different panel opens', () => {
  mount()
  const first = screen.getByRole('button', { name: 'Time', exact: true })
  const second = screen.getByRole('button', { name: 'Location', exact: true })
  const bubble = (button) => document.getElementById(button.getAttribute('aria-describedby'))
  act(() => first.focus())
  fireEvent.click(first, { detail: 0 })
  expect(bubble(first).dataset.open).toBe('false')
  act(() => second.focus())
  expect(bubble(second).dataset.open).toBe('true')
  fireEvent.click(second, { detail: 0 })
  expect(first.getAttribute('aria-expanded')).toBe('false')
  expect(second.getAttribute('aria-expanded')).toBe('true')
  expect(bubble(first).dataset.open).toBe('false')
  fireEvent.click(second, { detail: 0 })
  expect(bubble(second).dataset.open).toBe('false')
})

it('independently controls celestial guides and retains them while visiting other panels', () => {
  mount()
  click('Sky appearance')
  const checkbox = (name) => screen.getByRole('checkbox', { name, exact: true })
  expect(checkbox('Constellations (88)').checked).toBe(true)
  expect(checkbox('Ecliptic').checked).toBe(false)
  expect(checkbox('RA/Dec grid').checked).toBe(false)
  const background = { surfaceVisible: scene.sky.surfaceVisible, dustVisible: scene.sky.dustVisible }

  fireEvent.click(checkbox('Ecliptic'))
  expect(scene.sky.guides).toEqual({ constellations: true, ecliptic: true, equatorial: false })
  fireEvent.click(checkbox('RA/Dec grid'))
  expect(scene.sky.guides).toEqual({ constellations: true, ecliptic: true, equatorial: true })
  fireEvent.click(checkbox('Constellations (88)'))
  expect(scene.sky.guides).toEqual({ constellations: false, ecliptic: true, equatorial: true })
  expect(scene.sky).toMatchObject(background)

  click('Time')
  expect(screen.queryByRole('checkbox', { name: 'Ecliptic', exact: true })).toBeNull()
  click('Sky appearance')
  expect(checkbox('Constellations (88)').checked).toBe(false)
  expect(checkbox('Ecliptic').checked).toBe(true)
  expect(checkbox('RA/Dec grid').checked).toBe(true)

  fireEvent.click(checkbox('Show central surface'))
  fireEvent.click(checkbox('Diffuse background'))
  expect(scene.sky.surfaceVisible).toBe(!background.surfaceVisible)
  expect(scene.sky.dustVisible).toBe(!background.dustVisible)
  expect(scene.sky.guides).toEqual({ constellations: false, ecliptic: true, equatorial: true })
  fireEvent.click(checkbox('Ecliptic'))
  expect(scene.sky.guides).toEqual({ constellations: false, ecliptic: false, equatorial: true })
  expect(searchCoordinates).not.toHaveBeenCalled()
  expect(searchImages).not.toHaveBeenCalled()
})

it.each([0, 0.73, 1])('restores ground darkness %s after the workspace is reloaded', (opacity) => {
  const first = mount()
  click('Sky appearance')
  const slider = screen.getByRole('slider', { name: 'Ground darkness', exact: true })
  fireEvent.change(slider, { target: { value: String(opacity) } })
  first.unmount()
  mount()
  click('Sky appearance')
  expect(screen.getByRole('slider', { name: 'Ground darkness', exact: true }).value).toBe(String(opacity))
  expect(scene.sky.groundOpacity).toBe(opacity)
})

it('falls back from an invalid saved ground preference without breaking the controls', () => {
  window.localStorage.setItem(groundOpacityStorageKey, 'NaN')
  mount()
  click('Sky appearance')
  const slider = screen.getByRole('slider', { name: 'Ground darkness', exact: true })
  expect(slider.value).toBe('0.22')
  fireEvent.change(slider, { target: { value: '0.61' } })
  expect(scene.sky.groundOpacity).toBe(0.61)
  expect(window.localStorage.getItem(groundOpacityStorageKey)).toBe('0.61')
})

it('keeps ground darkness adjustable when browser storage is blocked', () => {
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('Storage blocked') })
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Storage blocked') })
  mount()
  click('Sky appearance')
  const slider = screen.getByRole('slider', { name: 'Ground darkness', exact: true })
  expect(slider.value).toBe('0.22')
  fireEvent.change(slider, { target: { value: '0.57' } })
  expect(scene.sky.groundOpacity).toBe(0.57)
  expect(slider.value).toBe('0.57')
})

it('explains why guides require a location and enables them when an observer becomes available', () => {
  scene.observerAvailable = false
  const { rerender } = mount()
  click('Sky appearance')
  const guideNames = ['Constellations (88)', 'Ecliptic', 'RA/Dec grid']
  const reason = screen.getByText('Set your position in Location to orient these guides in your sky.')
  for (const name of guideNames) {
    const checkbox = screen.getByRole('checkbox', { name, exact: true })
    expect(checkbox.disabled).toBe(true)
    expect(checkbox.getAttribute('aria-describedby').split(' ')).toContain(reason.id)
  }
  expect(screen.getByRole('checkbox', { name: 'Show central surface' }).disabled).toBe(false)
  expect(screen.getByRole('checkbox', { name: 'Diffuse background' }).disabled).toBe(false)
  expect(scene.sky.observer).toBeFalsy()

  scene.observerAvailable = true
  rerender(<I18nProvider><AppWorkspace /></I18nProvider>)
  expect(screen.queryByText(reason.textContent)).toBeNull()
  for (const name of guideNames) {
    expect(screen.getByRole('checkbox', { name, exact: true }).disabled).toBe(false)
  }
  expect(scene.sky.observer).toMatchObject({ latitude: 51, longitude: 0 })
  fireEvent.click(screen.getByRole('checkbox', { name: 'Ecliptic', exact: true }))
  expect(scene.sky.guides).toEqual({ constellations: true, ecliptic: true, equatorial: false })
})

it('offers the celestial guides and their explanatory help in Spanish', () => {
  window.localStorage.setItem(languageStorageKey, 'es')
  mount()
  click('Aspecto del cielo')
  for (const name of ['Constelaciones (88)', 'Eclíptica', 'Cuadrícula RA/Dec']) {
    expect(screen.getByRole('checkbox', { name, exact: true }).disabled).toBe(false)
  }
  const help = screen.getByRole('button', { name: 'Información sobre Eclíptica', exact: true })
  fireEvent.focus(help)
  const tooltip = document.getElementById(help.getAttribute('aria-describedby'))
  expect(tooltip.getAttribute('role')).toBe('tooltip')
  expect(tooltip.dataset.open).toBe('true')
  expect(tooltip.textContent).toContain('Su inclinación respecto al horizonte cambia con tu ubicación y la hora seleccionada.')
})

it('loads a shared image and opens the inspector without a device observer', async () => {
  scene.observerAvailable = false
  window.history.replaceState({}, '', '/?ra=10&dec=20&size=7&detector=3')
  searchCoordinates.mockResolvedValueOnce(result(10, 20, [{ id: metadata.id }]))
  mount(<AppViewport />)
  await waitFor(() => expect(document.querySelector('.image-inspector[data-open="true"]')).toBeTruthy())
  expect(loadMetadata).toHaveBeenCalledWith(metadata.id, expect.any(AbortSignal))
  expect(loadProjection).toHaveBeenCalledWith(metadata.id, expect.objectContaining({
    observer: expect.objectContaining({ latitude_deg: 51.4779, longitude_deg: 0 }),
  }), expect.any(AbortSignal))
  expect(screen.getByText('Using Greenwich as a reference, not your location. You can change it in Location.')).toBeTruthy()
  expect(screen.queryByText('Welcome to Astrea')).toBeNull()
})

it('shows shared-search failures instead of leaving the initial view unexplained', async () => {
  scene.observerAvailable = false
  window.history.replaceState({}, '', '/?ra=10&dec=20')
  searchCoordinates.mockRejectedValueOnce(new Error('offline'))
  mount()
  await waitFor(() => expect(scene.fits.status).toBe('error'))
  expect(document.querySelector('#context-search').dataset.visible).toBe('true')
  expect(screen.queryByRole('complementary', { name: 'Image inspector' })).toBeNull()
})

it('places live committed links in the search footer and inspector summary without exposing drafts, metadata detector, or private URL fields', async () => {
  window.history.replaceState({}, '', '/?ra=10&dec=20&size=7&detector=0&latitude=51&foo=1#frag')
  const writeText = vi.fn().mockResolvedValue()
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
  searchCoordinates.mockResolvedValueOnce(result(10, 20, [{ id: metadata.id }]))
  mount()
  await waitFor(() => expect(document.querySelector('.inspector-summary')).toBeTruthy())
  const summary = document.querySelector('.inspector-summary')
  expect(copyButton(searchFooter()).disabled).toBe(false)
  expect(copyButton(summary).disabled).toBe(false)
  fireEvent.click(copyButton(summary))
  await flush()
  expect(writeText).toHaveBeenLastCalledWith(`${window.location.origin}/?ra=10&dec=20&size=7&detector=0`)
  openSearch()
  edit(50, 60)
  expect(within(summary).getByRole('status').textContent).toBe('Link copied')
  fireEvent.click(copyButton(searchFooter()))
  await flush()
  expect(writeText).toHaveBeenLastCalledWith(`${window.location.origin}/?ra=10&dec=20&size=7&detector=0`)
  submit()
  await flush()
  expect(within(searchFooter()).queryByRole('status')).toBeNull()
  fireEvent.click(copyButton(searchFooter()))
  await flush()
  expect(writeText).toHaveBeenLastCalledWith(`${window.location.origin}/?ra=50&dec=60&size=7&detector=0`)
})

it.each(['empty', 'failed'])('keeps sharing enabled for a committed %s search', async (outcome) => {
  window.history.replaceState({}, '', '/')
  if (outcome === 'failed') searchCoordinates.mockRejectedValueOnce(new Error('offline'))
  mount()
  openSearch()
  expect(copyButton(searchFooter()).disabled).toBe(true)
  edit(10, 20)
  submit()
  await flush()
  expect(scene.fits.status).toBe(outcome === 'empty' ? 'results' : 'error')
  expect(copyButton(searchFooter()).disabled).toBe(false)
})

it.each(['shared link', 'coordinate submission'])('keeps Clear available after canceling an unresolved %s and clears only supported URL fields', async (entry) => {
  const shared = entry === 'shared link'
  window.history.replaceState({ retained: true }, '', shared
    ? '/sky?foo=1&ra=10&dec=20&size=7&detector=3#frag'
    : '/sky?foo=1#frag')
  const pending = deferred()
  searchCoordinates.mockReturnValueOnce(pending.promise)
  mount()
  await flush()
  openSearch()
  if (!shared) {
    edit(10, 20)
    expect(screen.getByRole('button', { name: 'Cancel preparation' })).toBeTruthy()
    submit()
  }
  const committed = { ra: 10, dec: 20, size: 7, detector: shared ? 3 : 0 }
  expect(scene.fits.status).toBe('searching')
  expect(scene.fits.committed).toEqual(committed)
  expect(screen.queryByRole('button', { name: 'Clear image and results' })).toBeNull()
  const href = window.location.href
  const signal = searchCoordinates.mock.lastCall[4]
  click('Cancel operation')
  expect(signal.aborted).toBe(true)
  expect(scene.fits.status).toBe('idle')
  expect(scene.fits.images).toEqual([])
  expect(scene.fits.active).toBeNull()
  expect(scene.fits.preparing).toBe(false)
  expect(scene.fits.committed).toEqual(committed)
  expect(window.location.href).toBe(href)
  expect(copyButton(searchFooter()).disabled).toBe(false)
  click('Clear image and results')
  expect(scene.fits.committed).toBeNull()
  expect(window.location.pathname).toBe('/sky')
  expect(window.location.search).toBe('?foo=1')
  expect(window.location.hash).toBe('#frag')
  expect(window.history.state).toEqual({ retained: true })
  expect(copyButton(searchFooter()).disabled).toBe(true)
  await act(async () => pending.resolve(result(10, 20, [{ id: metadata.id }])))
  expect(scene.fits.status).toBe('idle')
  expect(scene.fits.committed).toBeNull()
  expect(window.location.search).toBe('?foo=1')
  expect(loadMetadata).not.toHaveBeenCalled()
})

it('disables sharing of an existing commit while a sky click is unresolved and enables its newly resolved coordinates', async () => {
  window.history.replaceState({}, '', '/?ra=1&dec=2')
  mount()
  await flush()
  openSearch()
  expect(copyButton(searchFooter()).disabled).toBe(false)
  const pending = deferred()
  searchImages.mockReturnValueOnce(pending.promise)
  click('sky click')
  expect(scene.fits.committed.ra).toBe(1)
  expect(copyButton(searchFooter()).disabled).toBe(true)
  await act(async () => pending.resolve(result(30, 40)))
  expect(copyButton(searchFooter()).disabled).toBe(false)
})

it('copies committed coordinates even when history writes fail', async () => {
  window.history.replaceState({}, '', '/?ra=bad&longitude=12#private')
  const writeText = vi.fn().mockResolvedValue()
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
  mount()
  vi.spyOn(window.history, 'replaceState').mockImplementation(() => { throw new Error('blocked') })
  edit(10, 20)
  submit()
  await flush()
  expect(copyButton(searchFooter()).disabled).toBe(false)
  fireEvent.click(copyButton(searchFooter()))
  await flush()
  expect(writeText).toHaveBeenCalledExactlyOnceWith(`${window.location.origin}/?ra=10&dec=20&size=7&detector=0`)
  expect(window.location.search).toBe('?ra=bad&longitude=12')
  expect(document.querySelector('.status-region').textContent).toContain(historyWarning)
})

it('hydrates a shared URL atomically and does not overwrite it with defaults, including StrictMode', async () => {
  window.history.replaceState({}, '', '/?ra=83.63&dec=-5.39&size=12&detector=3&foo=1#frag')
  const replace = vi.spyOn(window.history, 'replaceState')
  mount(<StrictMode><AppWorkspace /></StrictMode>)
  expect(input('ra').value).toBe('83.63')
  expect(input('dec').value).toBe('-5.39')
  expect(sizeInput().value).toBe('12')
  await flush()
  expect(searchCoordinates).toHaveBeenCalledExactlyOnceWith(83.63, -5.39, 12, 3, expect.any(AbortSignal))
  expect(replace).not.toHaveBeenCalled()
  expect(window.location.search).toBe('?ra=83.63&dec=-5.39&size=12&detector=3&foo=1')
  expect(window.location.hash).toBe('#frag')
})

it('opens the search panel for an invalid cold link without requests and lets Clear remove only malformed fields', async () => {
  window.history.replaceState({}, '', '/?ra=bad&foo=1#frag')
  mount()
  await flush()
  expect(searchCoordinates).not.toHaveBeenCalled()
  expect(searchImages).not.toHaveBeenCalled()
  expect(screen.getByText(invalid).getAttribute('role')).toBe('status')
  expect(document.querySelector('#context-search').getAttribute('aria-hidden')).toBe('false')
  expect(window.location.search).toBe('?ra=bad&foo=1')
  click('Clear image and results')
  await flush()
  expect(window.location.search).toBe('?foo=1')
  expect(window.location.hash).toBe('#frag')
  expect(screen.queryByText(invalid)).toBeNull()
  navigate('/?ra=bad&foo=1#frag')
  edit(83.63, -5.39)
  expect(screen.getByText(invalid)).toBeTruthy()
  expect(window.location.search).toBe('?ra=bad&foo=1')
  submit()
  await flush()
  expect(screen.queryByText(invalid)).toBeNull()
  expect(searchCoordinates).toHaveBeenCalledExactlyOnceWith(83.63, -5.39, 7, 0, expect.any(AbortSignal))
  expect(window.location.search).toBe('?foo=1&ra=83.63&dec=-5.39&size=7&detector=0')
  expect(window.location.hash).toBe('#frag')
})

it('keeps drafts out of the URL, commits coordinate submissions with any detector, and clears only supported fields', async () => {
  window.history.replaceState({}, '', '/?ra=1&dec=2&detector=3&foo=1#frag')
  mount()
  await flush()
  openSearch()
  edit(83.63, -5.39)
  fireEvent.change(sizeInput(), { target: { value: '12' } })
  expect(new URLSearchParams(window.location.search).get('ra')).toBe('1')
  submit()
  expect(scene.fits.committed).toEqual({ ra: 83.63, dec: -5.39, size: 12, detector: 0 })
  expect(searchCoordinates).toHaveBeenLastCalledWith(83.63, -5.39, 12, 0, expect.any(AbortSignal))
  expect(new URLSearchParams(window.location.search).get('detector')).toBe('0')
  await flush()
  click('Clear image and results')
  expect(window.location.search).toBe('?foo=1')
  expect(window.location.hash).toBe('#frag')
})

it('does not commit a sky click until the backend resolves coordinates', async () => {
  const pending = deferred()
  searchImages.mockReturnValueOnce(pending.promise)
  mount()
  click('sky click')
  expect(searchImages).toHaveBeenCalledTimes(1)
  expect(window.location.search).toBe('')
  expect(scene.fits.committed).toBeNull()
  expect(scene.fits.commitPending).toBe(true)
  await act(async () => pending.resolve(result(30, 40)))
  expect(scene.fits.committed).toEqual({ ra: 30, dec: 40, size: 7, detector: 0 })
  expect(window.location.search).toBe('?ra=30&dec=40&size=7&detector=0')
})

it('restores valid popstate entries, aborts stale searches, clears absent ones, and rejects invalid ones without feedback', async () => {
  mount()
  const replace = vi.spyOn(window.history, 'replaceState')
  const pending = deferred()
  searchCoordinates.mockReturnValueOnce(pending.promise)
  navigate('/?ra=10&dec=20&size=9&detector=4')
  expect(searchCoordinates).toHaveBeenLastCalledWith(10, 20, 9, 4, expect.any(AbortSignal))
  const signal = searchCoordinates.mock.lastCall[4]
  navigate('/?ra=30&dec=40&size=12&detector=2&foo=1#frag')
  await flush()
  expect(signal.aborted).toBe(true)
  expect(searchCoordinates).toHaveBeenCalledTimes(2)
  expect(searchCoordinates).toHaveBeenLastCalledWith(30, 40, 12, 2, expect.any(AbortSignal))
  expect(input('ra').value).toBe('30')
  expect(input('dec').value).toBe('40')
  expect(sizeInput().value).toBe('12')
  await act(async () => pending.resolve(result(10, 20, [{ id: 'stale' }])))
  expect(loadMetadata).not.toHaveBeenCalled()
  expect(scene.fits.committed).toEqual({ ra: 30, dec: 40, size: 12, detector: 2 })
  navigate('/?foo=1#frag')
  expect(scene.fits.committed).toBeNull()
  expect(scene.fits.status).toBe('idle')
  navigate('/?ra=bad&foo=1#frag')
  expect(screen.getByText(invalid)).toBeTruthy()
  expect(document.querySelector('#context-search').getAttribute('aria-hidden')).toBe('false')
  expect(searchCoordinates).toHaveBeenCalledTimes(2)
  expect(searchImages).not.toHaveBeenCalled()
  expect(window.location.search).toBe('?ra=bad&foo=1')
  expect(window.location.hash).toBe('#frag')
  expect(replace).not.toHaveBeenCalled()
  expect(screen.queryByRole('dialog')).toBeNull()
})

it('removes supported URL fields when the loaded inspector closes', async () => {
  window.history.replaceState({}, '', '/?ra=10&dec=20&size=7&detector=3&foo=1#frag')
  searchCoordinates.mockResolvedValueOnce(result(10, 20, [{ id: metadata.id }]))
  mount()
  await waitFor(() => expect(screen.getByRole('button', { name: 'Close inspector' })).toBeTruthy())
  click('Close inspector')
  expect(scene.fits.committed).toBeNull()
  expect(window.location.search).toBe('?foo=1')
  expect(window.location.hash).toBe('#frag')
})

it('reopens the warning panel for every invalid popstate even after the previous panel was manually closed', async () => {
  mount()
  const replace = vi.spyOn(window.history, 'replaceState')
  for (const malformed of ['ra=bad', 'dec=bad', 'ra=still-bad']) {
    navigate(`/?${malformed}&foo=1#frag`)
    expect(document.querySelector('#context-search').getAttribute('aria-hidden')).toBe('false')
    expect(screen.getByText(invalid).closest('[aria-hidden="true"]')).toBeNull()
    expect(window.location.search).toBe(`?${malformed}&foo=1`)
    expect(window.location.hash).toBe('#frag')
    click('Time')
    expect(document.querySelector('#context-search').getAttribute('aria-hidden')).toBe('true')
  }
  await flush()
  expect(searchCoordinates).not.toHaveBeenCalled()
  expect(searchImages).not.toHaveBeenCalled()
  expect(replace).not.toHaveBeenCalled()
})

it('keeps history warnings announced across delayed failed inspector Close attempts and restores normal dismissal after recovery', async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  window.history.replaceState({}, '', '/?ra=bad')
  mount()
  const announcement = () => document.querySelector('.status-region [role="status"]').textContent
  const surface = () => document.querySelector('.status-region .status-notice-surface')
  const replace = vi.spyOn(window.history, 'replaceState').mockImplementation(() => { throw new Error('blocked') })
  searchCoordinates.mockImplementation(async (ra, dec) => result(ra, dec, [{ id: metadata.id }]))
  for (let attempt = 0; attempt < 2; attempt++) {
    openSearch()
    edit(10 + attempt, 20)
    submit()
    await flush()
    expect(screen.getByRole('button', { name: 'Close inspector' })).toBeTruthy()
    expect(scene.fits.committed.ra).toBe(10 + attempt)
    await act(async () => { vi.advanceTimersByTime(4000) })
    expect(announcement()).toBe(historyWarning)
    expect(surface().getAttribute('data-visible')).toBe('true')
    click('Close inspector')
    expect(document.querySelector('#context-search').getAttribute('aria-hidden')).toBe('true')
    expect(scene.fits.committed).toBeNull()
    expect(announcement()).toBe(historyWarning)
    await act(async () => { vi.advanceTimersByTime(4000) })
    expect(announcement()).toBe(historyWarning)
  }
  expect(replace).toHaveBeenCalledTimes(4)
  replace.mockRestore()
  openSearch()
  edit(30, 40)
  submit()
  await flush()
  expect(window.location.search).toBe('?ra=30&dec=40&size=7&detector=0')
  expect(announcement()).toBe('Image loaded')
  expect(surface().getAttribute('data-visible')).toBe('true')
  await act(async () => { vi.advanceTimersByTime(4000) })
  expect(announcement()).toBe('')
  expect(surface().getAttribute('data-visible')).toBe('false')
})

it('shows history failures globally without discarding the search commit, including Close with the panel closed', async () => {
  mount()
  openSearch()
  vi.spyOn(window.history, 'replaceState').mockImplementation(() => { throw new Error('blocked') })
  edit(10, 20)
  searchCoordinates.mockResolvedValueOnce(result(10, 20, [{ id: metadata.id }]))
  submit()
  await waitFor(() => expect(screen.getByRole('button', { name: 'Close inspector' })).toBeTruthy())
  expect(scene.fits.committed).toEqual({ ra: 10, dec: 20, size: 7, detector: 0 })
  expect(document.querySelector('.status-region').textContent).toContain(historyWarning)
  await waitFor(() => expect(document.querySelector('#context-search').getAttribute('aria-hidden')).toBe('true'))
  click('Close inspector')
  expect(scene.fits.committed).toBeNull()
  expect(document.querySelector('.status-region').textContent).toContain(historyWarning)
})
