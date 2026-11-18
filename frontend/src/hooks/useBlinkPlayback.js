import { useCallback, useEffect, useMemo, useState } from 'react'
import { BLINK_MAX_SECONDS, BLINK_MIN_SECONDS, BLINK_STEP_SECONDS, nextFrameId } from '../config/comparison.js'

export default function useBlinkPlayback(frames, ready, { suspended = false, contextKey = null } = {}) {
  const sequenceKey = JSON.stringify(frames.map(({ id }) => id))
  const sequence = useMemo(() => JSON.parse(sequenceKey).map((id) => ({ id })), [sequenceKey])
  const key = JSON.stringify([sequenceKey, contextKey])
  const referenceId = frames.find(({ reference }) => reference)?.id ?? frames[0]?.id ?? null
  const [state, setState] = useState({ key: null, playing: false, frameId: null })
  const [interval, setIntervalValue] = useState(1)
  if (state.key !== key || (!ready && !suspended && state.playing)) {
    setState({ key, playing: false, frameId: state.key === key ? state.frameId : referenceId })
  }
  // A temporary projection gap suspends advancement, not the user's intent.
  // Keep Pause available while waiting; no expired frame is made renderable.
  const playing = state.key === key && (ready || suspended) && frames.length > 1 && state.playing
  const frameId = state.key === key && (ready || suspended) ? state.frameId ?? referenceId : referenceId
  const index = Math.max(0, frames.findIndex(({ id }) => id === frameId))
  const frame = frames[index]?.label ?? 'A'
  const pause = useCallback(() => setState((previous) => ({ ...previous, playing: false })), [])
  const show = useCallback((id) => {
    if (ready && frames.some((entry) => entry.id === id)) setState({ key, playing: false, frameId: id })
  }, [key, ready, frames])
  const toggle = useCallback(() => {
    if (ready && frames.length > 1) setState((previous) => ({ key,
      frameId: previous.key === key ? previous.frameId ?? referenceId : referenceId, playing: !playing }))
  }, [key, ready, frames.length, referenceId, playing])
  const move = useCallback((direction) => {
    if (ready && frames.length) setState((previous) => ({ key, playing: false,
      frameId: nextFrameId(frames, previous.key === key ? previous.frameId : referenceId, direction) }))
  }, [key, ready, frames, referenceId])
  const next = useCallback(() => move(1), [move])
  const previous = useCallback(() => move(-1), [move])
  const setInterval = useCallback((value) => {
    const seconds = Number(value)
    if (Number.isFinite(seconds) && seconds > 0) {
      const clamped = Math.max(BLINK_MIN_SECONDS, Math.min(BLINK_MAX_SECONDS, seconds))
      setIntervalValue(Number((Math.round(clamped / BLINK_STEP_SECONDS) * BLINK_STEP_SECONDS).toFixed(1)))
    }
  }, [])

  useEffect(() => {
    if (!playing || !ready) return
    const timer = window.setInterval(() => setState((previousState) => ({ ...previousState,
      frameId: nextFrameId(sequence, previousState.frameId) })), interval * 1000)
    return () => window.clearInterval(timer)
  }, [playing, ready, interval, sequence])

  useEffect(() => {
    if (!playing) return
    const hide = () => { if (document.hidden) pause() }
    document.addEventListener('visibilitychange', hide)
    return () => document.removeEventListener('visibilitychange', hide)
  }, [playing, pause])

  return { frameId, frame, index, playing, waiting: playing && !ready, interval, setInterval, pause, show, toggle, next, previous }
}
