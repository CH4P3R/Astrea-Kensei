import test from 'node:test'
import assert from 'node:assert/strict'
import { pixelFromUv, readPixelInfo } from '../src/three/core/pixelInfoUtils.js'
import { normalizePixels } from '../src/three/core/imageDataUtils.js'

const grid = { width: 3, height: 2, array_order: 'C', pixel_origin: 'lower-left', unit: 'MJy/sr' }
const uv = (x, y) => ({ x, y })
const activeImage = (raw, image = grid) => ({
  metadata: { id: 'cutout-A', image },
  pixels: { raw, ...normalizePixels(raw, { low: 0, high: 10 }) },
})

test('rectangular FITS texture centers select C-order samples without a vertical flip or half-pixel shift', () => {
  const expected = [
    [uv(1 / 6, 1 / 4), { index: 0, column: 0, row: 0, x: 1, y: 1 }],
    [uv(3 / 6, 1 / 4), { index: 1, column: 1, row: 0, x: 2, y: 1 }],
    [uv(5 / 6, 1 / 4), { index: 2, column: 2, row: 0, x: 3, y: 1 }],
    [uv(1 / 6, 3 / 4), { index: 3, column: 0, row: 1, x: 1, y: 2 }],
    [uv(3 / 6, 3 / 4), { index: 4, column: 1, row: 1, x: 2, y: 2 }],
    [uv(5 / 6, 3 / 4), { index: 5, column: 2, row: 1, x: 3, y: 2 }],
  ]
  for (const [point, pixel] of expected) assert.deepEqual(pixelFromUv(point, grid), pixel)
  assert.equal(pixelFromUv(uv(1 / 3 - 1e-9, 0.25), grid).x, 1)
  assert.equal(pixelFromUv(uv(1 / 3, 0.25), grid).x, 2)
  assert.equal(pixelFromUv(uv(0.5, 0.5 - 1e-9), grid).y, 1)
  assert.equal(pixelFromUv(uv(0.5, 0.5), grid).y, 2)
})

test('outer UV edges match clamped texture sampling but off-image or invalid input is rejected', () => {
  assert.equal(pixelFromUv(uv(0, 0), grid).index, 0)
  assert.equal(pixelFromUv(uv(1, 0), grid).index, 2)
  assert.equal(pixelFromUv(uv(0, 1), grid).index, 3)
  assert.equal(pixelFromUv(uv(1, 1), grid).index, 5)
  assert.equal(pixelFromUv(uv(-1e-9, 1 + 1e-9), grid).index, 3)
  assert.deepEqual(pixelFromUv(uv(1, 1), { width: 1, height: 1 }), { index: 0, column: 0, row: 0, x: 1, y: 1 })
  for (const point of [undefined, null, {}, uv(NaN, 0), uv(0, Infinity), uv('0.5', 0), uv(-0.001, 0.5), uv(1.001, 0.5), uv(0.5, -0.001), uv(0.5, 1.001)]) {
    assert.equal(pixelFromUv(point, grid), null)
  }
  for (const image of [undefined, {}, { width: 0, height: 2 }, { width: 3, height: -1 }, { width: 2.5, height: 2 },
    { width: Number.MAX_SAFE_INTEGER, height: 2 }, { ...grid, array_order: 'F' }, { ...grid, pixel_origin: 'upper-left' }]) {
    assert.equal(pixelFromUv(uv(0.5, 0.5), image), null)
  }
  assert.equal(readPixelInfo(null, uv(0, 0)), null)
})

test('hover reports original numeric samples and units without substituting normalized or clipped values', () => {
  const raw = new Float64Array([-12.25, 0, 0.1234567890123, 1000, NaN, Infinity])
  const active = activeImage(raw)
  const bottomLeft = readPixelInfo(active, uv(0.1, 0.2))
  assert.deepEqual(bottomLeft, {
    imageId: 'cutout-A', x: 1, y: 1, index: 0,
    original: { value: -12.25, status: 'finite', unit: 'MJy/sr', dimensionless: false },
    processed: null,
    display: { normalizedValue: 0, status: 'visible' },
  })
  const bright = readPixelInfo(active, uv(0.1, 0.8))
  assert.equal(bright.original.value, 1000)
  assert.equal(bright.display.normalizedValue, 1)
  assert.equal(readPixelInfo(active, uv(0.9, 0.2)).original.value, 0.1234567890123)
  assert.equal(readPixelInfo(active, uv(0.5, 0.2)).original.value, 0)
  assert.equal('raDeg' in bottomLeft, false)
  assert.equal('decDeg' in bottomLeft, false)
  assert.deepEqual([...raw], [-12.25, 0, 0.1234567890123, 1000, NaN, Infinity])
})

