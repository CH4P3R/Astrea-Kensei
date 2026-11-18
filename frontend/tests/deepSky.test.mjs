import test from 'node:test'
import assert from 'node:assert/strict'
import { Vector3 } from 'three'
import { DEEP_SKY_OBJECTS } from '../src/data/deepSky/catalog.js'
import { deepSkyDetailOpacity, deepSkyPatch } from '../src/three/core/deepSkyUtils.js'

const DEG = 180 / Math.PI
const near = (actual, expected, tolerance = 1e-9) => {
  assert.ok(Math.abs(actual - expected) < tolerance, `${actual} != ${expected}`)
}
const signedAngle = (degrees) => ((degrees + 540) % 360) - 180

// Invert the documented scene convention independently of the production
// equatorialPoint helper: north is +Y, RA 0h is -Z, RA 6h is -X.
const skyCoordinates = (point) => ({
  ra: (Math.atan2(-point.x, -point.z) * DEG + 360) % 360,
  dec: Math.asin(point.y / point.length()) * DEG,
})
const vertexAtUv = (patch, u, v) => {
  for (let index = 0; index < patch.uvs.length; index += 2) {
    if (patch.uvs[index] === u && patch.uvs[index + 1] === v) {
      return new Vector3().fromArray(patch.positions, index / 2 * 3)
    }
  }
  assert.fail(`Missing texture landmark (${u}, ${v})`)
}

// SIMBAD sexagesimal coordinates as listed in data/deepSky/SOURCE.md, rather
// than decimal literals copied from catalog.js. Signs are separate from DMS.
const referenceCenters = [
  ['orion', [5, 35, 16.8], -1, [5, 23, 15]],
  ['lagoon', [18, 3, 37], -1, [24, 23, 12]],
  ['carina', [10, 45, 2.23], -1, [59, 41, 59.8]],
  ['north-america', [20, 58, 47], 1, [44, 19, 48]],
  ['pleiades', [3, 46, 24.2], 1, [24, 6, 50]],
  ['omega-centauri', [13, 26, 47.28], -1, [47, 28, 46.1]],
]

test('catalog centers retain the primary-source J2000 coordinates and angular units', () => {
  assert.deepEqual(DEEP_SKY_OBJECTS.map(({ id }) => id).sort(), referenceCenters.map(([id]) => id).sort())
  for (const [id, [hours, minutes, seconds], sign, [degrees, arcminutes, arcseconds]] of referenceCenters) {
    const object = DEEP_SKY_OBJECTS.find((entry) => entry.id === id)
    near(object.raDeg, (hours * 3600 + minutes * 60 + seconds) / 240)
    near(object.decDeg, sign * (degrees * 3600 + arcminutes * 60 + arcseconds) / 3600)
    assert.equal(object.coordinateFrame, 'ICRS')
    assert.equal(object.coordinateEpoch, 'J2000')
    assert.equal(object.positionAngleDeg, null, 'an unmeasured position angle must not become a catalog fact')
    assert.equal(object.displayFieldDeg[0], object.displayFieldDeg[1], 'square art must not be stretched to an object ellipse')
    if (object.opticalExtentArcmin) {
      const majorDegrees = Math.max(...object.opticalExtentArcmin) / 60
      const occupiedFraction = majorDegrees / object.displayFieldDeg[0]
      assert.ok(occupiedFraction > 0.65 && occupiedFraction < 0.75, `${id}: retain the documented art padding and arcminute-to-degree scale`)
    }
  }
  assert.equal(DEEP_SKY_OBJECTS.find(({ id }) => id === 'carina').opticalExtentArcmin, null)
  assert.equal(DEEP_SKY_OBJECTS.find(({ id }) => id === 'north-america').opticalExtentArcmin, null)
})

test('each catalog patch is centered on its sky position and stays on the requested sphere', () => {
  for (const object of DEEP_SKY_OBJECTS) {
    for (const radius of [1, 100.2]) {
      const patch = deepSkyPatch(object, radius)
      const center = skyCoordinates(vertexAtUv(patch, 0.5, 0.5))
      near(signedAngle(center.ra - object.raDeg), 0)
      near(center.dec, object.decDeg)
      for (let index = 0; index < patch.positions.length; index += 3) {
        const point = new Vector3().fromArray(patch.positions, index)
        assert.ok(point.toArray().every(Number.isFinite))
        near(point.length(), radius)
      }
    }
  }
})

