import { useEffect, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { BufferAttribute, BufferGeometry, DataTexture, DoubleSide, FloatType, NearestFilter, RedFormat, ShaderMaterial } from 'three'
import { SKY } from '../../config/sky.js'
import { IMAGE_PALETTE_GLSL, imagePaletteIndex } from '../../config/appearance.js'
import { sampleWindow } from '../core/imageDataUtils.js'

function createResources(active, pixels) {
  const { metadata, projection } = active
  const texture = new DataTexture(pixels.values, metadata.image.width, metadata.image.height, RedFormat, FloatType)
  texture.minFilter = NearestFilter
  texture.magFilter = NearestFilter
  texture.generateMipmaps = false
  texture.flipY = false
  texture.needsUpdate = true
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(projection.directions[0].length), 3))
  geometry.setAttribute('uv', new BufferAttribute(new Float32Array(projection.uv), 2))
  geometry.setIndex(projection.indices)
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
  return { texture, geometry, material }
}

export default function FitsImage({ active, pixels = active.pixels, settings, timestamp, visible = true }) {
  const resources = useRef(null)
  const mesh = useRef(null)

  useEffect(() => {
    const next = createResources(active, pixels)
    resources.current = next
    mesh.current.geometry = next.geometry
    mesh.current.material = next.material
    return () => {
      next.texture.dispose()
      next.geometry.dispose()
      next.material.dispose()
      resources.current = null
    }
  }, [active, pixels])

  useFrame(() => {
    const currentResources = resources.current
    if (!currentResources) return
    const current = active.projection
    const now = active.timeContext?.mode === 'paused' ? timestamp : Date.now()
    currentResources.material.visible = visible && now >= current.sample_times_ms[0] && now <= current.sample_times_ms.at(-1)
    currentResources.material.uniforms.exposure.value = settings?.exposure ?? 0
    currentResources.material.uniforms.opacity.value = settings?.opacity ?? 1
    currentResources.material.uniforms.palette.value = imagePaletteIndex(settings?.palette)
    const [a, b, fraction] = sampleWindow(current.sample_times_ms, now)
    const positions = currentResources.geometry.attributes.position
    const first = current.directions[a]
    const second = current.directions[b]
    for (let i = 0; i < positions.count; i += 1) {
      const offset = i * 3
      const x = first[offset] + (second[offset] - first[offset]) * fraction
      const y = first[offset + 1] + (second[offset + 1] - first[offset + 1]) * fraction
      const z = first[offset + 2] + (second[offset + 2] - first[offset + 2]) * fraction
      const scale = SKY.radius / Math.hypot(x, y, z)
      positions.setXYZ(i, x * scale, y * scale, z * scale)
    }
    positions.needsUpdate = true
  })

  return <mesh ref={mesh} frustumCulled={false} dispose={null} />
}
