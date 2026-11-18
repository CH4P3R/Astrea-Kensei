import { useEffect, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { BufferAttribute, BufferGeometry, Color, ShaderMaterial } from 'three'
import { SKY } from '../../config/sky.js'
import catalogue from '../../data/constellations/lines.json'
import { CONSTELLATION_LABEL_OPACITY, constellationLineData } from '../core/constellationLabelUtils.js'

const ignoreRaycast = () => {}
const isVisible = (opacity) => opacity > 0.005

function createResources(labels, opacities) {
  const data = constellationLineData(catalogue.features, labels, SKY.radius)
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(data.positions, 3))
  geometry.setAttribute('figure', new BufferAttribute(data.figures, 1))
  const material = new ShaderMaterial({
    uniforms: { figureOpacity: { value: opacities }, color: { value: new Color('#8ba9c4') } },
    vertexShader: `
      attribute float figure;
      uniform float figureOpacity[${labels.length}];
      varying float alpha;
      void main() {
        alpha = figureOpacity[int(figure)];
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 color;
      varying float alpha;
      void main() {
        if (alpha < 0.005) discard;
        gl_FragColor = vec4(color, alpha * ${(0.55 / CONSTELLATION_LABEL_OPACITY).toFixed(8)});
        #include <colorspace_fragment>
      }
    `,
    transparent: true, depthWrite: false, depthTest: false, toneMapped: false,
  })
  return { geometry, material }
}

export default function ConstellationLines({ labels, visibility }) {
  const lines = useRef(null)
  useEffect(() => {
    const next = createResources(labels, visibility.current)
    lines.current.geometry = next.geometry
    lines.current.material = next.material
    return () => {
      next.geometry.dispose()
      next.material.dispose()
    }
  }, [labels, visibility])

  // Names update the shared buffer after the camera (-1), before this check.
  // Only 89 uniform values change; line vertices never need per-frame uploads.
  useFrame(() => {
    lines.current.visible = visibility.current.some(isVisible)
  }, -0.4)

  return <lineSegments ref={lines} visible={false} raycast={ignoreRaycast} frustumCulled={false} dispose={null} />
}
