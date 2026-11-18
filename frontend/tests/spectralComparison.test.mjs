import test from 'node:test'
import assert from 'node:assert/strict'
import { createSpectralLoader } from '../src/services/spectralComparison.js'
import { loadSpectralSample } from '../src/services/images.js'

const target = { ra_deg: 269.452076, dec_deg: 4.693365 }
const sample = (id, point = target, wavelength = 1.1) => ({ image_id: id,
  target: { ...point, frame: 'ICRS' }, status: 'available', reason: null,
  sample: { pixel_x: 2, pixel_y: 3, detector_x: 500, detector_y: 1500, wavelength_um: wavelength, bandwidth_um: 0.025 },
  calibration: { source_url: 'https://irsa.ipac.caltech.edu/calibration.fits', method: 'CWAVE/CBAND' },
})
const flush = () => new Promise((resolve) => setImmediate(resolve))
const controlled = (t) => {
  const calls = []
  const loader = createSpectralLoader((id, point, signal) => new Promise((resolve, reject) => {
    calls.push({ id, point, signal, resolve, reject })
  }))
  t.after(() => loader.dispose())
  return { loader, calls }
}

test('spectral requests use the explicit fixed sky position, not observer time or detector bands', async (t) => {
  let captured
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    captured = { url, options }
    return { ok: true, json: async () => sample('a') }
  })
  const signal = new AbortController().signal
  await loadSpectralSample('a', target, signal)
  const url = new URL(captured.url, 'https://example.test')
  assert.equal(url.pathname, '/api/v1/images/a/spectral')
  assert.deepEqual([...url.searchParams.keys()], ['ra_deg', 'dec_deg'])
  assert.equal(Number(url.searchParams.get('ra_deg')), target.ra_deg)
  assert.equal(Number(url.searchParams.get('dec_deg')), target.dec_deg)
  assert.equal(captured.options.signal, signal)
})

test('only three calibrations run at once and existing frames are not requested again', async (t) => {
  const { loader, calls } = controlled(t)
  loader.setImages(['a', 'b', 'c', 'd'], target)
  await flush()
  assert.deepEqual(calls.map(({ id }) => id), ['a', 'b', 'c'])
  assert.equal(loader.getSnapshot().d.status, 'queued')
  loader.setImages(['a', 'b', 'c', 'd'], { ...target })
  await flush()
  assert.equal(calls.length, 3)
  calls[1].resolve(sample('b', target, 1.4))
  await flush()
  assert.deepEqual(calls.map(({ id }) => id), ['a', 'b', 'c', 'd'])
  assert.equal(loader.getSnapshot().b.result.sample.wavelength_um, 1.4)
  loader.setImages(['a', 'b', 'c', 'd'], { ...target })
  await flush()
  assert.equal(calls.length, 4)
})

test('removing a frame cancels its task without restarting retained requests and ignores its late response', async (t) => {
  const { loader, calls } = controlled(t)
  loader.setImages(['a', 'b', 'c', 'd'], target)
  await flush()
  loader.setImages(['a', 'c', 'd'], target)
  await flush()
  assert.equal(calls[1].signal.aborted, true)
  assert.equal(calls[0].signal.aborted, false)
  assert.equal(calls[2].signal.aborted, false)
  assert.deepEqual(calls.map(({ id }) => id), ['a', 'b', 'c', 'd'])
  calls[1].resolve(sample('b'))
  await flush()
  assert.equal(loader.getSnapshot().b, undefined)
  calls[0].resolve(sample('a'))
  await flush()
  assert.equal(loader.getSnapshot().a.status, 'complete')
})

test('a changed sky point invalidates every sample and ignores results from the prior point', async (t) => {
  const { loader, calls } = controlled(t)
  loader.setImages(['a'], target)
  await flush()
  const second = { ...target, ra_deg: 15 }
  loader.setImages(['a'], second)
  await flush()
  assert.equal(calls[0].signal.aborted, true)
  assert.deepEqual(calls[1].point, second)
  calls[0].resolve(sample('a'))
  await flush()
  assert.equal(loader.getSnapshot().a.status, 'loading')
  calls[1].resolve(sample('a', second, 2.1))
  await flush()
  assert.equal(loader.getSnapshot().a.result.sample.wavelength_um, 2.1)
})

test('missing calibration stays unavailable; mismatched identity or invalid measurements are errors with manual retry', async (t) => {
  const { loader, calls } = controlled(t)
  loader.setImages(['a', 'b', 'c'], target)
  await flush()
  calls[0].resolve({ ...sample('a'), status: 'unavailable', reason: 'outside_image', sample: null, calibration: null })
  calls[1].resolve(sample('other'))
  calls[2].resolve({ ...sample('c'), sample: { ...sample('c').sample, bandwidth_um: -1 } })
  await flush()
  assert.equal(loader.getSnapshot().a.result.status, 'unavailable')
  assert.equal(loader.getSnapshot().a.result.sample, null)
  assert.equal(loader.getSnapshot().b.status, 'error')
  assert.equal(loader.getSnapshot().c.status, 'error')
  loader.retry('b')
  await flush()
  assert.equal(calls.length, 4)
  calls[3].resolve(sample('b'))
  await flush()
  assert.equal(loader.getSnapshot().b.status, 'complete')
})

test('invalid targets cause no network request and disposal cancels outstanding work', async (t) => {
  const { loader, calls } = controlled(t)
  for (const point of [undefined, {}, { ra_deg: 360, dec_deg: 0 }, { ra_deg: 0, dec_deg: 91 }]) loader.setImages(['a'], point)
  await flush()
  assert.equal(calls.length, 0)
  loader.setImages(['a'], target)
  await flush()
  loader.dispose()
  assert.equal(calls[0].signal.aborted, true)
  calls[0].resolve(sample('a'))
  await flush()
  assert.deepEqual(loader.getSnapshot(), {})
})
