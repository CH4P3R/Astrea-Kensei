import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Line } from '@react-three/drei'
import { CanvasTexture, SRGBColorSpace } from 'three'
import { SKY } from '../../config/sky.js'
import { equatorialGrid } from '../core/skyGuideUtils.js'

const ignoreRaycast = () => {}
const labelWidth = 44
const labelHeight = 22

function GridLabel({ text, position, axis }) {
  const sprite = useRef(null)
  useEffect(() => {
    const canvas = document.createElement('canvas')
    canvas.width = labelWidth * 3
    canvas.height = labelHeight * 3
    const context = canvas.getContext('2d')
    if (!context) return
    context.scale(3, 3)
    context.font = '500 11px "Segoe UI", sans-serif'
    context.textAlign = 'center'
    context.textBaseline = 'middle'
    context.fillStyle = '#91b9d6'
    context.fillText(text, labelWidth / 2, labelHeight / 2)
    const texture = new CanvasTexture(canvas)
    texture.colorSpace = SRGBColorSpace
    const material = sprite.current.material
    material.map = texture
    material.needsUpdate = true
    return () => { material.map = null; texture.dispose() }
  }, [text])
  useFrame(({ camera }) => {
    // Keep numbers legible without growing over the sky while zooming.
    sprite.current.scale.set(labelWidth / camera.zoom, labelHeight / camera.zoom, 1)
  })
  return <sprite ref={sprite} position={position} raycast={ignoreRaycast}
    center={axis === 'ra' ? [0.5, -0.1] : [-0.05, 0.5]} renderOrder={1}>
    <spriteMaterial transparent depthTest={false} depthWrite={false} toneMapped={false} opacity={0.75} />
  </sprite>
}

export default function EquatorialGrid() {
  const { meridians, parallels, equator, labels } = useMemo(() =>
    equatorialGrid(SKY.radius, SKY.raStep, SKY.decStep), [])

  return (
    <group>
      <Line points={meridians} segments color="#5d849f" lineWidth={0.65}
        transparent opacity={0.35} depthWrite={false} toneMapped={false} raycast={ignoreRaycast} />
      <Line points={parallels} segments color="#5d849f" lineWidth={0.65}
        transparent opacity={0.35} depthWrite={false} toneMapped={false} raycast={ignoreRaycast} />
      <Line points={equator} segments color="#91b9d6" lineWidth={1}
        transparent opacity={0.6} depthWrite={false} toneMapped={false} raycast={ignoreRaycast} />
      {labels.map((label) => <GridLabel key={label.id} {...label} />)}
    </group>
  )
}
