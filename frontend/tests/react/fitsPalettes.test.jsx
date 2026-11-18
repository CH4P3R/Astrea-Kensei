import { act, createRoot, extend } from '@react-three/fiber'
import { Mesh, OrthographicCamera } from 'three'
import { expect, it, vi } from 'vitest'
import FitsImage from '../../src/three/elements/FitsImage.jsx'
import { IMAGE_PALETTES, IMAGE_PALETTE_GLSL } from '../../src/config/appearance.js'

extend({ Mesh })

it('updates every palette on the live FITS material without replacing pixels, geometry, exposure or masks', async () => {
  const canvas = document.createElement('canvas')
  const renderer = { domElement: canvas, render: vi.fn(), setSize: vi.fn(), setPixelRatio: vi.fn() }
  const camera = new OrthographicCamera(-70, 70, 45, -45, 0.01, 250)
  camera.manual = true
  const root = createRoot(canvas)
  await root.configure({ gl: renderer, camera, size: { width: 800, height: 600, top: 0, left: 0 }, frameloop: 'never', dpr: 1 })
  const active = {
    metadata: { image: { width: 2, height: 2 } },
    timeContext: { mode: 'paused' },
    pixels: { values: new Float32Array([0, -1, 0.5, 1]) },
    projection: { sample_times_ms: [1000], directions: [[-1, -1, -100, 1, -1, -100, -1, 1, -100, 1, 1, -100]],
      uv: [0, 0, 1, 0, 0, 1, 1, 1], indices: [0, 1, 2, 1, 3, 2] },
  }
  let state
  const show = async (palette) => {
    await act(async () => {
      state = root.render(<FitsImage active={active} timestamp={1000} settings={{ palette, exposure: 1.4, opacity: 0.35 }} />).getState()
    })
    state.advance(1, false)
    return state.scene.children[0]
  }
  try {
    const mesh = await show('gray')
    const { geometry, material } = mesh
    const texture = material.uniforms.pixels.value
    const disposals = [texture, geometry, material].map((resource) => {
      const listener = vi.fn()
      resource.addEventListener('dispose', listener)
      return listener
    })
    expect(material.fragmentShader).toContain(IMAGE_PALETTE_GLSL)
    expect(material.fragmentShader).toContain('if (value < 0.0) discard;')
    expect(material.fragmentShader.indexOf('if (value < 0.0) discard;'))
      .toBeLessThan(material.fragmentShader.indexOf('vec3 color = imagePalette(intensity, palette);'))
    for (let index = 0; index < IMAGE_PALETTES.length; index += 1) {
      await show(IMAGE_PALETTES[index].id)
      expect(mesh.geometry).toBe(geometry)
      expect(mesh.material).toBe(material)
      expect(material.uniforms.pixels.value).toBe(texture)
      expect(texture.image.data).toBe(active.pixels.values)
      expect(texture.image.data[1]).toBe(-1)
      expect(material.uniforms.palette.value).toBe(index)
      expect(material.uniforms.exposure.value).toBe(1.4)
      expect(material.uniforms.opacity.value).toBe(0.35)
      expect(material.visible).toBe(true)
    }
    await show('unknown-old-setting')
    expect(material.uniforms.palette.value).toBe(0)
    expect(disposals.every((listener) => listener.mock.calls.length === 0)).toBe(true)
    await act(async () => { root.render(null) })
    for (const listener of disposals) expect(listener).toHaveBeenCalledTimes(1)
  } finally {
    await act(async () => { root.unmount() })
  }
})
