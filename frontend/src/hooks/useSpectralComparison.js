import { useEffect, useMemo, useSyncExternalStore } from 'react'
import { createSpectralLoader } from '../services/spectralComparison.js'

export default function useSpectralComparison(frames, target) {
  const loader = useMemo(() => createSpectralLoader(), [])
  const selection = JSON.stringify({ ids: frames.map((frame) => frame.id),
    target: { ra_deg: target?.ra_deg, dec_deg: target?.dec_deg } })
  const byId = useSyncExternalStore(loader.subscribe, loader.getSnapshot, loader.getSnapshot)
  useEffect(() => {
    const { ids, target: point } = JSON.parse(selection)
    loader.setImages(ids, point)
  }, [loader, selection])
  useEffect(() => () => loader.dispose(), [loader])
  return { byId, retry: loader.retry }
}
