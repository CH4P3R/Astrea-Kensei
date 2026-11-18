import { Canvas } from '@react-three/fiber'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import SkyScene from '../../three/core/SkyScene.jsx'
import useObserver from '../../hooks/useObserver.js'
import ContextToolbar from '../controls/ContextToolbar.jsx'
import useSkyClock from '../../hooks/useSkyClock.js'
import useFitsImage from '../../hooks/useFitsImage.js'
import useContextMenu from '../../hooks/useContextMenu.js'
import useGroundOpacity from '../../hooks/useGroundOpacity.js'
import Tooltip from '../common/Tooltip.jsx'
import StatusNotice from '../common/StatusNotice.jsx'
import { cutoutSizeError } from '../../config/search.js'
import { SKY_DUST } from '../../config/skyDust.js'
import { DEEP_SKY } from '../../config/deepSky.js'
import useStars from '../../hooks/useStars.js'
import useSolarSystem from '../../hooks/useSolarSystem.js'
import useTranslation from '../../i18n/useTranslation.js'
import LanguageSelect from '../controls/LanguageSelect.jsx'
import ImageInspector from './ImageInspector.jsx'
import useImageViewport from '../../hooks/useImageViewport.js'
import useImageComparison from '../../hooks/useImageComparison.js'
import useComparisonPresentation from '../../hooks/useComparisonPresentation.js'
import useProjectedImage from '../../hooks/useProjectedImage.js'
import ConfirmRegionModal from '../common/ConfirmRegionModal.jsx'
import PixelTooltip from '../controls/PixelTooltip.jsx'
import { createPixelHoverStore } from '../controls/pixelHoverStore.js'
import useSkyUrl from '../../share/useSkyUrl.js'
import { sharedReferenceObserver } from '../../share/referenceObserver.js'

