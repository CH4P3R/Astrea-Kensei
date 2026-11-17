import { useCallback, useState } from 'react'

export default function useContextMenu() {
  const [active, setActive] = useState(null)
  const open = useCallback((id) => {
    setActive(id)
  }, [])
  const toggle = useCallback((id) => {
    setActive((current) => current === id ? null : id)
  }, [])

  return { active, open, toggle }
}
