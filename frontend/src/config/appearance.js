export const DEFAULT_APPEARANCE = { palette: 'gray', exposure: 0, opacity: 1 }
export const DEFAULT_PROCESSING = { mask_flags: false, subtract_zodi: false, signal_to_noise: false }

// Original display ramps, not implementations of named scientific colormaps.
// RGB values are linear, matching ShaderMaterial's working color space.
// Keep the original gray/color IDs and color transitions for existing sessions.
export const IMAGE_PALETTES = [
  { id: 'gray' },
  { id: 'color', base: [0.015, 0.02, 0.08], transitions: [
    [0, 0.3, [0.15, 0.35, 0.7]],
    [0.25, 0.55, [0.45, 0.85, 0.8]],
    [0.5, 0.8, [0.98, 0.76, 0.45]],
    [0.8, 1, [1, 1, 1]],
  ] },
  { id: 'amber', base: [0.006, 0.002, 0], transitions: [
    [0, 0.4, [0.25, 0.04, 0.005]],
    [0.3, 0.75, [0.78, 0.3, 0.025]],
    [0.7, 1, [1, 0.92, 0.65]],
  ] },
  { id: 'ice', base: [0.001, 0.008, 0.025], transitions: [
    [0, 0.4, [0.015, 0.15, 0.26]],
    [0.3, 0.75, [0.05, 0.55, 0.65]],
    [0.7, 1, [0.8, 1, 1]],
  ] },
  { id: 'violetGold', base: [0.018, 0.003, 0.045], transitions: [
    [0, 0.4, [0.2, 0.07, 0.32]],
    [0.3, 0.75, [0.65, 0.28, 0.28]],
    [0.7, 1, [1, 0.92, 0.5]],
  ] },
  { id: 'inverse' },
]

export function imagePaletteIndex(id) {
  return Math.max(0, IMAGE_PALETTES.findIndex((palette) => palette.id === id))
}

export function sampleImagePalette(id, intensity) {
  const value = Math.max(0, Math.min(1, intensity))
  const palette = IMAGE_PALETTES[imagePaletteIndex(id)]
  if (palette.id === 'gray') return [value, value, value]
  if (palette.id === 'inverse') return [1 - value, 1 - value, 1 - value]
  return palette.transitions.reduce((color, [start, end, target]) => {
    const phase = Math.max(0, Math.min(1, (value - start) / (end - start)))
    const blend = phase * phase * (3 - 2 * phase)
    return color.map((channel, index) => channel + (target[index] - channel) * blend)
  }, palette.base)
}

// CSS displays sRGB; Three converts the same linear shader output to sRGB.
// Sample the actual ramp so the legend also preserves the legacy smooth blends.
const displayChannel = (value) => Math.round(255 * (value <= 0.0031308
  ? 12.92 * value : 1.055 * value ** (1 / 2.4) - 0.055))
const paletteGradients = IMAGE_PALETTES.map(({ id }) => `linear-gradient(90deg, ${Array.from({ length: 33 }, (_, index) => {
  const channels = sampleImagePalette(id, index / 32).map(displayChannel)
  return `rgb(${channels.join(' ')}) ${index / 32 * 100}%`
}).join(', ')})`)

export function imagePaletteGradient(id) {
  return paletteGradients[imagePaletteIndex(id)]
}

// Generate the small GLSL function from the same stops used by the legend.
// This adds no textures, network requests, or per-frame CPU recoloring.
const glslFloat = (value) => Number(value).toFixed(6)
const glslColor = (color) => `vec3(${color.map(glslFloat).join(', ')})`
export const IMAGE_PALETTE_GLSL = `vec3 imagePalette(float intensity, float palette) {
${IMAGE_PALETTES.map(({ id, base, transitions }, index) => {
  let result
  if (id === 'gray') result = 'return vec3(intensity);'
  else if (id === 'inverse') result = 'return vec3(1.0 - intensity);'
  else result = `vec3 color = ${glslColor(base)};
${transitions.map(([start, end, target]) => `color = mix(color, ${glslColor(target)}, smoothstep(${glslFloat(start)}, ${glslFloat(end)}, intensity));`).join('\n')}
return color;`
  return `if (palette < ${glslFloat(index + 0.5)}) { ${result} }`
}).join('\n')}
return vec3(intensity);
}`

export function compatibleUnits(first, second) {
  const a = first?.metadata.image.unit?.trim()
  const b = second?.metadata.image.unit?.trim()
  return Boolean(a && b && a === b)
}
