import { equatorialPoint } from './skyGuideUtils.js'

const RAD = Math.PI / 180

// A tangent-plane field projected back onto the celestial sphere. Texture right
// is west, up is north, as on north-up astronomical images viewed from inside.
export function deepSkyPatch(object, radius = 100, segments = 8) {
  const { raDeg, decDeg, displayFieldDeg: [width, height] } = object
  const center = equatorialPoint(raDeg, decDeg)
  const ra = raDeg * RAD
  const dec = decDeg * RAD
  const west = [Math.cos(ra), 0, -Math.sin(ra)]
  const north = [Math.sin(dec) * Math.sin(ra), Math.cos(dec), Math.sin(dec) * Math.cos(ra)]
  const halfWidth = Math.tan(width * RAD / 2)
  const halfHeight = Math.tan(height * RAD / 2)
  const positions = []
  const uvs = []
  const indices = []
  for (let row = 0; row <= segments; row += 1) {
    for (let column = 0; column <= segments; column += 1) {
      const u = column / segments
      const v = row / segments
      const direction = center.map((value, axis) => value
        + (2 * u - 1) * halfWidth * west[axis] + (2 * v - 1) * halfHeight * north[axis])
      const length = Math.hypot(...direction)
      positions.push(...direction.map((value) => value * radius / length))
      uvs.push(u, v)
      if (row < segments && column < segments) {
        const a = row * (segments + 1) + column
        const b = a + 1
        const d = a + segments + 1
        const c = d + 1
        indices.push(a, b, d, b, c, d)
      }
    }
  }
  return { positions, uvs, indices }
}

const smoothstep = (value, start, end) => {
  const t = Math.max(0, Math.min(1, (value - start) / (end - start)))
  return t * t * (3 - 2 * t)
}

// Do not turn subpixel objects into fake stars, or enlarge illustrative clouds
// into apparently detailed measurements when inspecting a tiny field.
export function deepSkyDetailOpacity(projectedPixels) {
  return smoothstep(projectedPixels, 2, 10) * (1 - smoothstep(projectedPixels, 420, 900))
}
