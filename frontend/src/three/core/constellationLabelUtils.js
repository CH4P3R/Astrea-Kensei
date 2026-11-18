import { constellationSegments, equatorialPoint } from './skyGuideUtils.js'
import { constellationNames } from '../../data/constellations/names.js'

export const CONSTELLATION_LABEL_OPACITY = 0.76

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
    return { id: `${feature.id}-${index}`, featureIndex: index, constellation: feature.id, text, position }
  }).filter(Boolean)
}

// Every vertex carries its label's index: the line shader reads exactly the
// same opacity buffer as the name, including the two separate Serpens figures.
export function constellationLineData(features, labels, radius = 1) {
  const positions = []
  const figures = []
  labels.forEach((label, index) => {
    const points = constellationSegments([features[label.featureIndex]], radius)
    for (const point of points) {
      positions.push(...point)
      figures.push(index)
    }
  })
  return { positions: new Float32Array(positions), figures: new Float32Array(figures) }
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
  return CONSTELLATION_LABEL_OPACITY * (1 - progress * progress * (3 - 2 * progress))
}

export function updateConstellationOpacities(candidates, selected, opacities, targetOpacity, delta) {
  for (const candidate of candidates) candidate.selected = false
  for (const candidate of selected) candidate.selected = true
  const blend = 1 - Math.exp(-12 * delta)
  let visible = false
  for (const candidate of candidates) {
    // Hide rejected figures immediately to keep the same strict overlap/count
    // limit for names and lines. Only their entrance needs a gradual fade.
    const value = candidate.selected
      ? opacities[candidate.index] + (targetOpacity - opacities[candidate.index]) * blend : 0
    opacities[candidate.index] = value
    visible ||= value > 0.005
  }
  return visible
}
