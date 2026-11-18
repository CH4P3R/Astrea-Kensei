import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { DEFAULT_APPEARANCE, DEFAULT_PROCESSING } from '../config/appearance.js'
import { loadPixels } from '../services/images.js'
import { decodePixels, displayRange, normalizePixels } from '../three/core/imageDataUtils.js'
import { errorMessage } from '../i18n/messages.js'
import { mapComparisonTasks } from '../services/comparisonTasks.js'

export default function useImageAppearance(sources) {
  const [settings, setSettings] = useState(DEFAULT_APPEARANCE)
  const [processing, setProcessing] = useState(DEFAULT_PROCESSING)
  const [result, setResult] = useState(null)
  const [attempt, setAttempt] = useState(0)
  const processed = useRef(new Map())
  const enabled = Object.values(processing).some(Boolean)
  const key = JSON.stringify([sources.map((image) => image.metadata.id), processing, attempt])
  if (result && result.key !== key) setResult(null)
  const matches = result?.key === key
  const ready = !enabled || (matches && result.status === 'ready')
  const error = enabled && matches ? result.error : ''

  useEffect(() => {
    // Keep only the current sequence; removing a frame releases its processed copy.
    const ids = new Set(sources.map((image) => image.metadata.id))
    for (const id of processed.current.keys()) if (!ids.has(id)) processed.current.delete(id)
    if (!enabled || !sources.length) return
    const job = new AbortController()
    const options = JSON.stringify(processing)
    async function apply() {
      try {
        const pixels = await mapComparisonTasks(sources, async (image) => {
          const cached = processed.current.get(image.metadata.id)
          if (cached?.options === options) return cached.raw
          const buffer = await loadPixels(image.metadata.id, job.signal, processing)
          job.signal.throwIfAborted()
          const raw = decodePixels(buffer, image.metadata.image).raw
          processed.current.set(image.metadata.id, { options, raw })
          return raw
        }, job.signal)
        if (!job.signal.aborted) setResult({ key, status: 'ready', pixels, error: '' })
      } catch (failure) {
        if (!job.signal.aborted) {
          job.abort()
          setResult({ key, status: 'error', pixels: null, error: errorMessage(failure) })
        }
      }
    }
    apply()
    return () => job.abort()
  }, [sources, processing, enabled, key, attempt])

  const applied = enabled && ready ? result.pixels : null
  const display = useMemo(() => {
    const arrays = applied ?? sources.map((image) => image.pixels.raw)
    const range = displayRange(arrays)
    return { pixels: arrays.map((raw) => ({ raw, ...normalizePixels(raw, range) })),
      hasData: arrays.every((raw) => raw.some(Number.isFinite)) }
  }, [sources, applied])
  const change = useCallback((name, value) => setSettings((previous) => ({ ...previous, [name]: value })), [])
  const process = useCallback((name, value) => setProcessing((previous) => ({ ...previous, [name]: value })), [])
  const restore = useCallback(() => setSettings(DEFAULT_APPEARANCE), [])
  const retry = useCallback(() => setAttempt((value) => value + 1), [])
  return { settings, processing, change, process, restore, retry, ...display, ready, error,
    loading: enabled && !ready && !error, appliedProcessing: enabled && ready ? processing : DEFAULT_PROCESSING }
}
