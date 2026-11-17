import test from 'node:test'
import assert from 'node:assert/strict'
import { loadSolarSystem } from '../src/services/solarSystem.js'
import { observerContext } from '../src/services/images.js'
import { moonLightInView, prepareSolarSnapshot, sampleSolarBody, solarSnapshotIsCurrent } from '../src/three/core/solarSystemUtils.js'

const snapshot = (mode = 'live') => {
  const times = mode === 'live' ? [1000, 11000] : [1000]
  return {
    coordinate_frame: 'AltAz', refraction: false, mode, sample_times_ms: times,
    bodies: ['sun', 'moon'].map((id) => ({
      id,
      directions: [[0, 0, -1], [1, 0, 0]].slice(0, times.length),
      angular_radius_deg: [0.25, 0.27].slice(0, times.length),
      distance_km: times.map(() => id === 'sun' ? 149600000 : 384400),
      illumination: times.map(() => id === 'sun' ? 1 : 0.5),
      ...(id === 'moon' ? { light_directions: [[1, 0, 0], [0, 1, 0]].slice(0, times.length) } : {}),
    })),
  }
}
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-12, `${actual} != ${expected}`)
const target = () => ({ direction: [0, 0, 0], lightDirection: [0, 0, 0] })

test('solar snapshots require both bodies and complete finite airless local samples', () => {
  const valid = snapshot()
  assert.equal(prepareSolarSnapshot(valid), valid)
  const changes = [
    (value) => { value.bodies.pop() },
    (value) => { value.bodies[1].id = 'sun' },
    (value) => { value.bodies[1].id = 'mars' },
    (value) => { value.bodies[0] = null },
    (value) => { value.refraction = true },
    (value) => { value.coordinate_frame = 'ICRS' },
    (value) => { value.sample_times_ms[1] = value.sample_times_ms[0] },
    (value) => { value.sample_times_ms[0] = NaN },
    (value) => { value.bodies[0].directions.pop() },
    (value) => { value.bodies[0].directions[0] = [0, 0, 0] },
    (value) => { value.bodies[0].directions[0][0] = NaN },
    (value) => { value.bodies[0].angular_radius_deg[0] = Infinity },
    (value) => { value.bodies[1].distance_km[0] = 0 },
    (value) => { value.bodies[1].illumination[0] = 1.1 },
    (value) => { delete value.bodies[1].light_directions },
    (value) => { value.bodies[1].light_directions[0] = [1, NaN, 0] },
  ]
  for (const change of changes) {
    const invalid = snapshot()
    change(invalid)
    assert.throws(() => prepareSolarSnapshot(invalid), { key: 'sky.solar.invalid' })
  }
})

test('live ephemerides have bounded coverage while a paused sky remains fixed', () => {
  const live = prepareSolarSnapshot(snapshot())
  const paused = prepareSolarSnapshot(snapshot('paused'))
  assert.equal(solarSnapshotIsCurrent(live, 999), false)
  assert.equal(solarSnapshotIsCurrent(live, 1000), true)
  assert.equal(solarSnapshotIsCurrent(live, 11000), true)
  assert.equal(solarSnapshotIsCurrent(live, 11001), false)
  assert.equal(solarSnapshotIsCurrent(paused, 900000), true)
  assert.equal(solarSnapshotIsCurrent(paused, NaN), false)
  const point = sampleSolarBody(paused.bodies[1], paused.sample_times_ms, 900000, target())
  assert.deepEqual(point.direction, [0, 0, -1])
  near(point.angularRadius, 0.25)
})

test('position and sunlight interpolation preserve unit directions and angular size', () => {
  const data = snapshot()
  const body = data.bodies[1]
  const output = target()
  assert.equal(sampleSolarBody(body, data.sample_times_ms, 6000, output), output)
  near(Math.hypot(...output.direction), 1)
  near(Math.hypot(...output.lightDirection), 1)
  near(output.direction[0], Math.SQRT1_2)
  near(output.direction[2], -Math.SQRT1_2)
  near(output.lightDirection[0], Math.SQRT1_2)
  near(output.lightDirection[1], Math.SQRT1_2)
  near(output.angularRadius, 0.26)
  near(output.illumination, 0.5)
  sampleSolarBody(body, data.sample_times_ms, 11000, output)
  assert.deepEqual(output.direction, [1, 0, 0])
})

