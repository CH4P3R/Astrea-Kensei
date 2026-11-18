import { useCallback, useMemo } from 'react'
import useProjectedImages from './useProjectedImages.js'

export default function useProjectedImage(active, observer, timeContext, timestamp) {
  const images = useMemo(() => active ? [active] : [], [active])
  const projections = useProjectedImages(images, observer, timeContext, timestamp)
  const imageId = active?.metadata.id
  const retryProjection = projections.retry
  const retry = useCallback(() => retryProjection(imageId), [imageId, retryProjection])
  return { ...(projections.byId[imageId] ?? { image: null, ready: false, error: '' }), retry }
}
