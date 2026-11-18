import { useEffect, useLayoutEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { BufferAttribute, BufferGeometry, DataTexture, DoubleSide, FloatType, Matrix4, NearestFilter, Raycaster, RedFormat, ShaderMaterial, Sphere, Vector2, Vector3 } from 'three'
import { SKY } from '../../config/sky.js'
import { IMAGE_PALETTE_GLSL, imagePaletteIndex } from '../../config/appearance.js'
import { sampleWindow } from '../core/imageDataUtils.js'
import { pixelFromUv } from '../core/pixelInfoUtils.js'

// Comparison frames share one passive pointer tracker. A newly mounted frame can
// inspect the current cursor without requiring another physical pointer move.
const pointerSources = new WeakMap()
function subscribePointer(canvas, notify) {
  let source = pointerSources.get(canvas)
  if (!source) {
    source = { inside: false, pressed: false, clientX: 0, clientY: 0, version: 0, listeners: new Set() }
    const announce = () => { source.version += 1; for (const listener of source.listeners) listener() }
    const move = (event) => {
      source.inside = event.pointerType !== 'touch' && event.isPrimary !== false
        && Number.isFinite(event.clientX) && Number.isFinite(event.clientY)
      source.pressed = Boolean(event.buttons)
      source.clientX = event.clientX
      source.clientY = event.clientY
      announce()
    }
    const leave = () => { source.inside = false; announce() }
    const press = (event) => { move(event); source.pressed = true; announce() }
    const lostCapture = () => { if (source.pressed) source.inside = false; announce() }
    const handlers = { pointerenter: move, pointermove: move, pointerleave: leave,
      pointerdown: press, pointerup: move, pointercancel: leave, lostpointercapture: lostCapture }
    for (const [name, handler] of Object.entries(handlers)) canvas.addEventListener(name, handler, { passive: true })
    source.disconnect = () => {
      for (const [name, handler] of Object.entries(handlers)) canvas.removeEventListener(name, handler)
      pointerSources.delete(canvas)
    }
    pointerSources.set(canvas, source)
  }
  source.listeners.add(notify)
  return { source, disconnect: () => {
    source.listeners.delete(notify)
    if (!source.listeners.size) source.disconnect()
  } }
}

function clearHover(hover) {
  const previous = hover.current
  if (!previous) return
  hover.current = null
  previous.callback(null, previous.active.metadata.id)
}

function createGeometry(projection) {
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(projection.directions[0].length), 3))
  geometry.setAttribute('uv', new BufferAttribute(new Float32Array(projection.uv), 2))
  geometry.setIndex(projection.indices)
  // Every vertex remains on the sky sphere. A stable conservative bound avoids
  // stale raycast bounds when a refreshed projection moves the image.
  geometry.boundingSphere = new Sphere(new Vector3(), SKY.radius + 0.001)
  return geometry
}

const sameValues = (first, second) => first === second
  || (first.length === second.length && first.every((value, index) => value === second[index]))

function sameTopology(first, second) {
  return first.directions[0].length === second.directions[0].length
    && sameValues(first.uv, second.uv) && sameValues(first.indices, second.indices)
}

function createResources(active, pixels) {
  const { metadata, projection } = active
  const texture = new DataTexture(pixels.values, metadata.image.width, metadata.image.height, RedFormat, FloatType)
  texture.minFilter = NearestFilter
  texture.magFilter = NearestFilter
  texture.generateMipmaps = false
  texture.flipY = false
  texture.needsUpdate = true
  const geometry = createGeometry(projection)
  const material = new ShaderMaterial({
    uniforms: { pixels: { value: texture }, exposure: { value: 0 }, opacity: { value: 1 }, palette: { value: 0 } },
    vertexShader: `varying vec2 imageUv;
      void main() { imageUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform sampler2D pixels; uniform float exposure; uniform float opacity; uniform float palette; varying vec2 imageUv;
      ${IMAGE_PALETTE_GLSL}
      void main() {
        float value = texture2D(pixels, imageUv).r;
        if (value < 0.0) discard;
        float scaled = value * 10.0 * exp2(exposure);
        float intensity = clamp(log(scaled + sqrt(scaled * scaled + 1.0)) / 2.99822295, 0.0, 1.0);
        vec3 color = imagePalette(intensity, palette);
        gl_FragColor = vec4(color, opacity);
        #include <colorspace_fragment>
      }`,
    side: DoubleSide,
    depthWrite: false,
    depthTest: false,
    transparent: true,
    toneMapped: false,
  })
  return { texture, geometry, material, topology: projection, projection: null, positionVersion: 0 }
}

function updateResources(current, active, pixels) {
  const { width, height } = active.metadata.image
  if (current.texture.image.data !== pixels.values || current.texture.image.width !== width || current.texture.image.height !== height) {
    current.texture.image = { data: pixels.values, width, height }
    current.texture.needsUpdate = true
  }
  if (!sameTopology(current.topology, active.projection)) {
    current.geometry.dispose()
    current.geometry = createGeometry(active.projection)
    current.projection = null
  }
  current.topology = active.projection
}

