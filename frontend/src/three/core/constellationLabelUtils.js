import { equatorialPoint } from './skyGuideUtils.js'
import { constellationNames } from '../../data/constellations/names.js'

// Average directions, not RA values: a figure across 0h must not move to 12h.
// Repeated vertices in closed figures or several paths receive no extra weight.
export function constellationAnchor(feature, radius = 1) {
  const paths = feature.geometry.type === 'LineString'
    ? [feature.geometry.coordinates] : feature.geometry.coordinates
  const unique = new Map()
  for (const path of paths) {
    for (const [ra, dec] of path) {
      const normalizedRa = ((ra % 360) + 360) % 360
      unique.set(`${normalizedRa},${dec}`, equatorialPoint(normalizedRa, dec))
    }
  }
  const points = [...unique.values()]
  if (!points.length) return null
  const sum = points.reduce((total, point) => total.map((value, axis) => value + point[axis]), [0, 0, 0])
  const length = Math.hypot(...sum)
  return length > 1e-8 ? sum.map((value) => value * radius / length)
    : points[0].map((value) => value * radius)
}

export function constellationLabels(features, radius = 1) {
  return features.map((feature, index) => {
    const position = constellationAnchor(feature, radius)
    if (!position) return null
    let text = constellationNames[feature.id] ?? feature.id
    if (feature.id === 'Ser') {
      const ra = (Math.atan2(-position[0], -position[2]) * 180 / Math.PI + 360) % 360
      text += ra < 250 ? ' Caput' : ' Cauda'
    }
    return { id: `${feature.id}-${index}`, constellation: feature.id, text, position }
  }).filter(Boolean)
}

// Reuse output/scratch arrays from the animation loop. Coordinates are CSS px;
// the caller rejects anchors behind the camera before their 2D projection.
export function selectConstellationLabels(candidates, viewportWidth, viewportHeight,
  selected = [], scratch = [], limit = 8, padding = 8) {
  selected.length = 0
  scratch.length = 0
  for (const candidate of candidates) {
    if (!candidate.inFront || !Number.isFinite(candidate.x) || !Number.isFinite(candidate.y)) continue
    const halfWidth = candidate.width / 2 + padding
    const halfHeight = candidate.height / 2 + padding
    if (candidate.x < halfWidth || candidate.x > viewportWidth - halfWidth
      || candidate.y < halfHeight || candidate.y > viewportHeight - halfHeight) continue
    scratch.push(candidate)
  }
  scratch.sort((a, b) => a.score - b.score || a.index - b.index)
  for (const candidate of scratch) {
    if (selected.length >= limit) break
    const overlaps = selected.some((other) =>
      Math.abs(candidate.x - other.x) < (candidate.width + other.width) / 2 + padding
      && Math.abs(candidate.y - other.y) < (candidate.height + other.height) / 2 + padding)
    if (!overlaps) selected.push(candidate)
  }
  return selected
}

export function constellationLabelOpacity(relativeZoom) {
  const progress = Math.min(1, Math.max(0, (relativeZoom - 6) / 14))
  return 0.76 * (1 - progress * progress * (3 - 2 * progress))
}
