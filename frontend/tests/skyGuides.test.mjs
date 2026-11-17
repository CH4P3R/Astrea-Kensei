import { test } from 'node:test'
import assert from 'node:assert/strict'
import { constellationSegments, eclipticPoints, equatorialGrid, equatorialPoint, meanObliquity, sphericalArc } from '../src/three/core/skyGuideUtils.js'
import { equatorialFrameBasis, localSiderealDegrees } from '../src/three/core/coordinateUtils.js'

const RAD = Math.PI / 180
const near = (a, b, tolerance = 1e-10) => assert.ok(Math.abs(a - b) < tolerance, `${a} != ${b}`)
const nearVector = (actual, expected, tolerance) => actual.forEach((value, index) => near(value, expected[index], tolerance))
const dot = (a, b) => a.reduce((sum, value, index) => sum + value * b[index], 0)
const applyBasis = (axes, point) => point.map((_, row) => axes.reduce((sum, axis, column) => sum + axis[row] * point[column], 0))

test('celestial guides use the same right-handed RA/Dec axes as the sky', () => {
  nearVector(equatorialPoint(0, 0), [0, 0, -1])
  nearVector(equatorialPoint(90, 0), [-1, 0, 0])
  nearVector(equatorialPoint(270, 0), [1, 0, 0])
  nearVector(equatorialPoint(0, 90), [0, 1, 0])
  nearVector(equatorialPoint(-10, -30), equatorialPoint(350, -30))
})

test('constellation arcs cross the RA seam on the short side and stay on the sphere', () => {
  const points = sphericalArc([350, 0], [10, 0], 100)
  nearVector(points[0], equatorialPoint(350, 0, 100))
  nearVector(points.at(-1), equatorialPoint(10, 0, 100))
  for (const point of points) {
    near(Math.hypot(...point), 100)
    near(point[1], 0)
    assert.ok(point[2] < -98, 'The arc must pass RA 0h, not traverse the opposite hemisphere')
  }
  for (let index = 1; index < points.length; index += 1) {
    const angle = Math.acos(Math.max(-1, Math.min(1, dot(points[index - 1], points[index]) / 10000))) / RAD
    assert.ok(angle <= 0.500001)
  }
})

test('arc interpolation remains finite at poles, duplicate endpoints and antipodes', () => {
  for (const [from, to] of [[[0, 90], [180, 89]], [[32, -18], [32, -18]], [[0, 0], [180, 0]]]) {
    const points = sphericalArc(from, to, 100)
    for (const point of points) {
      assert.ok(point.every(Number.isFinite))
      near(Math.hypot(...point), 100)
    }
    nearVector(points[0], equatorialPoint(...from, 100))
    nearVector(points.at(-1), equatorialPoint(...to, 100))
  }
})

test('separate constellation paths never acquire connecting segments', () => {
  const features = [
    { geometry: { type: 'MultiLineString', coordinates: [[[350, 0], [10, 0]], [[30, 10], [30, 20]]] } },
    { geometry: { type: 'LineString', coordinates: [[180, -30], [180, -40]] } },
  ]
  const segments = constellationSegments(features)
  assert.equal(segments.length % 2, 0)
  for (let index = 0; index < segments.length; index += 2) {
    const [a, b] = [segments[index], segments[index + 1]]
    assert.ok(dot(a, b) >= Math.cos(0.500001 * RAD))
    const dec = Math.asin(a[1]) / RAD
    assert.ok(Math.abs(dec) < 1e-8 || (dec >= 10 - 1e-8 && dec <= 20 + 1e-8)
      || (dec >= -40 - 1e-8 && dec <= -30 + 1e-8))
  }
})

test('RA/Dec grid spans both hemispheres with a closed equator and hour labels', () => {
  const { meridians, parallels, equator, labels } = equatorialGrid(100)
  nearVector(equator[0], equator.at(-1))
  for (const point of [...meridians, ...parallels, ...equator]) near(Math.hypot(...point), 100)
  assert.ok(meridians.some((point) => point[1] === 100))
  assert.ok(meridians.some((point) => point[1] === -100))
  assert.deepEqual(labels.filter(({ axis }) => axis === 'ra').map(({ text }) => text),
    ['0h', '2h', '4h', '6h', '8h', '10h', '12h', '14h', '16h', '18h', '20h', '22h'])
  assert.ok(labels.some(({ text }) => text === '+75°'))
  assert.ok(labels.some(({ text }) => text === '−75°'))
})

// Independent reference vectors generated with ERFA (via the backend's pyerfa):
// eq = [cos(lon), sin(lon)*cos(erfa.obl80(jd,0)), sin(lon)*sin(eps)]
// x,y,z = erfa.pmat76(jd,0).T @ eq; scene = [-y,z,-x].
// Dates intentionally use the same UTC-as-TT approximation as the visual sky.
const eclipticReference = [
  ['2000-01-01T12:00:00Z', 45, [-0.6487577877061355, 0.2812709243605549, -0.7071067811865476]],
  ['2000-01-01T12:00:00Z', 90, [-0.9174820620691818, 0.3977771559319137, 0]],
  ['2026-11-16T00:00:00Z', 0, [0.006009795154426441, -0.0026111643310236412, -0.9999785318610785]],
  ['2026-11-16T00:00:00Z', 90, [-0.9174866323362723, 0.39771263960042935, -0.006552540446636122]],
  ['2100-01-01T00:00:00Z', 45, [-0.632813634602371, 0.27417106515257034, -0.7241388892294365]],
  ['2100-01-01T00:00:00Z', 270, [0.9172995932639674, -0.3974504473880121, 0.024384381657713002]],
]

test('ecliptic mean-of-date geometry agrees with independent ERFA reference vectors', () => {
  for (const [date, longitude, expected] of eclipticReference) {
    const points = eclipticPoints(Date.parse(date), 1, 360)
    nearVector(points[longitude], expected, 1e-10)
    nearVector(points[0], points.at(-1))
    for (const point of points) near(Math.hypot(...point), 1)
  }
  near(meanObliquity(Date.UTC(2000, 0, 1, 12)) / RAD, 23.43929111111111)
})

test('ecliptic orientation follows local latitude and longitude without double precession', () => {
  const timestamp = Date.UTC(2026, 10, 16, 12)
  const sidereal = localSiderealDegrees(timestamp, 0)
  const wrapLongitude = (value) => ((value + 180) % 360 + 360) % 360 - 180
  const first = eclipticPoints(timestamp)[0] // Mean-of-date vernal equinox: RA=0, Dec=0.
  const atMeridian = { latitude: 0, longitude: wrapLongitude(-sidereal) }
  const west = { latitude: 0, longitude: wrapLongitude(90 - sidereal) }
  const northPole = { latitude: 90, longitude: atMeridian.longitude }
  const southPole = { latitude: -90, longitude: atMeridian.longitude }
  nearVector(applyBasis(equatorialFrameBasis(atMeridian, timestamp), first), [0, 1, 0])
  nearVector(applyBasis(equatorialFrameBasis(west, timestamp), first), [-1, 0, 0])
  nearVector(applyBasis(equatorialFrameBasis(northPole, timestamp), first), [0, 0, 1])
  nearVector(applyBasis(equatorialFrameBasis(southPole, timestamp), first), [0, 0, -1])
})
