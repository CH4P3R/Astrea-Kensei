import { StrictMode } from 'react'
import { act, createRoot, extend } from '@react-three/fiber'
import { LineSegments, Mesh, OrthographicCamera } from 'three'
import { expect, it, vi } from 'vitest'
import Constellations from '../../src/three/elements/Constellations.jsx'
import { baseOrthographicZoom } from '../../src/three/core/skyViewUtils.js'

extend({ Mesh, LineSegments })

it('shares visibility in the same frame, preserves resources on rerender and disposes them on removal', async () => {
  // Use the real R3F reconciler and scene objects. Rendering is stubbed because
  // this verifies frame coordination/resource lifetime, not GPU appearance.
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    measureText: (text) => ({ width: text.length * 12 }), fillText: vi.fn(),
  })
  const canvas = document.createElement('canvas')
  const renderer = { domElement: canvas, render: vi.fn(), setSize: vi.fn(), setPixelRatio: vi.fn() }
  const camera = new OrthographicCamera(-70, 70, 45, -45, 0.01, 250)
  camera.manual = true
  const root = createRoot(canvas)
  await root.configure({ gl: renderer, camera, size: { width: 800, height: 600, top: 0, left: 0 },
    frameloop: 'never', dpr: 1 })
  try {
    let store
    await act(async () => { store = root.render(<StrictMode><Constellations /></StrictMode>) })
    const state = store.getState()
    const names = state.scene.children.find((child) => child.isMesh)
    const lines = state.scene.children.find((child) => child.isLineSegments)
    const opacity = names.geometry.attributes.labelOpacity.array
    expect(lines.material.uniforms.figureOpacity.value).toBe(opacity)
    state.advance(1, false)
    expect(names.visible).toBe(true)
    expect(lines.visible).toBe(true)
    expect(opacity.filter((value) => value > 0.005).length).toBeLessThanOrEqual(8)

    const resources = [names.geometry, names.material, names.material.uniforms.atlas.value,
      lines.geometry, lines.material]
    const disposed = resources.map((resource) => {
      const listener = vi.fn()
      resource.addEventListener('dispose', listener)
      return listener
    })
    await act(async () => { root.render(<StrictMode><Constellations /></StrictMode>) })
    expect(names.geometry).toBe(resources[0])
    expect(names.material.uniforms.atlas.value).toBe(resources[2])
    expect(lines.geometry).toBe(resources[3])
    expect(disposed.every((listener) => listener.mock.calls.length === 0)).toBe(true)

    camera.zoom = baseOrthographicZoom(800, 600) * 20
    camera.updateProjectionMatrix()
    state.advance(2, false)
    expect(names.visible).toBe(false)
    expect(lines.visible).toBe(false)
    expect(opacity.every((value) => value === 0)).toBe(true)

    await act(async () => { root.render(null) })
    expect(state.scene.children).toHaveLength(0)
    for (const listener of disposed) expect(listener).toHaveBeenCalledTimes(1)
  } finally {
    await act(async () => { root.unmount() })
  }
})