test('full, new and quarter Moon lighting has the correct observer-facing sign', () => {
  const moon = [0, 0, -1]
  const out = [0, 0, 0]
  moonLightInView(moon, [0, 0, 1], [1, 0, 0], [0, 1, 0], out)
  near(out[2], 1) // Sunlight faces the observer: full Moon.
  moonLightInView(moon, [0, 0, -1], [1, 0, 0], [0, 1, 0], out)
  near(out[2], -1) // Sunlight faces away: new Moon.
  moonLightInView(moon, [1, 0, 0], [1, 0, 0], [0, 1, 0], out)
  near(out[0], 1)
  near(out[2], 0)
  moonLightInView(moon, [1, 0, 0], [0, 1, 0], [-1, 0, 0], out)
  near(out[0], 0)
  near(out[1], -1) // Rotating the camera rotates the illuminated limb.
  near(out[2], 0) // It must not change the phase.
})

test('camera heading never alters lunar phase and degenerate projections remain finite', () => {
  const moon = [1 / Math.sqrt(3), 1 / Math.sqrt(3), -1 / Math.sqrt(3)]
  for (const [right, up] of [
    [[1, 0, 0], [0, 1, 0]], [[0, 1, 0], [-1, 0, 0]], [[0, 0, 1], [0, 1, 0]],
  ]) {
    const lighting = moonLightInView(moon, [0, 1, 0], right, up, [0, 0, 0])
    near(Math.hypot(...lighting), 1)
    near(lighting[2], -1 / Math.sqrt(3))
  }
  const edgeOn = moonLightInView([1, 0, 0], [0, 0, 1], [1, 0, 0], [0, 1, 0], [0, 0, 0])
  assert.ok(edgeOn.every(Number.isFinite))
  near(Math.hypot(...edgeOn), 1)
  near(edgeOn[2], 0)
})

test('an off-center lunar bright limb follows its projected sunlight and camera roll', () => {
  const moon = [0.6, 0, -0.8]
  // Tangent sunlight projects at 45 degrees in the camera's XY plane.
  const sunlight = [0.5, 0.5, 0.375]
  const light = sunlight.map((value) => value / Math.hypot(...sunlight))
  const lighting = moonLightInView(moon, light, [1, 0, 0], [0, 1, 0], [0, 0, 0])
  near(lighting[0], Math.SQRT1_2)
  near(lighting[1], Math.SQRT1_2)
  near(lighting[2], 0)
  const rolled = moonLightInView(moon, light, [0, 1, 0], [-1, 0, 0], [0, 0, 0])
  near(rolled[0], Math.SQRT1_2)
  near(rolled[1], -Math.SQRT1_2)
  near(rolled[2], lighting[2])
})

test('solar requests preserve observer/time context and validate the response', async (t) => {
  const context = observerContext({ latitude: -33.9, longitude: 151.2 }, { mode: 'paused', at: '2026-11-16T12:00:00Z' })
  const signal = new AbortController().signal
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url, '/api/v1/solar-system')
    assert.equal(options.method, 'POST')
    assert.equal(options.signal, signal)
    assert.equal(options.headers['Content-Type'], 'application/json')
    assert.deepEqual(JSON.parse(options.body), context)
    return { ok: true, json: async () => snapshot('paused') }
  })
  assert.deepEqual((await loadSolarSystem(context, signal)).bodies.map(({ id }) => id), ['sun', 'moon'])
  t.mock.restoreAll()
  t.mock.method(globalThis, 'fetch', async () => ({ ok: true, json: async () => ({ bodies: [] }) }))
  await assert.rejects(loadSolarSystem(context), { key: 'sky.solar.invalid' })
})

test('HTTP failures and cancellation propagate without inventing celestial positions', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => ({ ok: false, status: 503, json: async () => { throw new SyntaxError('not JSON') } }))
  await assert.rejects(loadSolarSystem({}), { key: 'errors.http.503' })
  t.mock.restoreAll()
  t.mock.method(globalThis, 'fetch', async (_url, { signal }) => signal.throwIfAborted())
  const controller = new AbortController()
  controller.abort()
  await assert.rejects(loadSolarSystem({}, controller.signal), { name: 'AbortError' })
})
