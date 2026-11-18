import { useMemo, useRef } from 'react'
import catalogue from '../../data/constellations/lines.json'
import { SKY } from '../../config/sky.js'
import { constellationLabels } from '../core/constellationLabelUtils.js'
import ConstellationLines from './ConstellationLines.jsx'
import ConstellationNames from './ConstellationNames.jsx'

export default function Constellations() {
  const labels = useMemo(() => constellationLabels(catalogue.features, SKY.radius), [])
  const visibility = useRef(new Float32Array(labels.length))

  return <>
    <ConstellationNames labels={labels} visibility={visibility} />
    <ConstellationLines labels={labels} visibility={visibility} />
  </>
}
