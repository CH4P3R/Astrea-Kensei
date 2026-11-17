import { useCallback, useEffect, useRef, useState } from 'react'
import { buildShareUrl, parseSkyUrl, syncSkyUrl } from './skyUrl.js'

export default function useSkyUrl({ onRestore = () => {} } = {}) {
  const [initial] = useState(() => parseSkyUrl(window.location.href))
  const [warning, setWarning] = useState(() => initial.status === 'invalid' ? 'share.notices.invalid' : '')
  const onRestoreRef = useRef(onRestore)

  useEffect(() => { onRestoreRef.current = onRestore }, [onRestore])

  useEffect(() => {
    const restore = () => {
      const classification = parseSkyUrl(window.location.href)
      setWarning(classification.status === 'invalid' ? 'share.notices.invalid' : '')
      onRestoreRef.current(classification)
    }
    window.addEventListener('popstate', restore)
    return () => window.removeEventListener('popstate', restore)
  }, [])

  const sync = useCallback((search) => {
    const current = window.location.href
    const next = syncSkyUrl(current, search)
    if (next !== current) {
      try {
        window.history.replaceState(window.history.state, '', next)
      } catch {
        setWarning('share.notices.history')
        return
      }
    }
    setWarning('')
  }, [])

  const shareHref = useCallback((search) => {
    if (!search) return ''
    return buildShareUrl(window.location.href, search)
  }, [])

  return { initial, initialSearch: initial.search ?? null, warning, sync, shareHref }
}
