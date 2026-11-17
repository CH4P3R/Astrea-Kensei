import { useEffect, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { CanvasTexture, MathUtils, SRGBColorSpace } from 'three'
import { SKY } from '../../config/sky.js'
import { baseOrthographicZoom, compactDirectionsAtZoom } from '../core/skyViewUtils.js'
import useTranslation from '../../i18n/useTranslation.js'

const directions = [
  { id: 'north', position: [0, 0, -SKY.radius] },
  { id: 'east', position: [SKY.radius, 0, 0] },
  { id: 'south', position: [0, 0, SKY.radius] },
  { id: 'west', position: [-SKY.radius, 0, 0] },
]
const ignoreRaycast = () => {}
const height = 28

function textTexture(text, width) {
  const canvas = document.createElement('canvas')
  canvas.width = width * 3
  canvas.height = height * 3
  const context = canvas.getContext('2d')
  context.scale(3, 3)
  context.font = '500 14px "Segoe UI", sans-serif'
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  context.fillStyle = '#aabacb'
  context.fillText(text, width / 2, height / 2)
  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  return texture
}

function DirectionLabel({ name, short, position }) {
  const full = useRef(null)
  const initial = useRef(null)
  const compact = useRef(false)

  useEffect(() => {
    const fullMaterial = full.current.material
    const initialMaterial = initial.current.material
    const fullTexture = textTexture(name, 80)
    const initialTexture = textTexture(short, 28)
    fullMaterial.map = fullTexture
    initialMaterial.map = initialTexture
    fullMaterial.needsUpdate = true
    initialMaterial.needsUpdate = true
    return () => {
      fullMaterial.map = null
      initialMaterial.map = null
      fullTexture.dispose()
      initialTexture.dispose()
    }
  }, [name, short])

  useFrame(({ camera, size }, delta) => {
    const relativeZoom = camera.zoom / baseOrthographicZoom(size.width, size.height)
    compact.current = compactDirectionsAtZoom(compact.current, relativeZoom)
    const fullSprite = full.current
    const shortSprite = initial.current
    // A fixed CSS-pixel size, rather than text growing with the sphere's zoom.
    fullSprite.scale.set(80 / camera.zoom, height / camera.zoom, 1)
    shortSprite.scale.set(28 / camera.zoom, height / camera.zoom, 1)
    fullSprite.material.opacity = MathUtils.damp(fullSprite.material.opacity, compact.current ? 0 : 0.7, 12, delta)
    shortSprite.material.opacity = MathUtils.damp(shortSprite.material.opacity, compact.current ? 0.7 : 0, 12, delta)
    fullSprite.visible = fullSprite.material.opacity > 0.005
    shortSprite.visible = shortSprite.material.opacity > 0.005
  })

  return (
    <group position={position}>
      <sprite ref={full} raycast={ignoreRaycast} renderOrder={4}>
        <spriteMaterial transparent depthWrite={false} toneMapped={false} opacity={0} />
      </sprite>
      <sprite ref={initial} raycast={ignoreRaycast} renderOrder={4}>
        <spriteMaterial transparent depthWrite={false} toneMapped={false} opacity={0} />
      </sprite>
    </group>
  )
}

export default function HorizonDirections() {
  const { t } = useTranslation()
  return <group>{directions.map(({ id, position }) => <DirectionLabel key={id} position={position}
    name={t(`sky.directions.${id}.name`)} short={t(`sky.directions.${id}.short`)} />)}</group>
}
