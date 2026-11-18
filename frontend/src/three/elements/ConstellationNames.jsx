import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { BufferAttribute, CanvasTexture, DynamicDrawUsage, InstancedBufferAttribute,
  InstancedBufferGeometry, LinearFilter, Matrix4, ShaderMaterial, SRGBColorSpace, Vector2, Vector3 } from 'three'
import { constellationLabelOpacity, selectConstellationLabels, updateConstellationOpacities } from '../core/constellationLabelUtils.js'
import { baseOrthographicZoom } from '../core/skyViewUtils.js'

const ignoreRaycast = () => {}
const labelHeight = 22
const atlasScale = 2
const cellWidth = 256
const cellHeight = labelHeight * atlasScale
const columns = 4

function createResources(labels, opacities) {
  const canvas = document.createElement('canvas')
  canvas.width = columns * cellWidth
  canvas.height = Math.ceil(labels.length / columns) * cellHeight
  const context = canvas.getContext('2d')
  if (!context) return null
  context.font = '500 24px "Segoe UI", sans-serif'
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  context.fillStyle = '#d4d0c4'
  context.shadowColor = 'rgba(0, 0, 0, 0.8)'
  context.shadowBlur = 4

  const anchors = new Float32Array(labels.length * 3)
  const rects = new Float32Array(labels.length * 4)
  const widths = new Float32Array(labels.length)
  const candidates = labels.map((label, index) => {
    const width = Math.min(cellWidth, Math.ceil(context.measureText(label.text).width) + 24)
    const x = index % columns * cellWidth
    const y = Math.floor(index / columns) * cellHeight
    context.fillText(label.text, x + width / 2, y + cellHeight / 2, width - 16)
    anchors.set(label.position, index * 3)
    rects.set([x / canvas.width, 1 - (y + cellHeight) / canvas.height,
      (x + width) / canvas.width, 1 - y / canvas.height], index * 4)
    widths[index] = width / atlasScale
    return { index, x: 0, y: 0, width: widths[index], height: labelHeight, score: 0, inFront: false, selected: false }
  })
  const atlas = new CanvasTexture(canvas)
  atlas.colorSpace = SRGBColorSpace
  atlas.generateMipmaps = false
  atlas.minFilter = LinearFilter
  atlas.magFilter = LinearFilter

  const geometry = new InstancedBufferGeometry()
  geometry.setIndex([0, 1, 2, 0, 2, 3])
  geometry.setAttribute('position', new BufferAttribute(new Float32Array([
    -0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0,
  ]), 3))
  geometry.setAttribute('uv', new BufferAttribute(new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]), 2))
  geometry.setAttribute('anchor', new InstancedBufferAttribute(anchors, 3))
  geometry.setAttribute('atlasRect', new InstancedBufferAttribute(rects, 4))
  geometry.setAttribute('labelWidth', new InstancedBufferAttribute(widths, 1))
  geometry.setAttribute('labelOpacity', new InstancedBufferAttribute(opacities, 1).setUsage(DynamicDrawUsage))
  geometry.instanceCount = labels.length
  const material = new ShaderMaterial({
    uniforms: { atlas: { value: atlas }, viewport: { value: new Vector2(1, 1) } },
    vertexShader: `
      attribute vec3 anchor;
      attribute vec4 atlasRect;
      attribute float labelWidth;
      attribute float labelOpacity;
      uniform vec2 viewport;
      varying vec2 labelUv;
      varying float opacity;
      void main() {
        vec4 center = projectionMatrix * modelViewMatrix * vec4(anchor, 1.0);
        center.xy += position.xy * vec2(labelWidth, ${labelHeight.toFixed(1)}) * 2.0 / viewport * center.w;
        gl_Position = center;
        labelUv = mix(atlasRect.xy, atlasRect.zw, uv);
        opacity = labelOpacity;
      }
    `,
    fragmentShader: `
      uniform sampler2D atlas;
      varying vec2 labelUv;
      varying float opacity;
      void main() {
        if (opacity < 0.005) discard;
        vec4 text = texture2D(atlas, labelUv);
        if (text.a < 0.01) discard;
        gl_FragColor = vec4(text.rgb, text.a * opacity);
        #include <colorspace_fragment>
      }
    `,
    transparent: true, depthWrite: false, depthTest: false, toneMapped: false,
  })
  return { geometry, material, atlas, candidates, selected: [], scratch: [] }
}

function updateLabels(current, labels, camera, size, mesh, viewMatrix, point, delta) {
  const zoom = camera.zoom / baseOrthographicZoom(size.width, size.height)
  const targetOpacity = constellationLabelOpacity(zoom)
  const opacity = current.geometry.attributes.labelOpacity
  mesh.visible = targetOpacity > 0
  if (!mesh.visible) {
    current.selected.length = 0
    updateConstellationOpacities(current.candidates, current.selected, opacity.array, 0, delta)
    opacity.needsUpdate = true
    return
  }
  // Parent matrices include date and observer orientation, which must be current
  // before CPU visibility selection as well as before the background render.
  mesh.updateWorldMatrix(true, false)
  camera.updateMatrixWorld()
  viewMatrix.multiplyMatrices(camera.matrixWorldInverse, mesh.matrixWorld)
  current.material.uniforms.viewport.value.set(size.width, size.height)
  for (let index = 0; index < labels.length; index += 1) {
    const candidate = current.candidates[index]
    point.fromArray(labels[index].position).applyMatrix4(viewMatrix)
    candidate.inFront = point.z < -camera.near && point.z > -camera.far
    point.applyMatrix4(camera.projectionMatrix)
    candidate.x = (point.x + 1) * size.width / 2
    candidate.y = (1 - point.y) * size.height / 2
    // A small retention preference keeps nearly tied labels from flickering.
    candidate.score = point.x * point.x + point.y * point.y - (candidate.selected ? 0.05 : 0)
  }
  selectConstellationLabels(current.candidates, size.width, size.height, current.selected, current.scratch)
  mesh.visible = updateConstellationOpacities(current.candidates, current.selected, opacity.array, targetOpacity, delta)
  opacity.needsUpdate = true
}

export default function ConstellationNames({ labels, visibility }) {
  const mesh = useRef(null)
  const resources = useRef(null)
  const viewMatrix = useMemo(() => new Matrix4(), [])
  const point = useMemo(() => new Vector3(), [])

  useEffect(() => {
    const opacities = visibility.current
    const next = createResources(labels, opacities)
    resources.current = next
    if (!next) return
    mesh.current.geometry = next.geometry
    mesh.current.material = next.material
    return () => {
      next.geometry.dispose()
      next.material.dispose()
      next.atlas.dispose()
      opacities.fill(0)
      resources.current = null
    }
  }, [labels, visibility])

  useFrame(({ camera, size }, delta) => {
    const current = resources.current
    if (!current) return
    updateLabels(current, labels, camera, size, mesh.current, viewMatrix, point, delta)
  }, -0.5)

  // One texture and one instanced draw call for every label; no DOM overlays,
  // per-frame React updates, downloaded fonts, or individual sprite textures.
  return <mesh ref={mesh} raycast={ignoreRaycast} frustumCulled={false} renderOrder={2} dispose={null} />
}