function updateDisplay(current, active, settings, timestamp, visible) {
  const projection = active.projection
  const now = active.timeContext?.mode === 'paused' ? timestamp : Date.now()
  current.material.visible = visible && now >= projection.sample_times_ms[0] && now <= projection.sample_times_ms.at(-1)
  current.material.uniforms.exposure.value = settings?.exposure ?? 0
  current.material.uniforms.opacity.value = settings?.opacity ?? 1
  current.material.uniforms.palette.value = imagePaletteIndex(settings?.palette)
  const [a, b, fraction] = sampleWindow(projection.sample_times_ms, now)
  if (current.projection === projection && current.a === a && current.b === b && current.fraction === fraction) return
  const positions = current.geometry.attributes.position
  const first = projection.directions[a]
  const second = projection.directions[b]
  for (let i = 0; i < positions.count; i += 1) {
    const offset = i * 3
    const x = first[offset] + (second[offset] - first[offset]) * fraction
    const y = first[offset + 1] + (second[offset + 1] - first[offset + 1]) * fraction
    const z = first[offset + 2] + (second[offset + 2] - first[offset + 2]) * fraction
    const scale = SKY.radius / Math.hypot(x, y, z)
    positions.setXYZ(i, x * scale, y * scale, z * scale)
  }
  positions.needsUpdate = true
  Object.assign(current, { projection, a, b, fraction, positionVersion: current.positionVersion + 1 })
}

export default function FitsImage({ active, pixels = active.pixels, settings, timestamp, visible = true, onPixelHover }) {
  const resources = useRef(null)
  const mesh = useRef(null)
  const hover = useRef(null)
  const pointerSource = useRef(null)
  const pickingRef = useRef(null)
  const { gl, invalidate } = useThree()
  const hoverEnabled = Boolean(onPixelHover)

  useLayoutEffect(() => {
    const picking = pickingRef.current ?? { raycaster: new Raycaster(), pointer: new Vector2(), hits: [],
      cameraWorld: new Matrix4(), cameraProjection: new Matrix4(), meshWorld: new Matrix4(), version: -1, positionVersion: -1 }
    pickingRef.current = picking
    const current = resources.current ?? createResources(active, pixels)
    resources.current = current
    updateResources(current, active, pixels)
    updateDisplay(current, active, settings, timestamp, visible)
    mesh.current.geometry = current.geometry
    mesh.current.material = current.material
    if (hover.current && (hover.current.active.metadata.id !== active.metadata.id || !hoverEnabled
      || !current.material.visible || !(current.material.uniforms.opacity.value > 0))) clearHover(hover)
    picking.version = -1
  }, [active, pixels, settings, timestamp, visible, onPixelHover, hoverEnabled])

  useLayoutEffect(() => () => {
    clearHover(hover)
    const current = resources.current
    current?.texture.dispose()
    current?.geometry.dispose()
    current?.material.dispose()
    resources.current = null
  }, [])

  useEffect(() => {
    if (!hoverEnabled) return
    const subscription = subscribePointer(gl.domElement, () => {
      if (!subscription.source.inside || subscription.source.pressed) clearHover(hover)
      invalidate()
    })
    pointerSource.current = subscription.source
    return () => {
      pointerSource.current = null
      clearHover(hover)
      subscription.disconnect()
    }
  }, [gl, invalidate, hoverEnabled])

  useFrame(({ camera }) => {
    const current = resources.current
    const picking = pickingRef.current
    if (!current) return
    updateDisplay(current, active, settings, timestamp, visible)
    const pointer = pointerSource.current
    if (!onPixelHover || !pointer?.inside || pointer.pressed || !mesh.current.visible
      || !current.material.visible || !(current.material.uniforms.opacity.value > 0)) {
      clearHover(hover)
      return
    }
    // Pointer capture may deliver pointerup to the canvas while the cursor is
    // already over the inspector. Never revive a tooltip through a DOM overlay.
    const document = gl.domElement.ownerDocument
    if (typeof document.elementFromPoint === 'function'
      && document.elementFromPoint(pointer.clientX, pointer.clientY) !== gl.domElement) {
      clearHover(hover)
      picking.version = -1
      return
    }
    camera.updateMatrixWorld()
    mesh.current.updateWorldMatrix(true, false)
    if (picking.version === pointer.version && picking.positionVersion === current.positionVersion
      && picking.cameraWorld.equals(camera.matrixWorld) && picking.cameraProjection.equals(camera.projectionMatrix)
      && picking.meshWorld.equals(mesh.current.matrixWorld)) return
    picking.version = pointer.version
    picking.positionVersion = current.positionVersion
    picking.cameraWorld.copy(camera.matrixWorld)
    picking.cameraProjection.copy(camera.projectionMatrix)
    picking.meshWorld.copy(mesh.current.matrixWorld)
    const bounds = gl.domElement.getBoundingClientRect()
    const x = (pointer.clientX - bounds.left) / bounds.width
    const y = (pointer.clientY - bounds.top) / bounds.height
    if (!(x >= 0 && x <= 1 && y >= 0 && y <= 1)) { clearHover(hover); return }
    picking.pointer.set(x * 2 - 1, 1 - y * 2)
    picking.raycaster.setFromCamera(picking.pointer, camera)
    picking.hits.length = 0
    picking.raycaster.intersectObject(mesh.current, false, picking.hits)
    const intersection = picking.hits[0]
    const pixel = intersection?.uv && pixelFromUv(intersection.uv, active.metadata.image)
    if (!pixel) { clearHover(hover); return }
    const previous = hover.current
    if (previous && previous.index === pixel.index && previous.active === active && previous.pixels === pixels
      && previous.callback === onPixelHover && previous.clientX === pointer.clientX && previous.clientY === pointer.clientY) return
    const hit = { uv: { x: intersection.uv.x, y: intersection.uv.y }, clientX: pointer.clientX, clientY: pointer.clientY, active, pixels }
    hover.current = { ...hit, index: pixel.index, callback: onPixelHover }
    onPixelHover(hit, active.metadata.id)
  })

  return <mesh ref={mesh} visible={visible} frustumCulled={false} dispose={null} />
}
