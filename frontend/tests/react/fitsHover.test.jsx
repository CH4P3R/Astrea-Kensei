import { act, createRoot, extend } from '@react-three/fiber'
import { Mesh, OrthographicCamera } from 'three'
import { expect, it, vi } from 'vitest'
import FitsImage from '../../src/three/elements/FitsImage.jsx'

extend({ Mesh })

function image(id = 'A', shift = 0) {
  return {
    metadata: { id, image: { width: 4, height: 4 } }, timeContext: { mode: 'paused' },
    pixels: { raw: Float32Array.from({ length: 16 }, (_, index) => index), values: new Float32Array(16).fill(0.5) },
    projection: { sample_times_ms: [1000],
      directions: [[-40 + shift, -40, -100, 40 + shift, -40, -100, -40 + shift, 40, -100, 40 + shift, 40, -100]],
      uv: [0, 0, 1, 0, 0, 1, 1, 1], indices: [0, 1, 2, 1, 3, 2] },
  }
}

async function harness() {
  const canvas = document.createElement('canvas')
  canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 800, height: 600 })
  const renderer = { domElement: canvas, render: vi.fn(), setSize: vi.fn(), setPixelRatio: vi.fn() }
  const camera = new OrthographicCamera(-70, 70, 45, -45, 0.01, 250)
  camera.manual = true
  const root = createRoot(canvas)
  await root.configure({ gl: renderer, camera, size: { width: 800, height: 600, top: 0, left: 0 }, frameloop: 'never', dpr: 1 })
  let state
  const show = async (children) => {
    await act(async () => { state = root.render(children).getState() })
    return state.scene.children
  }
  const frame = () => { act(() => { state.advance(1, false) }) }
  const pointer = (type, { x = 420, y = 280, buttons = 0, pointerType = 'mouse' } = {}) => {
    const event = new Event(type, { bubbles: true, cancelable: true })
    Object.assign(event, { clientX: x, clientY: y, buttons, pointerType, isPrimary: true })
    act(() => { canvas.dispatchEvent(event) })
    return event
  }
  return { canvas, camera, show, frame, pointer, close: async () => { await act(async () => { root.render(null); root.unmount() }) } }
}

it('renews projection positions atomically while retaining GPU resources, and replaces only changed topology', async () => {
  const view = await harness()
  let active = image()
  try {
    const [mesh] = await view.show(<FitsImage active={active} timestamp={1000} />)
    const { geometry, material } = mesh
    const texture = material.uniforms.pixels.value
    const before = [...geometry.attributes.position.array]
    const disposals = [texture, geometry, material].map((resource) => {
      const listener = vi.fn()
      resource.addEventListener('dispose', listener)
      return listener
    })
    const replacement = image('A', 15)
    active = { ...active, projection: { ...replacement.projection, sample_times_ms: [2000] } }
    await view.show(<FitsImage active={active} timestamp={2000} />)
    // Layout commit updates the new positions before the next rendered frame.
    expect(mesh.geometry).toBe(geometry)
    expect(mesh.material).toBe(material)
    expect(material.uniforms.pixels.value).toBe(texture)
    expect([...geometry.attributes.position.array]).not.toEqual(before)
    expect(material.visible).toBe(true)
    expect(disposals.every((listener) => listener.mock.calls.length === 0)).toBe(true)
    const processed = { values: new Float32Array(16).fill(0.75), raw: new Float32Array(16).fill(20) }
    await view.show(<FitsImage active={active} pixels={processed} timestamp={2000} />)
    expect(material.uniforms.pixels.value).toBe(texture)
    expect(texture.image.data).toBe(processed.values)
    expect(mesh.geometry).toBe(geometry)
    active = { ...active, projection: { ...active.projection, uv: [1, 0, 0, 0, 1, 1, 0, 1] } }
    await view.show(<FitsImage active={active} pixels={processed} timestamp={2000} />)
    expect(mesh.geometry).not.toBe(geometry)
    expect(mesh.material).toBe(material)
    expect(material.uniforms.pixels.value).toBe(texture)
    expect(disposals[1]).toHaveBeenCalledTimes(1)
    expect(disposals[0]).not.toHaveBeenCalled()
    expect(disposals[2]).not.toHaveBeenCalled()
  } finally { await view.close() }
})

