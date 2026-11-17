import { useCallback, useState } from 'react'
import AppWorkspace from './AppWorkspace.jsx'
import AboutModal from './AboutModal.jsx'

export default function AppViewport() {
  const [aboutOpen, setAboutOpen] = useState(false)
  const finishAbout = useCallback(() => {
    setAboutOpen(false)
    requestAnimationFrame(() => document.querySelector('.app-viewport')?.focus({ preventScroll: true }))
  }, [])

  return <>
    <AppWorkspace onOpenAbout={() => setAboutOpen(true)} />
    {aboutOpen && <AboutModal onClose={finishAbout} />}
  </>
}
