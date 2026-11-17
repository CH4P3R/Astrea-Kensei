import { LocalizedError } from '../../i18n/messages.js'
import { sampleWindow } from './imageDataUtils.js'

const unitVector = (value) => Array.isArray(value) && value.length === 3
  && value.every(Number.isFinite) && Math.abs(Math.hypot(...value) - 1) < 0.001

export function prepareSolarSnapshot(snapshot) {
  const { sample_times_ms: times, bodies, mode } = snapshot ?? {}
  const invalid = () => { throw new LocalizedError('sky.solar.invalid') }
  if (snapshot?.coordinate_frame !== 'AltAz' || snapshot.refraction !== false
    || !['live', 'paused'].includes(mode) || !Array.isArray(times)
    || (mode === 'paused' ? times.length !== 1 : times.length < 2)
    || !times.every((time, index) => Number.isFinite(time) && (!index || time > times[index - 1]))
    || !Array.isArray(bodies) || bodies.length !== 2 || !bodies.every((body) => body && typeof body === 'object')
    || new Set(bodies.map((body) => body?.id)).size !== 2) invalid()
  for (const body of bodies) {
    if (!['sun', 'moon'].includes(body.id)
      || !Array.isArray(body.directions) || body.directions.length !== times.length || !body.directions.every(unitVector)) invalid()
    for (const [key, valid] of [
      ['angular_radius_deg', (value) => value > 0 && value < 1],
      ['distance_km', (value) => value > 0],
      ['illumination', (value) => value >= 0 && value <= 1],
    ]) {
      if (!Array.isArray(body[key]) || body[key].length !== times.length
        || !body[key].every((value) => Number.isFinite(value) && valid(value))) invalid()
    }
    if (body.id === 'moon' && (!Array.isArray(body.light_directions)
      || body.light_directions.length !== times.length || !body.light_directions.every(unitVector))) invalid()
  }
  return snapshot
}

export function solarSnapshotIsCurrent(snapshot, timestamp) {
  return Number.isFinite(timestamp) && (snapshot.mode === 'paused'
    || (timestamp >= snapshot.sample_times_ms[0] && timestamp <= snapshot.sample_times_ms.at(-1)))
}

// Reuse output targets instead of allocating vectors for each rendered body.
function interpolateDirection(samples, a, b, blend, target) {
  let lengthSquared = 0
  for (let axis = 0; axis < 3; axis += 1) {
    target[axis] = samples[a][axis] + (samples[b][axis] - samples[a][axis]) * blend
    lengthSquared += target[axis] ** 2
  }
  const length = Math.sqrt(lengthSquared)
  for (let axis = 0; axis < 3; axis += 1) target[axis] /= length
}

export function sampleSolarBody(body, times, timestamp, target) {
  const [a, b, blend] = sampleWindow(times, timestamp)
  interpolateDirection(body.directions, a, b, blend, target.direction)
  if (body.light_directions) interpolateDirection(body.light_directions, a, b, blend, target.lightDirection)
  target.angularRadius = body.angular_radius_deg[a]
    + (body.angular_radius_deg[b] - body.angular_radius_deg[a]) * blend
  target.illumination = body.illumination[a] + (body.illumination[b] - body.illumination[a]) * blend
  return target
}

// The billboard is parallel to the camera, so its bright limb must follow the
// screen projection of sunlight tangent to the Moon's sightline. Preserve the
// physical phase separately: moving the camera must never change illumination.
export function moonLightInView(direction, light, cameraRight, cameraUp, target) {
  const [x, y, z] = direction
  const phase = Math.max(-1, Math.min(1, -(x * light[0] + y * light[1] + z * light[2])))
  const tx = light[0] + phase * x
  const ty = light[1] + phase * y
  const tz = light[2] + phase * z
  const screenX = tx * cameraRight[0] + ty * cameraRight[1] + tz * cameraRight[2]
  const screenY = tx * cameraUp[0] + ty * cameraUp[1] + tz * cameraUp[2]
  const projectedLength = Math.hypot(screenX, screenY)
  const tangentLength = Math.sqrt(Math.max(0, 1 - phase * phase))
  // At a degenerate edge-on projection the limb has no defined screen angle.
  // A fixed fallback remains finite and keeps the same physical lunar phase.
  target[0] = projectedLength > 1e-8 ? screenX * tangentLength / projectedLength : tangentLength
  target[1] = projectedLength > 1e-8 ? screenY * tangentLength / projectedLength : 0
  target[2] = phase
  return target
}