it('reports bounded pixel hover, deduplicates still frames, and refreshes a stationary cursor after camera or projection changes', async () => {
  const view = await harness()
  const hover = vi.fn()
  let active = image()
  try {
    await view.show(<FitsImage active={active} timestamp={1000} onPixelHover={hover} />)
    view.pointer('pointermove')
    view.frame()
    const first = hover.mock.lastCall[0]
    expect(first).toMatchObject({ clientX: 420, clientY: 280, active, pixels: active.pixels })
    expect(first.uv.x).toBeGreaterThan(0)
    expect(first.uv.x).toBeLessThan(1)
    expect(hover.mock.lastCall[1]).toBe('A')
    const count = hover.mock.calls.length
    view.frame(); view.frame()
    expect(hover).toHaveBeenCalledTimes(count)
    view.camera.position.x = 20
    view.frame()
    expect(hover.mock.lastCall[0].uv.x).toBeGreaterThan(first.uv.x)
    active = { ...active, projection: image('A', 15).projection }
    const beforeRefresh = hover.mock.calls.length
    await view.show(<FitsImage active={active} timestamp={1000} onPixelHover={hover} />)
    expect(hover).toHaveBeenCalledTimes(beforeRefresh)
    view.frame()
    expect(hover.mock.lastCall[0].active).toBe(active)
    view.camera.position.x = 1000
    view.frame()
    expect(hover.mock.lastCall).toEqual([null, 'A'])
    view.camera.position.x = 0
    view.frame()
    expect(hover.mock.lastCall[0]).not.toBeNull()
    view.pointer('pointermove', { x: 900 })
    view.frame()
    expect(hover.mock.lastCall).toEqual([null, 'A'])
  } finally { await view.close() }
})

it('retains a stationary pointer when processing changes its pixels and hover callback', async () => {
  const view = await harness()
  const originalHover = vi.fn()
  const processedHover = vi.fn()
  const active = image()
  const processed = { values: new Float32Array(16).fill(0.25), raw: new Float32Array(16).fill(25) }
  try {
    await view.show(<FitsImage active={active} timestamp={1000} onPixelHover={originalHover} />)
    view.pointer('pointermove')
    view.frame()
    const first = originalHover.mock.lastCall[0]
    await view.show(<FitsImage active={active} pixels={processed} timestamp={1000} onPixelHover={processedHover} />)
    view.frame()
    expect(processedHover.mock.lastCall).toEqual([{ ...first, pixels: processed }, 'A'])
    expect(originalHover).toHaveBeenCalledTimes(1)
  } finally { await view.close() }
})

it('switches playback frames under a stationary pointer and clears only its own image on hide or unmount', async () => {
  const view = await harness()
  const hover = vi.fn()
  const first = image('A')
  const second = image('B')
  const frames = (selected, opacity = 1, timestamp = 1000) => <>
    <FitsImage key="A" active={first} timestamp={timestamp} visible={selected === 'A'} settings={{ opacity }} onPixelHover={hover} />
    <FitsImage key="B" active={second} timestamp={timestamp} visible={selected === 'B'} settings={{ opacity }} onPixelHover={hover} />
  </>
  try {
    await view.show(frames('A'))
    view.pointer('pointermove')
    view.frame()
    expect(hover.mock.lastCall[0].active).toBe(first)
    await view.show(frames('B'))
    expect(hover.mock.lastCall).toEqual([null, 'A'])
    view.frame()
    expect(hover.mock.lastCall[0].active).toBe(second)
    expect(hover.mock.lastCall[1]).toBe('B')
    await view.show(frames('B', 0))
    view.frame()
    expect(hover.mock.lastCall).toEqual([null, 'B'])
    await view.show(frames('B'))
    view.frame()
    expect(hover.mock.lastCall[0].active).toBe(second)
    await view.show(frames('B', 1, 1001))
    view.frame()
    expect(hover.mock.lastCall).toEqual([null, 'B'])
    await view.show(frames('B'))
    view.frame()
    await view.show(null)
    expect(hover.mock.lastCall).toEqual([null, 'B'])
  } finally { await view.close() }
})

