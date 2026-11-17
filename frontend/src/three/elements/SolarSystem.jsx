import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Vector3 } from 'three'
import { SKY } from '../../config/sky.js'
import { moonLightInView, sampleSolarBody, solarSnapshotIsCurrent } from '../core/solarSystemUtils.js'
import { solarBodyFragmentShader, solarBodyVertexShader } from '../core/solarBodyMaterial.js'

const ignoreRaycast = () => {}

function SolarBody({ body, snapshot, timestamp }) {
  const mesh = useRef(null)
  const frame = useRef({ direction: [0, 0, 0], lightDirection: [0, 0, 1],
    cameraRight: [1, 0, 0], cameraUp: [0, 1, 0], localLight: [0, 0, 1], angularRadius: 0, illumination: 0 })
  const uniforms = useMemo(() => ({ isSun: { value: body.id === 'sun' ? 1 : 0 },
    lightDirection: { value: new Vector3(0, 0, 1) } }), [body.id])

  useFrame(({ camera }) => {
    const state = frame.current
    const at = snapshot.mode === 'live' ? Date.now() : timestamp
    const visible = solarSnapshotIsCurrent(snapshot, at)
    mesh.current.visible = visible
    if (!visible) return
    sampleSolarBody(body, snapshot.sample_times_ms, at, state)
    mesh.current.position.fromArray(state.direction).multiplyScalar(SKY.radius)
    mesh.current.quaternion.copy(camera.quaternion)
    // Real angular radius; the Sun's larger quad only reserves room for its halo.
    const radius = SKY.radius * Math.sin(state.angularRadius * Math.PI / 180)
    mesh.current.scale.setScalar(radius * (body.id === 'sun' ? 2.5 : 1))
    if (body.id === 'moon') {
      for (let axis = 0; axis < 3; axis += 1) {
        state.cameraRight[axis] = camera.matrixWorld.elements[axis]
        state.cameraUp[axis] = camera.matrixWorld.elements[axis + 4]
      }
      moonLightInView(state.direction, state.lightDirection, state.cameraRight, state.cameraUp, state.localLight)
      uniforms.lightDirection.value.fromArray(state.localLight).normalize()
    }
  })

  return <mesh ref={mesh} visible={false} raycast={ignoreRaycast} renderOrder={2} frustumCulled={false}>
    <planeGeometry args={[2, 2]} />
    <shaderMaterial uniforms={uniforms} vertexShader={solarBodyVertexShader} fragmentShader={solarBodyFragmentShader}
      transparent depthWrite={false} depthTest={false} toneMapped={false} />
  </mesh>
}

export default function SolarSystem({ snapshot, timestamp }) {
  return <group>{snapshot.bodies.map((body) =>
    <SolarBody key={body.id} body={body} snapshot={snapshot} timestamp={timestamp} />)}</group>
}
