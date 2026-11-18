import { StrictMode } from 'react'
import { act, createRoot, extend } from '@react-three/fiber'
import { Group, Mesh, OrthographicCamera, SRGBColorSpace, Texture, TextureLoader, Vector3 } from 'three'
import { expect, it, vi } from 'vitest'
import DeepSkyObjects from '../../src/three/elements/DeepSkyObjects.jsx'
import { DEEP_SKY } from '../../src/config/deepSky.js'
import { DEEP_SKY_OBJECTS } from '../../src/data/deepSky/catalog.js'
import { equatorialPoint } from '../../src/three/core/skyGuideUtils.js'

extend({ Group, Mesh })

async function sceneFixture() {
  const requests = []
  const drawImage = vi.fn()
  const fills = []
  const context = { drawImage, fillStyle: '', fillRect: (...rect) => fills.push([context.fillStyle, ...rect]) }
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context)
  vi.spyOn(TextureLoader.prototype, 'load').mockImplementation((url, onLoad, _progress, onError) => {
    const texture = new Texture()
    const disposed = vi.fn()
    texture.addEventListener('dispose', disposed)
    requests.push({ url, texture, onLoad, onError, disposed })
    return texture
  })
  const canvas = document.createElement('canvas')
  // Real R3F/Three objects and frame callbacks, with no GPU rendering or I/O.
  const renderer = { domElement: canvas, render: vi.fn(), setSize: vi.fn(), setPixelRatio: vi.fn(),
    capabilities: { maxTextureSize: 256 } }
  const camera = new OrthographicCamera(-70, 70, 45, -45, 0.01, 250)
  camera.manual = true
  camera.zoom = 20
  camera.updateProjectionMatrix()
  const root = createRoot(canvas)
  await root.configure({ gl: renderer, camera, size: { width: 800, height: 600, top: 0, left: 0 },
    frameloop: 'never', dpr: 1 })
  let state
  let elapsed = 0
  const render = async (element) => {
    await act(async () => { state = root.render(element).getState() })
  }
  const frame = (object) => {
    if (object) camera.lookAt(new Vector3(...equatorialPoint(object.raDeg, object.decDeg)))
    camera.updateMatrixWorld()
    camera.updateProjectionMatrix()
    elapsed += 0.1
    state.advance(elapsed, false)
  }
  return { root, camera, requests, drawImage, fills, render, frame, state: () => state }
}

it('loads only visible fields, caps textures, suppresses tiny glows and keeps FITS free of illustrations', async () => {
  const fixture = await sceneFixture()
  const { root, camera, requests, drawImage, render, frame } = fixture
  try {
    await render(<DeepSkyObjects visible={false} />)
    frame(DEEP_SKY_OBJECTS[0])
    expect(requests).toHaveLength(0)
    const meshes = fixture.state().scene.children[0].children
    expect(meshes).toHaveLength(6)
    expect(meshes.every((mesh) => mesh.isMesh && !mesh.isPoints)).toBe(true)
    expect(meshes.every((mesh) => !mesh.visible && mesh.material.uniforms.opacity.value === 0)).toBe(true)

    await render(<DeepSkyObjects visible />)
    camera.zoom = 0.01
    frame(DEEP_SKY_OBJECTS[0])
    expect(requests).toHaveLength(0)
    expect(meshes.every((mesh) => !mesh.visible && mesh.material.uniforms.opacity.value === 0)).toBe(true)

    camera.zoom = 20
    frame(DEEP_SKY_OBJECTS[0])
    expect(requests.length).toBeGreaterThan(0)
    expect(requests.length).toBeLessThan(6)
    for (const object of DEEP_SKY_OBJECTS) frame(object)
    expect(requests).toHaveLength(6)
    for (const request of requests) {
      request.texture.image = { width: 1280, height: 640 }
      request.onLoad(request.texture)
    }
    frame()
    expect(drawImage).toHaveBeenCalledTimes(6)
    expect(fixture.fills).toEqual(Array.from({ length: 6 }, () => ['#000', 0, 0, 256, 256]))
    for (const call of drawImage.mock.calls) expect(call.slice(1)).toEqual([0, 64, 256, 128])
    expect(requests.every(({ texture }) => texture.image === null)).toBe(true)
    for (const mesh of meshes) {
      expect(mesh.visible).toBe(true)
      expect(mesh.material.uniforms.opacity.value).toBe(DEEP_SKY.opacity)
      const texture = mesh.material.uniforms.illustration.value
      expect(texture.isCanvasTexture).toBe(true)
      expect(texture.colorSpace).toBe(SRGBColorSpace)
      expect(texture.image.width).toBe(256)
      expect(texture.image.height).toBe(256)
    }

    const resources = meshes.flatMap((mesh) => [mesh.geometry, mesh.material, mesh.material.uniforms.illustration.value])
    const disposed = resources.map((resource) => {
      const listener = vi.fn()
      resource.addEventListener('dispose', listener)
      return listener
    })
    await render(<DeepSkyObjects visible={false} />)
    frame()
    expect(meshes.every((mesh) => !mesh.visible && mesh.material.uniforms.opacity.value === 0)).toBe(true)
    expect(disposed.every((listener) => listener.mock.calls.length === 0)).toBe(true)
    await render(<DeepSkyObjects visible />)
    frame()
    expect(requests).toHaveLength(6)
    expect(meshes.every((mesh) => mesh.visible)).toBe(true)
    for (let index = 0; index < meshes.length; index += 1) {
      expect(meshes[index].material.uniforms.illustration.value).toBe(resources[index * 3 + 2])
    }

    camera.zoom = 10000
    frame()
    expect(meshes.every((mesh) => !mesh.visible && mesh.material.uniforms.opacity.value === 0)).toBe(true)
    await render(null)
    for (const listener of disposed) expect(listener).toHaveBeenCalledTimes(1)
  } finally {
    await act(async () => { root.unmount() })
  }
})

it('disposes pending loads after removal without attaching late textures in StrictMode', async () => {
  const fixture = await sceneFixture()
  const { root, requests, drawImage, render, frame } = fixture
  try {
    await render(<StrictMode><DeepSkyObjects /></StrictMode>)
    frame(DEEP_SKY_OBJECTS[0])
    expect(requests.length).toBeGreaterThan(0)
    const materials = fixture.state().scene.children[0].children.map((mesh) => mesh.material)
    await render(null)
    expect(fixture.state().scene.children).toHaveLength(0)
    for (const request of requests) {
      expect(request.disposed).toHaveBeenCalled()
      request.texture.image = { width: 1280, height: 1280 }
      request.onLoad(request.texture)
      expect(request.disposed.mock.calls.length).toBeGreaterThanOrEqual(2)
    }
    expect(drawImage).not.toHaveBeenCalled()
    expect(materials.every((material) => material.uniforms.illustration.value === null)).toBe(true)
  } finally {
    await act(async () => { root.unmount() })
  }
})