it('suppresses hover while dragging or after leaving, without preventing pointer events or capturing them', async () => {
  const view = await harness()
  const hover = vi.fn()
  const active = image()
  view.canvas.setPointerCapture = vi.fn()
  try {
    await view.show(<FitsImage active={active} timestamp={1000} onPixelHover={hover} />)
    view.pointer('pointermove')
    view.frame()
    const down = view.pointer('pointerdown', { buttons: 1 })
    view.frame()
    expect(down.defaultPrevented).toBe(false)
    expect(hover.mock.lastCall).toEqual([null, 'A'])
    const count = hover.mock.calls.length
    view.pointer('pointermove', { x: 430, buttons: 1 })
    view.frame()
    expect(hover).toHaveBeenCalledTimes(count)
    const up = view.pointer('pointerup')
    view.pointer('lostpointercapture')
    view.frame()
    expect(up.defaultPrevented).toBe(false)
    expect(hover.mock.lastCall[0]).not.toBeNull()
    expect(view.canvas.setPointerCapture).not.toHaveBeenCalled()
    view.pointer('pointerleave')
    expect(hover.mock.lastCall).toEqual([null, 'A'])
    const afterLeave = hover.mock.calls.length
    view.camera.position.x = 10
    view.frame()
    expect(hover).toHaveBeenCalledTimes(afterLeave)
    view.pointer('pointermove', { pointerType: 'touch' })
    view.frame()
    expect(hover).toHaveBeenCalledTimes(afterLeave)
  } finally { await view.close() }
})

it('does not revive hover behind a DOM overlay after a captured drag is released there', async () => {
  const view = await harness()
  const hover = vi.fn()
  const active = image()
  const descriptor = Object.getOwnPropertyDescriptor(document, 'elementFromPoint')
  let target = view.canvas
  Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: () => target })
  try {
    await view.show(<FitsImage active={active} timestamp={1000} onPixelHover={hover} />)
    view.pointer('pointermove')
    view.frame()
    expect(hover.mock.lastCall[0]).not.toBeNull()
    view.pointer('pointerdown', { buttons: 1 })
    target = document.createElement('aside')
    view.pointer('pointerup')
    view.pointer('lostpointercapture')
    view.frame()
    expect(hover.mock.lastCall).toEqual([null, 'A'])
    const calls = hover.mock.calls.length
    view.camera.position.x = 15
    view.frame()
    expect(hover).toHaveBeenCalledTimes(calls)
    target = view.canvas
    view.frame()
    expect(hover.mock.lastCall[0]).not.toBeNull()
  } finally {
    if (descriptor) Object.defineProperty(document, 'elementFromPoint', descriptor)
    else delete document.elementFromPoint
    await view.close()
  }
})

it('uses the live clock for validity and resumes after renewed coverage without reallocating resources', async () => {
  const view = await harness()
  const hover = vi.fn()
  let active = image()
  active = { ...active, timeContext: { mode: 'live' }, projection: { ...active.projection,
    sample_times_ms: [1000, 2000], directions: [active.projection.directions[0], active.projection.directions[0]] } }
  const now = vi.spyOn(Date, 'now').mockReturnValue(1500)
  try {
    const [mesh] = await view.show(<FitsImage active={active} timestamp={900} onPixelHover={hover} />)
    const { geometry, material } = mesh
    const texture = material.uniforms.pixels.value
    expect(material.visible).toBe(true)
    view.pointer('pointermove')
    view.frame()
    expect(hover.mock.lastCall[0]).not.toBeNull()
    now.mockReturnValue(2100)
    view.frame()
    expect(material.visible).toBe(false)
    expect(hover.mock.lastCall).toEqual([null, 'A'])
    active = { ...active, projection: { ...active.projection, sample_times_ms: [2100, 3100] } }
    await view.show(<FitsImage active={active} timestamp={1900} onPixelHover={hover} />)
    view.frame()
    expect(material.visible).toBe(true)
    expect(hover.mock.lastCall[0].active).toBe(active)
    expect(mesh.geometry).toBe(geometry)
    expect(mesh.material).toBe(material)
    expect(material.uniforms.pixels.value).toBe(texture)
  } finally { now.mockRestore(); await view.close() }
})
