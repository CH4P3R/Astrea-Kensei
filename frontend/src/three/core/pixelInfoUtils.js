import { DEFAULT_PROCESSING } from '../../config/appearance.js'

const UV_EPSILON = 1e-7

/**
 * Match the FITS texture's nearest sample: C-order rows run bottom to top,
 * DataTexture.flipY is false, and mesh UVs describe pixel edges, not centers.
 * x/y are one-based FITS-style coordinates within this cutout; column/row/index
 * are zero-based array locations. They are not full-detector coordinates.
 */
export function pixelFromUv(uv, image) {
  const { width, height, array_order: order, pixel_origin: origin } = image ?? {}
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1
    || !Number.isSafeInteger(width * height)
    || (order !== undefined && order !== 'C')
    || (origin !== undefined && origin !== 'lower-left')) return null
  if (!Number.isFinite(uv?.x) || !Number.isFinite(uv?.y)
    || uv.x < -UV_EPSILON || uv.x > 1 + UV_EPSILON
    || uv.y < -UV_EPSILON || uv.y > 1 + UV_EPSILON) return null
  // Inclusive outer edges sample the edge texel, like ClampToEdgeWrapping.
  // Only tolerate tiny intersection roundoff; do not clamp off-image pointers.
  const column = Math.min(width - 1, Math.floor(Math.max(0, uv.x) * width))
  const row = Math.min(height - 1, Math.floor(Math.max(0, uv.y) * height))
  return { index: row * width + column, column, row, x: column + 1, y: row + 1 }
}

function scalarAt(values, index, count) {
  if (values?.length !== count || typeof values[index] !== 'number') {
    return { value: null, status: 'unavailable' }
  }
  const value = values[index]
  return Number.isFinite(value) ? { value, status: 'finite' } : { value: null, status: 'nonfinite' }
}

/**
 * Inspect arrays already loaded for a hovered image. No requests or WCS
 * approximation: the render mesh cannot supply exact per-pixel sky astrometry.
 *
 * active.pixels.raw is always the unmodified IMAGE plane. displayPixels.raw
 * must be the actual applied processing result, never an inverse of normalized
 * values (normalization clips and cannot recover scientific values).
 *
 * Pass appliedProcessing, not requested processing while it is pending/failed.
 * A processed NaN can have several causes; without the individual FLAGS/ZODI/
 * VARIANCE planes it must not be identified as a specific quality rejection.
 */
export function readPixelInfo(active, uv, { displayPixels = active?.pixels, appliedProcessing = {} } = {}) {
  const image = active?.metadata?.image
  const location = pixelFromUv(uv, image)
  if (!location) return null
  const { index, x, y } = location
  const count = image.width * image.height
  const unit = typeof image.unit === 'string' ? image.unit.trim() || null : null
  const original = { ...scalarAt(active.pixels?.raw, index, count), unit, dimensionless: false }
  const hasProcessing = Object.keys(DEFAULT_PROCESSING).some((key) => appliedProcessing?.[key] === true)
  const dimensionless = appliedProcessing?.signal_to_noise === true
  // The original pixels object cannot certify an applied processing result.
  const processed = hasProcessing ? {
    ...scalarAt(displayPixels === active.pixels ? null : displayPixels?.raw, index, count),
    unit: dimensionless ? null : unit,
    dimensionless,
  } : null
  const displaySample = scalarAt(displayPixels?.values, index, count)
  const validDisplay = displaySample.status === 'finite' && displaySample.value >= 0 && displaySample.value <= 1
  return {
    imageId: active.metadata.id,
    x, y, index,
    original,
    processed,
    display: {
      normalizedValue: validDisplay ? displaySample.value : null,
      // "visible" means an unmasked texture sample, independent of mesh
      // visibility, screen position, palette, exposure, or layer opacity.
      status: validDisplay ? 'visible' : displaySample.status === 'unavailable' ? 'unavailable' : 'masked-or-invalid',
    },
  }
}
