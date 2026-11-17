import { cloneElement, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import useTooltipPosition from '../../hooks/useTooltipPosition.js'

export default function Tooltip({ children, message, tone = 'info', open, compact = false, inline = false,
  placement = 'top', id, point, hoverOnly = false, dismissOnClick = false }) {
  const generatedId = useId()
  const tooltipId = id ?? generatedId
  const anchorRef = useRef(null)
  const tooltipRef = useRef(null)
  const [portalTarget, setPortalTarget] = useState(document.body)
  useLayoutEffect(() => {
    setPortalTarget(anchorRef.current?.closest('dialog') ?? document.body)
  }, [])
  const [hovered, setHovered] = useState(false)
  const [focused, setFocused] = useState(false)
  const [dismissed, setDismissed] = useState(false)
  const visible = Boolean(message) && !dismissed && (open ?? (hovered || (!hoverOnly && focused)))
  useTooltipPosition(anchorRef, tooltipRef, visible, placement, message, point)

  useEffect(() => {
    if (!point || !visible) return
    const dismiss = () => setDismissed(true)
    const keydown = (event) => { if (event.key === 'Escape') dismiss() }
    window.addEventListener('pointerdown', dismiss)
    window.addEventListener('keydown', keydown)
    return () => {
      window.removeEventListener('pointerdown', dismiss)
      window.removeEventListener('keydown', keydown)
    }
  }, [point, visible])

  if (!message) return children ?? null
  const bubble = createPortal(<span ref={tooltipRef} id={tooltipId}
    role={point ? tone === 'error' ? 'alert' : 'status' : 'tooltip'} data-open={visible} data-placement={placement}
    className={`tooltip-bubble tooltip-bubble-${tone}${compact ? ' tooltip-bubble-compact' : ''}`}>
    {message}
   </span>, portalTarget)
  if (point) return bubble
  const describedBy = [children.props['aria-describedby'], tooltipId].filter(Boolean).join(' ')
  return <span ref={anchorRef} className={`tooltip-anchor${inline ? ' tooltip-anchor-inline' : ''}`}
    onPointerEnter={(event) => {
      if (event.pointerType !== 'touch') { setHovered(true); setDismissed(false) }
    }}
    onPointerLeave={() => setHovered(false)}
    onFocus={() => { if (!hoverOnly) { setFocused(true); setDismissed(false) } }}
    onBlur={() => setFocused(false)}
    onClick={() => {
      if (dismissOnClick) {
        setDismissed(true)
        // Keep DOM focus for keyboard navigation without pinning the tooltip
        // to the focus left behind by this activation.
        setFocused(false)
      } else if (!hoverOnly) setDismissed(false)
    }}
    onKeyDown={(event) => { if (event.key === 'Escape') setDismissed(true) }}>
    {cloneElement(children, { 'aria-describedby': describedBy })}
    {bubble}
  </span>
}
