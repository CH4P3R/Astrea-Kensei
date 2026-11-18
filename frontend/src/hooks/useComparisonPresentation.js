import { useMemo } from 'react'
import { compatibleUnits } from '../config/appearance.js'
import { chronologicalFrames } from '../config/comparison.js'
import useProjectedImages from './useProjectedImages.js'
import useImageAppearance from './useImageAppearance.js'
import useBlinkPlayback from './useBlinkPlayback.js'
import { projectionContextKey } from './projectionRefresh.js'

// Keep the comparison's N-frame presentation out of the rest of the viewport.
export default function useComparisonPresentation(comparison, observer, context, timestamp, fitsStatus) {
  const images = comparison.images
  const frames = useMemo(() => chronologicalFrames(images), [images])
  const projections = useProjectedImages(images, observer, context, timestamp)
  const appearance = useImageAppearance(images)
  const unitsMatch = images.slice(1).every((image) => compatibleUnits(images[0], image))
  const reason = images.length < 2 ? 'inspector.compare.needPartner'
    : !unitsMatch ? 'inspector.compare.units'
      : ['searching', 'loading'].includes(fitsStatus) || comparison.status === 'loading' ? 'inspector.compare.busy'
        : !projections.ready ? 'inspector.compare.position'
          : !appearance.ready ? 'inspector.compare.processing'
            : !appearance.hasData ? 'inspector.compare.noData' : ''
  const playback = useBlinkPlayback(frames, !reason, {
    suspended: reason === 'inspector.compare.position' && context.mode === 'live',
    contextKey: projectionContextKey(observer, context),
  })
  const displayed = images.find((image) => image.metadata.id === playback.frameId) ?? images[0]
  const primaryProjection = projections.byId[images[0]?.metadata.id] ?? { ready: false, error: '', image: null }
  const frameImages = useMemo(() => images.map((image) => projections.byId[image.metadata.id])
    .filter((projection) => projection.ready).map((projection) => projection.image), [images, projections.byId])
  const layers = images.map((image, index) => ({ ...projections.byId[image.metadata.id], pixels: appearance.pixels[index] }))
  return { frames, projections, primaryProjection: { ...primaryProjection, retry: () => projections.retry(images[0]?.metadata.id) },
    appearance, playback, reason, displayed, frameImages, layers }
}
