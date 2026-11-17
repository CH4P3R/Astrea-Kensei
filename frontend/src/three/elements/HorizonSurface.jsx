import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { BackSide, MathUtils, Vector3 } from 'three'
import { SKY } from '../../config/sky.js'
import { horizonFragmentShader, horizonVertexShader } from '../core/horizonSurfaceMaterial.js'
import { baseOrthographicZoom } from '../core/skyViewUtils.js'

const ignoreRaycast = () => {}

export default function HorizonSurface({ groundOpacity = 0.22 }) {
  const material = useRef(null)
  const lookDirection = useMemo(() => new Vector3(), [])
  const uniforms = useMemo(() => ({
    groundHeight: { value: -1 },
    surfaceOpacity: { value: 0.28 },
    groundOpacity: { value: 0.22 },
    lineScale: { value: 1 },
  }), [])

  useFrame(({ camera, size }) => {
    if (!material.current) return
    const relativeZoom = camera.zoom / baseOrthographicZoom(size.width, size.height)
    const zoomFade = 1 - MathUtils.smoothstep(relativeZoom, 1, 8)
    camera.getWorldDirection(lookDirection)
    material.current.uniforms.lineScale.value = 1 / Math.max(1, relativeZoom)
    material.current.uniforms.surfaceOpacity.value = 0.28 * (1 - 0.85 * Math.max(0, -lookDirection.y)) * zoomFade
    material.current.uniforms.groundOpacity.value = groundOpacity * zoomFade
    material.current.visible = zoomFade > 0
  })

  // Project the flat guide into sky directions so every ray starts at the observer
  return <mesh raycast={ignoreRaycast} renderOrder={3}>
    <sphereGeometry args={[SKY.radius, 64, 24, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2]} />
    <shaderMaterial ref={material} uniforms={uniforms}
      vertexShader={horizonVertexShader} fragmentShader={horizonFragmentShader}
      transparent side={BackSide} depthWrite={false} toneMapped={false} />
  </mesh>
}
