import { useMemo } from 'react'
import { Line } from '@react-three/drei'
import { SKY } from '../../config/sky.js'
import catalogue from '../../data/constellations/lines.json'
import { constellationSegments } from '../core/skyGuideUtils.js'

const ignoreRaycast = () => {}

export default function ConstellationLines() {
  const points = useMemo(() => constellationSegments(catalogue.features, SKY.radius), [])
  // One line draw call for all figures; separate segment pairs preserve gaps
  // between different constellations and disconnected parts of the same figure.
  return <Line points={points} segments color="#8ba9c4" lineWidth={1}
    transparent opacity={0.55} depthWrite={false} toneMapped={false} raycast={ignoreRaycast} />
}
