import { useMemo } from 'react'
import { Line } from '@react-three/drei'
import { SKY } from '../../config/sky.js'
import { eclipticPoints } from '../core/skyGuideUtils.js'

const ignoreRaycast = () => {}

export default function Ecliptic({ timestamp }) {
  // The plane changes far less than a pixel per day. Its local orientation still
  // follows the full clock timestamp through the parent EquatorialFrame.
  const day = Math.floor(timestamp / 86400000) * 86400000
  const points = useMemo(() => eclipticPoints(day, SKY.radius), [day])
  return <Line points={points} color="#d6b46e" lineWidth={1.25}
    transparent opacity={0.8} depthWrite={false} toneMapped={false} raycast={ignoreRaycast} />
}
