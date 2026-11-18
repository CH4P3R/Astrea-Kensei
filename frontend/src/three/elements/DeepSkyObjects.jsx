import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { AdditiveBlending, BufferAttribute, BufferGeometry, CanvasTexture, Frustum, LinearFilter,
  LinearMipmapLinearFilter, Matrix4, ShaderMaterial, SRGBColorSpace, TextureLoader } from 'three'
import { SKY } from '../../config/sky.js'
import { DEEP_SKY, deepSkyTextures } from '../../config/deepSky.js'
import { DEEP_SKY_OBJECTS } from '../../data/deepSky/catalog.js'
import { deepSkyDetailOpacity, deepSkyPatch } from '../core/deepSkyUtils.js'

const ignoreRaycast = () => {}

function createResources(object) {
  const patch = deepSkyPatch(object, SKY.radius + 0.2)
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(patch.positions), 3))
  geometry.setAttribute('uv', new BufferAttribute(new Float32Array(patch.uvs), 2))
  geometry.setIndex(patch.indices)
  geometry.computeBoundingSphere()
  const material = new ShaderMaterial({
    uniforms: { illustration: { value: null }, opacity: { value: 0 } },
    vertexShader: `
      varying vec2 imageUv;
      void main() {
        imageUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      uniform sampler2D illustration;
      uniform float opacity;
      varying vec2 imageUv;
      void main() {
        vec3 emission = texture2D(illustration, imageUv).rgb;
        vec2 border = min(imageUv, 1.0 - imageUv);
        vec2 edgeFade = smoothstep(vec2(0.0), vec2(0.12), border);
        // Black adds no light. Preserve faint cloud tails without an alpha cutoff.
        gl_FragColor = vec4(emission, opacity * edgeFade.x * edgeFade.y);
        #include <colorspace_fragment>
      }`,
    transparent: true, blending: AdditiveBlending, depthTest: false, depthWrite: false, toneMapped: false,
  })
  return { geometry, material, texture: null, requested: null, requestTexture: null }
}

function DeepSkyObject({ object, visible }) {
  const mesh = useRef(null)
  const resources = useRef(null)
  const view = useRef({ frustum: new Frustum(), projection: new Matrix4() })
  const { gl, invalidate } = useThree()

  useEffect(() => {
    const next = createResources(object)
    resources.current = next
    mesh.current.geometry = next.geometry
    mesh.current.material = next.material
    let disposed = false
    next.requestTexture = () => {
      if (next.requested || disposed) return
      next.requested = new TextureLoader().load(deepSkyTextures[object.id], (loaded) => {
        if (disposed) { loaded.dispose(); return }
        // Bound GPU memory independently of the original generation resolution.
        // This is ordinary renderer resampling; the saved artwork stays intact.
        const canvas = document.createElement('canvas')
        const size = Math.min(DEEP_SKY.maxTextureSize, gl.capabilities.maxTextureSize)
        canvas.width = size
        canvas.height = size
        const context = canvas.getContext('2d')
        if (!context) { loaded.dispose(); loaded.image = null; return }
        // Emission textures fade to black; keep any letterbox area equally dark.
        context.fillStyle = '#000'
        context.fillRect(0, 0, size, size)
        // The source already includes dark margins; preserve its aspect.
        const scale = size / Math.max(loaded.image.width, loaded.image.height)
        const width = loaded.image.width * scale
        const height = loaded.image.height * scale
        context.drawImage(loaded.image, (size - width) / 2, (size - height) / 2, width, height)
        loaded.dispose()
        loaded.image = null
        const texture = new CanvasTexture(canvas)
        texture.colorSpace = SRGBColorSpace
        texture.minFilter = LinearMipmapLinearFilter
        texture.magFilter = LinearFilter
        next.texture = texture
        next.material.uniforms.illustration.value = texture
        invalidate()
      }, undefined, () => { /* A missing illustration must never delay the sky. */ })
    }
    return () => {
      disposed = true
      next.requested?.dispose()
      next.texture?.dispose()
      next.geometry.dispose()
      next.material.dispose()
      resources.current = null
    }
  }, [object, gl, invalidate])

  useFrame(({ camera }) => {
    const current = resources.current
    if (!current) return
    const angularField = Math.max(...object.displayFieldDeg) * Math.PI / 180
    const diameter = 2 * SKY.radius * Math.sin(angularField / 2) * camera.zoom
    const opacity = visible ? DEEP_SKY.opacity * deepSkyDetailOpacity(diameter) : 0
    current.material.uniforms.opacity.value = opacity
    mesh.current.visible = Boolean(current.texture) && opacity > 0.001
    if (!current.texture && opacity > 0.001) {
      // Fetch an illustration only when its field first enters the camera.
      // The spherical bounds also retain fields partly visible at an edge.
      mesh.current.updateWorldMatrix(true, false)
      view.current.projection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse)
      view.current.frustum.setFromProjectionMatrix(view.current.projection)
      if (view.current.frustum.intersectsObject(mesh.current)) current.requestTexture()
    }
  })

  return <mesh ref={mesh} visible={false} raycast={ignoreRaycast} renderOrder={-1.5} dispose={null} />
}

export default function DeepSkyObjects({ visible = true }) {
  return <group>{DEEP_SKY_OBJECTS.map((object) => <DeepSkyObject key={object.id} object={object} visible={visible} />)}</group>
}
