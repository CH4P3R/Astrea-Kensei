import { useEffect, useState } from 'react'

export const groundOpacityStorageKey = 'astrea.groundOpacity'

export default function useGroundOpacity() {
  const [opacity, setOpacity] = useState(() => {
    try {
      const saved = window.localStorage.getItem(groundOpacityStorageKey)
      const value = saved?.trim() ? Number(saved) : NaN
      if (Number.isFinite(value) && value >= 0 && value <= 1) return value
    } catch { /* Storage may be unavailable; keep the control usable. */ }
    return 0.22
  })

  useEffect(() => {
    try { window.localStorage.setItem(groundOpacityStorageKey, String(opacity)) }
    catch { /* Keep the chosen value in memory if persistence is unavailable. */ }
  }, [opacity])

  return [opacity, setOpacity]
}
