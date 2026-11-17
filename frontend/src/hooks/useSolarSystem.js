import { useCallback, useEffect, useState } from 'react'
import { observerContext } from '../services/images.js'
import { loadSolarSystem } from '../services/solarSystem.js'
import { solarSnapshotIsCurrent } from '../three/core/solarSystemUtils.js'
import { errorMessage, LocalizedError } from '../i18n/messages.js'

export default function useSolarSystem(observer, timeContext, timestamp, enabled = true) {
  const [state, setState] = useState(null)
  const [attempt, setAttempt] = useState(0)
  const retry = useCallback(() => setAttempt((value) => value + 1), [])
  useEffect(() => {
    if (!observer || !enabled) return
    const controller = new AbortController()
    let timer
    const refresh = async () => {
      setState((previous) => ({ observer, timeContext, attempt, status: 'loading', error: '',
        snapshot: previous?.observer === observer && previous?.timeContext === timeContext ? previous.snapshot : null }))
      try {
        const snapshot = await loadSolarSystem(observerContext(observer, timeContext), controller.signal)
        if (controller.signal.aborted) return
        if (snapshot.mode !== timeContext.mode || !solarSnapshotIsCurrent(snapshot, Date.now())) {
          throw new LocalizedError('sky.solar.expired')
        }
        setState({ observer, timeContext, attempt, status: 'ready', error: '', snapshot })
        if (timeContext.mode === 'live') {
          timer = window.setTimeout(refresh, Math.max(1000, snapshot.sample_times_ms.at(-1) - Date.now() - 30000))
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          setState((previous) => ({ ...previous, status: 'error', error: errorMessage(error) }))
          // Recover a temporary failure without polling every frame or second.
          if (timeContext.mode === 'live') timer = window.setTimeout(refresh, 30000)
        }
      }
    }
    timer = window.setTimeout(refresh, 0)
    return () => { controller.abort(); window.clearTimeout(timer) }
  }, [observer, timeContext, enabled, attempt])

  if (!observer || !enabled) return { status: 'idle', snapshot: null, error: '', retry }
  const current = state?.observer === observer && state?.timeContext === timeContext && state?.attempt === attempt
  if (!current) return { status: 'loading', snapshot: null, error: '', retry }
  const expired = state.snapshot?.mode === 'live' && timestamp > state.snapshot.sample_times_ms.at(-1)
  return { status: expired && state.status !== 'loading' ? 'error' : state.status,
    snapshot: expired ? null : state.snapshot,
    error: state.error || (expired ? 'sky.solar.expired' : ''), retry }
}
