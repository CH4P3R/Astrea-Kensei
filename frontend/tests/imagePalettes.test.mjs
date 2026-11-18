import test from 'node:test'
import assert from 'node:assert/strict'
import { IMAGE_PALETTES, imagePaletteGradient, imagePaletteIndex, sampleImagePalette } from '../src/config/appearance.js'

const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-10, `${actual} != ${expected}`)
const luminance = ([red, green, blue]) => 0.2126 * red + 0.7152 * green + 0.0722 * blue

test('legacy grayscale and false color preserve their original intensity mappings', () => {
  assert.equal(imagePaletteIndex('gray'), 0)
  assert.equal(imagePaletteIndex('color'), 1)
  for (const value of [0, 0.1, 0.5, 0.8, 1]) assert.deepEqual(sampleImagePalette('gray', value), [value, value, value])
  // Regression values from the original FITS shader, before extending its maps.
  for (const [value, expected] of [
    [0, [0.015, 0.02, 0.08]],
    [0.5, [0.42777777777777776, 0.812962962962963, 0.7925925925925926]],
    [0.75, [0.9407407407407408, 0.7666666666666666, 0.4759259259259259]],
    [1, [1, 1, 1]],
  ]) sampleImagePalette('color', value).forEach((channel, index) => near(channel, expected[index]))
})

test('new sequential ramps stay bounded and brighten monotonically without becoming the same map', () => {
  const ids = ['amber', 'ice', 'violetGold']
  assert.equal(new Set(IMAGE_PALETTES.map(({ id }) => id)).size, IMAGE_PALETTES.length)
  assert.equal(new Set(ids.map((id) => sampleImagePalette(id, 0.5).join(','))).size, ids.length)
  for (const id of ids) {
    let previous = -1
    for (let index = 0; index <= 256; index += 1) {
      const color = sampleImagePalette(id, index / 256)
      assert.ok(color.every((channel) => Number.isFinite(channel) && channel >= 0 && channel <= 1))
      const next = luminance(color)
      assert.ok(next >= previous - 1e-12, `${id} reverses brightness at ${index / 256}`)
      previous = next
    }
    assert.ok(luminance(sampleImagePalette(id, 0)) < 0.02)
    assert.ok(luminance(sampleImagePalette(id, 1)) > 0.85)
  }
  assert.ok(sampleImagePalette('amber', 0.5)[0] > sampleImagePalette('amber', 0.5)[2])
  assert.ok(sampleImagePalette('ice', 0.5)[2] > sampleImagePalette('ice', 0.5)[0])
})

test('inverse grayscale reverses intensity and unknown settings safely use the original default', () => {
  for (const value of [0, 0.2, 0.5, 0.9, 1]) {
    for (const channel of sampleImagePalette('inverse', value)) near(channel, 1 - value)
  }
  for (const id of [undefined, null, '', 'unsupported']) {
    assert.equal(imagePaletteIndex(id), 0)
    assert.deepEqual(sampleImagePalette(id, 0.3), [0.3, 0.3, 0.3])
    assert.equal(imagePaletteGradient(id), imagePaletteGradient('gray'))
  }
})

test('legends use the displayed sRGB transfer, including the inverted endpoints', () => {
  const gray = imagePaletteGradient('gray')
  assert.ok(gray.includes('rgb(0 0 0) 0%'))
  assert.ok(gray.includes('rgb(188 188 188) 50%'), 'linear 0.5 must match the shader output converted to sRGB')
  assert.ok(gray.includes('rgb(255 255 255) 100%'))
  const inverse = imagePaletteGradient('inverse')
  assert.ok(inverse.includes('rgb(255 255 255) 0%'))
  assert.ok(inverse.includes('rgb(0 0 0) 100%'))
  assert.equal(new Set(IMAGE_PALETTES.map(({ id }) => imagePaletteGradient(id))).size, IMAGE_PALETTES.length)
})