test('nonfinite samples and processed masks are explicit without inventing a rejection reason', () => {
  const active = activeImage(new Float32Array([1, 2, NaN, Infinity, -Infinity, 6]))
  for (const point of [uv(0.9, 0.2), uv(0.1, 0.8), uv(0.5, 0.8)]) {
    const info = readPixelInfo(active, point)
    assert.equal(info.original.value, null)
    assert.equal(info.original.status, 'nonfinite')
    assert.deepEqual(info.display, { normalizedValue: null, status: 'masked-or-invalid' })
  }
  const processedRaw = new Float32Array([NaN, 2, NaN, NaN, NaN, 6])
  const info = readPixelInfo(active, uv(0.1, 0.2), {
    displayPixels: { raw: processedRaw, ...normalizePixels(processedRaw, { low: 0, high: 10 }) },
    appliedProcessing: { mask_flags: true, subtract_zodi: true, signal_to_noise: true },
  })
  assert.equal(info.original.value, 1)
  assert.equal(info.processed.value, null)
  assert.equal(info.processed.status, 'nonfinite')
  assert.deepEqual(info.display, { normalizedValue: null, status: 'masked-or-invalid' })
  assert.equal('flag' in info, false)
  assert.equal('uncertainty' in info, false)
})

test('processed measurements come from their actual array and signal-to-noise is explicitly dimensionless', () => {
  const active = activeImage(new Float32Array([10, 20, 30, 40, 50, 60]))
  const raw = new Float32Array([-3.5, 2, 3, 4, 5, 6])
  const displayPixels = { raw, ...normalizePixels(raw, { low: 0, high: 4 }) }
  const corrected = readPixelInfo(active, uv(0.1, 0.2), { displayPixels, appliedProcessing: { subtract_zodi: true } })
  assert.equal(corrected.original.value, 10)
  assert.deepEqual(corrected.processed, { value: -3.5, status: 'finite', unit: 'MJy/sr', dimensionless: false })
  assert.equal(corrected.display.normalizedValue, 0)
  const snr = readPixelInfo(active, uv(0.1, 0.2), { displayPixels, appliedProcessing: { signal_to_noise: true } })
  assert.deepEqual(snr.processed, { value: -3.5, status: 'finite', unit: null, dimensionless: true })
  assert.equal(snr.original.unit, 'MJy/sr')
  assert.equal(readPixelInfo(active, uv(0.1, 0.2), { displayPixels, appliedProcessing: {} }).processed, null,
    'requested but unapplied processing must not be reported as applied')
})

test('missing arrays or units remain unavailable rather than fabricated measurements', () => {
  const active = activeImage(new Float32Array([1, 2, 3, 4, 5, 6]), { ...grid, unit: '  ' })
  const options = { displayPixels: { values: new Float32Array([0, 0.2, 0.4, 0.6, 0.8, 1]) }, appliedProcessing: { mask_flags: true } }
  const info = readPixelInfo(active, uv(0.5, 0.2), options)
  assert.deepEqual(info.original, { value: 2, status: 'finite', unit: null, dimensionless: false })
  assert.deepEqual(info.processed, { value: null, status: 'unavailable', unit: null, dimensionless: false })
  assert.equal(info.display.status, 'visible')
  assert.equal(readPixelInfo(active, uv(0.5, 0.2), { appliedProcessing: { subtract_zodi: true } }).processed.status, 'unavailable')
  const broken = { ...active, pixels: { raw: new Float32Array([99]) } }
  const missing = readPixelInfo(broken, uv(0.1, 0.2))
  assert.equal(missing.original.status, 'unavailable')
  assert.deepEqual(missing.display, { normalizedValue: null, status: 'unavailable' })
})
