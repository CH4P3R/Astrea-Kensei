import SkyCameraRig from './SkyCameraRig.jsx'
import CelestialSphere from '../elements/CelestialSphere.jsx'
import SkyDust from '../elements/SkyDust.jsx'
import HorizonDirections from '../elements/HorizonDirections.jsx'
import EquatorialFrame from './EquatorialFrame.jsx'
import SkyBackdrop from './SkyBackdrop.jsx'
import { useEffect } from 'react'
import { useThree } from '@react-three/fiber'
import FitsImage from '../elements/FitsImage.jsx'
import Stars from '../elements/Stars.jsx'
import HorizonSurface from '../elements/HorizonSurface.jsx'
import ImageLoadingMarker from '../elements/ImageLoadingMarker.jsx'
import CompassTracking from './CompassTracking.jsx'
import ConstellationLines from '../elements/ConstellationLines.jsx'
import Ecliptic from '../elements/Ecliptic.jsx'
import EquatorialGrid from '../elements/EquatorialGrid.jsx'
import SolarSystem from '../elements/SolarSystem.jsx'
import ConstellationNames from '../elements/ConstellationNames.jsx'

export default function SkyScene({ observer, fits, stars, solarSystem, surfaceVisible, groundOpacity, dustVisible, skyGuides = {}, timestamp, onSkyClick,
  frameImages, viewport, focusVersion, layers, appearance, frameId, onImageZoom, searchDirection, compassMarkerRef }) {
  const { gl } = useThree()
  const { setTextureLimit } = fits
  useEffect(() => {
    setTextureLimit(gl.capabilities.maxTextureSize)
  }, [gl, setTextureLimit])
  return (
    <>
      <SkyCameraRig onSkyClick={onSkyClick} onImageZoom={onImageZoom} images={frameImages} viewport={viewport} focusVersion={focusVersion}
        previewActive={Boolean(fits.active)} selectionPending={['searching', 'loading', 'results'].includes(fits.status)}
        focusRequest={fits.focus} timestamp={timestamp} selectionDirection={searchDirection} />
      <CompassTracking markerRef={compassMarkerRef} />
      <ImageLoadingMarker direction={searchDirection} status={fits.status} />
      {layers.map(({ image, pixels, ready }) => image && pixels && <FitsImage key={image.metadata.id}
        active={image} timestamp={timestamp} pixels={pixels} settings={appearance.settings}
        visible={ready && image.metadata.id === frameId} />)}
      <SkyBackdrop>
        <color attach="background" args={['#060c18']} />
        <EquatorialFrame observer={observer} timestamp={timestamp}>
          <CelestialSphere />
          {dustVisible && <SkyDust />}
          {observer && skyGuides.constellations && <ConstellationLines />}
          {observer && skyGuides.constellations && <ConstellationNames />}
          {observer && skyGuides.ecliptic && <Ecliptic timestamp={timestamp} />}
          {observer && skyGuides.equatorial && <EquatorialGrid />}
        </EquatorialFrame>
        {stars.snapshot && <Stars snapshot={stars.snapshot} timestamp={timestamp} />}
        {solarSystem?.snapshot && <SolarSystem snapshot={solarSystem.snapshot} timestamp={timestamp} />}
        {surfaceVisible && <HorizonSurface groundOpacity={groundOpacity} />}
        <HorizonDirections />
      </SkyBackdrop>
    </>
  )
}
