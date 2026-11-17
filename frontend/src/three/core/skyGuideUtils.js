import { precessJ2000 } from './coordinateUtils.js'

const RAD = Math.PI / 180
const J2000 = Date.UTC(2000, 0, 1, 12)
const dot = (a, b) => a.reduce((sum, value, index) => sum + value * b[index], 0)

// Same right-handed J2000 scene as EquatorialFrame: +X RA 18h, +Y NCP, -Z RA 0h.
export function equatorialPoint(ra, dec, radius = 1) {
  const alpha = ra * RAD
  const delta = dec * RAD
  return [-radius * Math.cos(delta) * Math.sin(alpha),
    radius * Math.sin(delta), -radius * Math.cos(delta) * Math.cos(alpha)]
}

// Follow the short great-circle arc, including across the 0h / 24h seam.
// A straight 3D chord would cut through the sky sphere instead of following
// angular directions between the stars; all samples stay on the sphere.
export function sphericalArc(from, to, radius = 1, maxStepDegrees = 0.5) {
  const a = equatorialPoint(...from)
  const b = equatorialPoint(...to)
  const cosine = Math.max(-1, Math.min(1, dot(a, b)))
  const angle = Math.acos(cosine)
  if (angle < 1e-10) return [a.map((value) => value * radius), b.map((value) => value * radius)]

  let tangent = b.map((value, index) => value - cosine * a[index])
  let length = Math.hypot(...tangent)
  if (length < 1e-10) {
    // Antipodes have no unique short arc. Pick a stable perpendicular for the
    // general helper; the constellation catalogue has no antipodal segments.
    const axis = a.map((value) => Math.abs(value)).indexOf(Math.min(...a.map(Math.abs)))
    tangent = a.map((value, index) => (index === axis ? 1 : 0) - a[axis] * value)
    length = Math.hypot(...tangent)
  }
  tangent = tangent.map((value) => value / length)
  const steps = Math.max(1, Math.ceil(angle / RAD / maxStepDegrees))
  return Array.from({ length: steps + 1 }, (_, index) => {
    if (index === 0) return a.map((value) => value * radius)
    if (index === steps) return b.map((value) => value * radius)
    const phase = angle * index / steps
    return a.map((value, axis) => radius * (value * Math.cos(phase) + tangent[axis] * Math.sin(phase)))
  })
}

const appendSegments = (target, points) => {
  for (let index = 1; index < points.length; index += 1) target.push(points[index - 1], points[index])
}

// Each GeoJSON path is separate. Never connect the end of one constellation
// (or one disconnected piece, such as Serpens) to the start of another.
export function constellationSegments(features, radius = 1) {
  const segments = []
  for (const feature of features) {
    const paths = feature.geometry.type === 'LineString'
      ? [feature.geometry.coordinates] : feature.geometry.coordinates
    for (const path of paths) {
      for (let index = 1; index < path.length; index += 1) {
        appendSegments(segments, sphericalArc(path[index - 1], path[index], radius))
      }
    }
  }
  return segments
}

export function equatorialGrid(radius = 1, raStep = 15, decStep = 15) {
  const meridians = []
  const parallels = []
  const equator = []
  const labels = []
  const step = 0.5
  for (let ra = 0; ra < 360; ra += raStep) {
    appendSegments(meridians, Array.from({ length: 180 / step + 1 }, (_, index) =>
      equatorialPoint(ra, index * step - 90, radius)))
    if (ra % 30 === 0) labels.push({ id: `ra-${ra}`, text: `${ra / 15}h`, position: equatorialPoint(ra, 0, radius), axis: 'ra' })
  }
  for (let dec = -90 + decStep; dec < 90; dec += decStep) {
    appendSegments(dec === 0 ? equator : parallels,
      Array.from({ length: 360 / step + 1 }, (_, index) => equatorialPoint(index * step, dec, radius)))
    if (dec !== 0) {
      for (let ra = 0; ra < 360; ra += 90) labels.push({
        id: `dec-${dec}-${ra}`, text: `${dec > 0 ? '+' : '−'}${Math.abs(dec)}°`,
        position: equatorialPoint(ra, dec, radius), axis: 'dec',
      })
    }
  }
  return { meridians, parallels, equator, labels }
}

// Mean obliquity, IAU 1980, matching the existing IAU 1976 precession model.
// Explanatory Supplement to the Astronomical Almanac (1992), expression 3.222-1.
// Reference: https://github.com/liberfa/erfa/blob/master/src/obl80.c
// The clock supplies UTC, an adequate approximation to TT for this visual guide.
export function meanObliquity(timestamp) {
  const centuries = (timestamp - J2000) / (86400000 * 36525)
  return (84381.448 - 46.815 * centuries - 0.00059 * centuries ** 2
    + 0.001813 * centuries ** 3) / 3600 * RAD
}

// The ecliptic is defined in the mean equator/equinox of the selected date.
// Convert it back to J2000 before EquatorialFrame applies precession and the
// observer's latitude / sidereal rotation. This avoids applying precession twice.
export function eclipticPoints(timestamp, radius = 1, steps = 720) {
  const obliquity = meanObliquity(timestamp)
  const axes = [
    equatorialPoint(...precessJ2000(270, 0, timestamp)),
    equatorialPoint(...precessJ2000(0, 90, timestamp)),
    equatorialPoint(...precessJ2000(0, 0, timestamp)).map((value) => -value),
  ]
  return Array.from({ length: steps + 1 }, (_, index) => {
    const longitude = 2 * Math.PI * index / steps
    const ofDate = [-Math.sin(longitude) * Math.cos(obliquity),
      Math.sin(longitude) * Math.sin(obliquity), -Math.cos(longitude)]
    // The inverse of this orthonormal precession basis is its transpose.
    return axes.map((axis) => radius * dot(axis, ofDate))
  })
}