export default function AppWorkspace({ onOpenAbout }) {
  const { t, language } = useTranslation()
  const rootRef = useRef(null)
  const pixelHover = useMemo(() => createPixelHoverStore(), [])
  const clearPixelHover = useCallback(() => pixelHover.publish(null), [pixelHover])
  const compassMarkerRef = useRef(null)
  const restoreUrlRef = useRef(null)
  const onRestore = useCallback((state) => restoreUrlRef.current?.(state), [])
  const skyUrl = useSkyUrl({ onRestore })
  const sharedStartup = Boolean(skyUrl.initialSearch)
  const location = useObserver({ initialObserver: sharedStartup ? sharedReferenceObserver : null,
    automatic: !sharedStartup })
  const clock = useSkyClock()
  const fits = useFitsImage(location.observer, clock.context, {
    initialSearch: skyUrl.initialSearch,
    onCommittedChange: skyUrl.sync,
  })
  const { committed, commitPending } = fits
  const { shareHref } = skyUrl
  const getShareHref = useCallback(() => shareHref(committed), [shareHref, committed])
  const share = { getHref: getShareHref, disabled: !committed || commitPending }
  const [solarVisible, setSolarVisible] = useState(true)
  const solarSystem = useSolarSystem(location.observer, clock.context, clock.timestamp, solarVisible)
  const stars = useStars(location.observer, clock.context, clock.timestamp)
  const starsNotice = useMemo(() => stars.status === 'loading' && !stars.snapshot
    ? { status: 'loading', message: 'sky.status.loadingNotice', icon: 'star' } : null,
  [stars.status, stars.snapshot])
  const historyNotice = useMemo(() => skyUrl.warning === 'share.notices.history'
    ? { status: 'error', message: skyUrl.warning } : null, [skyUrl.warning])
  const [surfaceVisible, setSurfaceVisible] = useState(true)
  const [groundOpacity, setGroundOpacity] = useGroundOpacity()
  const [dustVisible, setDustVisible] = useState(SKY_DUST.enabled)
  const [deepSkyVisible, setDeepSkyVisible] = useState(DEEP_SKY.enabled)
  const [skyGuides, setSkyGuides] = useState({ constellations: true, ecliptic: false, equatorial: false })
  const [notice, setNotice] = useState(null)
  const [tab, setTab] = useState('data')
  const [focusVersion, setFocusVersion] = useState(0)
  const [searchDirection, setSearchDirection] = useState(null)
  const [pendingRegion, setPendingRegion] = useState(null)
  const activeId = fits.active?.metadata.id
  const inspectorOpen = Boolean(activeId)
  const menu = useContextMenu()
  const { observer } = location
  const comparison = useImageComparison(fits.active, inspectorOpen && tab === 'compare', observer, clock.context, fits.textureLimit)
  const baseProjection = useProjectedImage(fits.active, observer, clock.context, clock.timestamp)
  const detailProjection = useProjectedImage(tab === 'compare' ? null : fits.detail, observer, clock.context, clock.timestamp)
  const primaryImage = detailProjection.ready ? fits.detail : fits.active
  const singleImages = useMemo(() => primaryImage ? [primaryImage] : [], [primaryImage])
  const { frames, projections, primaryProjection, appearance, playback, reason, displayed, frameImages: comparisonFrames, layers }
    = useComparisonPresentation(tab === 'compare' ? comparison : { ...comparison, images: singleImages },
      observer, clock.context, clock.timestamp, fits.status)
  const viewport = useImageViewport(rootRef, `${inspectorOpen}:${menu.active}:${language}:${activeId}:${fits.notice?.status}:${tab}`)
  const frameImages = useMemo(() => tab === 'compare' ? comparisonFrames
    : baseProjection.ready ? [baseProjection.image] : [],
  [tab, comparisonFrames, baseProjection.ready, baseProjection.image])
  const { size, search, applyUrl } = fits
  const { open } = menu
  useEffect(() => {
    restoreUrlRef.current = (state) => {
      setPendingRegion(null)
      setSearchDirection(null)
      applyUrl(state)
      if (state.status === 'invalid') open('search')
    }
  }, [applyUrl, open])
  useEffect(() => { if (activeId) open(null) }, [activeId, open])
  useEffect(() => {
    if (skyUrl.initialSearch) open('search')
  }, [skyUrl.initialSearch, open])
  useEffect(() => {
    if (skyUrl.warning === 'share.notices.invalid') open('search')
  }, [skyUrl.warning, open])
  const onSkyClick = useCallback((direction, point) => {
    const reason = !observer ? 'location' : cutoutSizeError(size) ? 'size' : null
    if (reason) {
      setNotice((previous) => ({ id: (previous?.id ?? 0) + 1, point, reason }))
      return
    }
    setNotice(null)
    if (searchDirection || activeId) {
      setPendingRegion({ direction, observer, context: clock.context })
      return
    }
    setSearchDirection(direction)
    open('search')
    search(direction)
    return true
  }, [observer, size, search, open, activeId, searchDirection, clock.context])
  const regionConfirmationOpen = pendingRegion
    && pendingRegion.observer === observer && pendingRegion.context === clock.context
  const dismissRegion = () => {
    setPendingRegion(null)
    requestAnimationFrame(() => rootRef.current?.focus({ preventScroll: true }))
  }
  const confirmRegion = () => {
    if (!regionConfirmationOpen) return
    const { direction } = pendingRegion
    dismissRegion()
    playback.pause()
    setTab('data')
    setSearchDirection(direction)
    open('search')
    search(direction)
  }
  const locating = location.status === 'loading'
  const noticeMessage = notice?.reason === 'location' && !observer
    ? locating ? 'location.notices.locating'
      : location.error || 'location.notices.required'
    : notice?.reason === 'size' ? cutoutSizeError(size) : ''

  return (<>
    <main ref={rootRef} tabIndex={-1} className="app-viewport"
      data-inspector-open={inspectorOpen} aria-label={t('common.viewport')}>
      <div className="scene-layer" aria-label={t('common.scene')}
        onPointerLeave={clearPixelHover} onPointerDown={clearPixelHover}>
        <Canvas orthographic camera={{ position: [0, 0, 0], near: 0.01, far: 250 }}>
          <SkyScene observer={observer} fits={fits} stars={stars} solarSystem={solarSystem} surfaceVisible={surfaceVisible} dustVisible={dustVisible} skyGuides={skyGuides}
            deepSkyVisible={deepSkyVisible}
            groundOpacity={groundOpacity}
            timestamp={clock.timestamp} onSkyClick={onSkyClick} frameImages={frameImages} viewport={viewport} focusVersion={focusVersion}
            layers={layers} appearance={appearance} frameId={playback.frameId}
            onImageZoom={tab === 'compare' ? undefined : fits.refine}
            searchDirection={searchDirection} compassMarkerRef={compassMarkerRef} onPixelHover={pixelHover.publish} />
        </Canvas>
      </div>
      <div className="ui-layer" onPointerOver={clearPixelHover}>
        <PixelTooltip store={pixelHover} />
        <ContextToolbar clock={clock} location={location} fits={fits} menu={menu} warning={skyUrl.warning} share={share}
          stars={stars} surfaceVisible={surfaceVisible} setSurfaceVisible={setSurfaceVisible}
          groundOpacity={groundOpacity} setGroundOpacity={setGroundOpacity}
          dustVisible={dustVisible} setDustVisible={setDustVisible}
          deepSkyVisible={deepSkyVisible} setDeepSkyVisible={setDeepSkyVisible}
          skyGuides={skyGuides} setSkyGuides={setSkyGuides}
          solarSystem={solarSystem} solarVisible={solarVisible} setSolarVisible={setSolarVisible}
          compassMarkerRef={compassMarkerRef} />
        <LanguageSelect onOpenAbout={onOpenAbout ? () => { playback.pause(); onOpenAbout() } : undefined} />
        <ImageInspector open={inspectorOpen} tab={tab} fits={fits} displayed={displayed} appearance={appearance}
          comparison={comparison} playback={playback} reason={t(reason)} primaryProjection={primaryProjection} frames={frames} projections={projections}
          share={share}
          referenceObserver={observer?.source === 'reference'}
          onTabChange={(value) => { playback.pause(); setTab(value) }}
          onClose={() => { playback.pause(); fits.reset(); setSearchDirection(null); setPendingRegion(null); setTab('data'); open(null)
            requestAnimationFrame(() => rootRef.current?.focus({ preventScroll: true })) }}
          onCenter={() => { fits.refine(1); setFocusVersion((value) => value + 1) }} />
        <div className="status-region">
          <StatusNotice notice={historyNotice ?? starsNotice ?? fits.notice} duration={historyNotice ? 0 : undefined} />
        </div>
        {notice && <Tooltip key={notice.id} point={notice.point} message={t(noticeMessage)} open
          tone={notice.reason === 'location' && locating ? 'info' : 'error'} />}
      </div>
    </main>
    {regionConfirmationOpen && <ConfirmRegionModal onConfirm={confirmRegion} onCancel={dismissRegion} />}
    </>
  )
}