test('field width and height are full angular spans through the edge midpoints', () => {
  const fields = [
    ...DEEP_SKY_OBJECTS,
    { raDeg: 359.8, decDeg: -53, displayFieldDeg: [12, 4] },
    { raDeg: 184, decDeg: 89.9, displayFieldDeg: [5, 3] },
  ]
  for (const object of fields) {
    const patch = deepSkyPatch(object, 100)
    const center = vertexAtUv(patch, 0.5, 0.5)
    const left = vertexAtUv(patch, 0, 0.5)
    const right = vertexAtUv(patch, 1, 0.5)
    const bottom = vertexAtUv(patch, 0.5, 0)
    const top = vertexAtUv(patch, 0.5, 1)
    near(left.angleTo(right) * DEG, object.displayFieldDeg[0], 1e-8)
    near(bottom.angleTo(top) * DEG, object.displayFieldDeg[1], 1e-8)
    for (const [a, b, angularSize] of [[left, right, object.displayFieldDeg[0]], [bottom, top, object.displayFieldDeg[1]]]) {
      near(center.angleTo(a) * DEG, angularSize / 2, 1e-8)
      near(center.angleTo(b) * DEG, angularSize / 2, 1e-8)
      // Opposite edges must bracket the catalog center, rather than shift it.
      near(a.clone().add(b).normalize().distanceTo(center.clone().normalize()), 0)
    }
  }
})

test('north-up textures put increasing RA on the left across 0h and in both hemispheres', () => {
  const fields = [
    { raDeg: 0.02, decDeg: 0, displayFieldDeg: [2, 2] },
    { raDeg: 359.98, decDeg: 55, displayFieldDeg: [2, 2] },
    { raDeg: 0.02, decDeg: -55, displayFieldDeg: [2, 2] },
    { raDeg: 144, decDeg: 89.7, displayFieldDeg: [0.2, 0.2] },
    { raDeg: 275, decDeg: -89.7, displayFieldDeg: [0.2, 0.2] },
  ]
  for (const object of fields) {
    const patch = deepSkyPatch(object)
    const left = skyCoordinates(vertexAtUv(patch, 0, 0.5))
    const right = skyCoordinates(vertexAtUv(patch, 1, 0.5))
    const bottom = skyCoordinates(vertexAtUv(patch, 0.5, 0))
    const top = skyCoordinates(vertexAtUv(patch, 0.5, 1))
    assert.ok(signedAngle(left.ra - object.raDeg) > 0, 'texture left must be celestial east')
    assert.ok(signedAngle(right.ra - object.raDeg) < 0, 'texture right must be celestial west')
    assert.ok(top.dec > object.decDeg, 'texture top must be celestial north')
    assert.ok(bottom.dec < object.decDeg, 'texture bottom must be celestial south')
    near(signedAngle(top.ra - object.raDeg), 0)
    near(signedAngle(bottom.ra - object.raDeg), 0)
    near(top.dec - bottom.dec, object.displayFieldDeg[1], 1e-8)
  }
})

test('every triangle faces the observer inside the sphere, including patches crossing the pole', () => {
  const fields = [...DEEP_SKY_OBJECTS, { raDeg: 0, decDeg: 89.99, displayFieldDeg: [3, 3] }]
  for (const object of fields) {
    const patch = deepSkyPatch(object, 100)
    for (let index = 0; index < patch.indices.length; index += 3) {
      const [a, b, c] = patch.indices.slice(index, index + 3)
        .map((vertex) => new Vector3().fromArray(patch.positions, vertex * 3))
      const normal = b.clone().sub(a).cross(c.clone().sub(a))
      const triangleCenter = a.clone().add(b).add(c).divideScalar(3)
      assert.ok(normal.length() > 0, 'no degenerate triangles')
      assert.ok(normal.dot(triangleCenter) < 0, 'front-face winding must point inward, toward the camera')
    }
  }
})

test('detail opacity hides subpixel objects and excessive enlargement with bounded smooth transitions', () => {
  for (const pixels of [0, 0.25, 0.9, 1.5, 2, 900, 1500, 100000]) {
    assert.equal(deepSkyDetailOpacity(pixels), 0)
  }
  for (const pixels of [10, 25, 120, 420]) assert.equal(deepSkyDetailOpacity(pixels), 1)
  const small = [2, 3, 5, 7, 9, 10].map(deepSkyDetailOpacity)
  const large = [420, 500, 650, 800, 899, 900].map(deepSkyDetailOpacity)
  for (let index = 1; index < small.length; index += 1) assert.ok(small[index] > small[index - 1])
  for (let index = 1; index < large.length; index += 1) assert.ok(large[index] < large[index - 1])
  for (let pixels = 0; pixels <= 1000; pixels += 1) {
    const opacity = deepSkyDetailOpacity(pixels)
    assert.ok(Number.isFinite(opacity) && opacity >= 0 && opacity <= 1)
  }
  for (const edge of [2, 10, 420, 900]) {
    assert.ok(Math.abs(deepSkyDetailOpacity(edge + 0.001) - deepSkyDetailOpacity(edge - 0.001)) < 1e-6,
      'crossing a visibility threshold must not pop')
  }
})
