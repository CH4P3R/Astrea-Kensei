import { useId, useRef, useState } from 'react'
import HelpButton from './HelpButton.jsx'
import useTranslation from '../../i18n/useTranslation.js'
import '../../styles/components/scrubbable-number-field.css'

const dragThreshold = 6

function adjusted(value, min, max, wrap) {
  const bounded = wrap ? ((value - min) % (max - min) + max - min) % (max - min) + min
    : Math.min(max, Math.max(min, value))
  // Avoid floating-point tails after repeated decimal steps; manual input is
  // passed through unchanged, including invalid drafts for form validation.
  const rounded = Number(bounded.toFixed(10))
  return String(wrap && rounded >= max ? min : rounded)
}

export default function ScrubbableNumberField({ label, help, id, name, value, onValueChange,
  min, max, step = 0.1, dragStep = 0.1, wrap = false, disabled = false, required = false, placeholder }) {
  const generatedId = useId()
  const inputId = id ?? generatedId
  const helpId = `${inputId}-help`
  const instructionId = `${inputId}-instructions`
  const { t } = useTranslation()
  const input = useRef(null)
  const gesture = useRef(null)
  const suppressClick = useRef(false)
  const editStart = useRef('')
  const [editing, setEditing] = useState(false)
  const [dragging, setDragging] = useState(false)
  const number = value !== '' && Number.isFinite(Number(value)) ? Number(value) : 0

  function beginEditing() {
    if (disabled || editing) return
    editStart.current = value
    setEditing(true)
    // Focus within the trusted tap/keypress so touch keyboards can open.
    input.current.readOnly = false
    input.current.focus({ preventScroll: true })
    input.current.select()
  }

  function changeBy(amount) {
    if (!disabled) onValueChange(adjusted(number + amount, min, max, wrap))
  }

  function release(element, pointerId) {
    if (element.hasPointerCapture?.(pointerId)) element.releasePointerCapture(pointerId)
  }

  function start(event) {
    if (disabled || editing || event.button !== 0 || event.isPrimary === false) return
    suppressClick.current = false
    gesture.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY,
      lastX: event.clientX, initial: value, value: number, dragged: false }
    if (event.pointerType !== 'touch') {
      event.preventDefault()
      input.current.focus({ preventScroll: true })
    }
    event.currentTarget.setPointerCapture?.(event.pointerId)
  }

  function move(event) {
    const active = gesture.current
    if (!active || event.pointerId !== active.pointerId || disabled) return
    const dx = event.clientX - active.x
    const dy = event.clientY - active.y
    if (!active.dragged) {
      if (Math.abs(dy) > dragThreshold && Math.abs(dy) > Math.abs(dx)) {
        // Let a vertical touch gesture scroll the panel normally.
        gesture.current = null
        suppressClick.current = true
        release(event.currentTarget, active.pointerId)
        return
      }
      if (Math.abs(dx) < dragThreshold) return
      active.dragged = true
      setDragging(true)
      input.current.focus({ preventScroll: true })
    }
    event.preventDefault()
    active.value += (event.clientX - active.lastX) * dragStep * (event.shiftKey ? 0.1 : 1)
    active.lastX = event.clientX
    const next = adjusted(active.value, min, max, wrap)
    active.value = Number(next)
    onValueChange(next)
  }

  function finish(event, cancelled = false) {
    const active = gesture.current
    if (!active || event.pointerId !== active.pointerId) return
    gesture.current = null
    setDragging(false)
    suppressClick.current = active.dragged || cancelled
    release(event.currentTarget, active.pointerId)
    if (cancelled && active.dragged && !disabled) onValueChange(active.initial)
    else if (!cancelled && !active.dragged && !disabled) beginEditing()
  }

  function keyDown(event) {
    if (disabled) return
    if (event.key === 'Escape') {
      if (editing) {
        event.preventDefault()
        event.stopPropagation()
        onValueChange(editStart.current)
        setEditing(false)
      } else if (gesture.current) {
        event.preventDefault()
        event.stopPropagation()
        finish({ pointerId: gesture.current.pointerId, currentTarget: input.current }, true)
      }
      return
    }
    if (editing) {
      if (event.key === 'Enter') setEditing(false) // Keep the form's Enter submit.
      return
    }
    if (event.key === 'Enter' || event.key === 'F2') {
      event.preventDefault()
      beginEditing()
      return
    }
    const direction = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1,
      PageUp: 10, PageDown: -10 }[event.key]
    if (direction) {
      event.preventDefault()
      changeBy(direction * step * (event.shiftKey ? 0.1 : 1))
    } else if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault()
      onValueChange(String(event.key === 'Home' ? min : wrap ? max - step : max))
    }
  }

  return <div className="input-field scrubbable-number">
    <div className="scrubbable-number__heading">
      <label htmlFor={inputId}>{label}</label>
      <HelpButton id={helpId} label={label} message={help} />
    </div>
    <div className="scrubbable-number__control" data-dragging={dragging || undefined}>
      <button type="button" className="scrubbable-number__step" aria-label={t('common.number.decrease', { label })}
        disabled={disabled || (!wrap && value !== '' && number <= min)} onClick={() => changeBy(-step)}>−</button>
      <input ref={input} id={inputId} name={name} type="number" min={min} max={max} step="any"
        value={value} disabled={disabled} required={required} placeholder={placeholder}
        readOnly={!editing} inputMode="decimal" className="scrubbable-number__input"
        aria-describedby={`${instructionId} ${helpId}`} onChange={(event) => onValueChange(event.target.value)}
        onBlur={() => setEditing(false)} onKeyDown={keyDown}
        onPointerDown={start} onPointerMove={move} onPointerUp={(event) => finish(event)}
        onPointerCancel={(event) => finish(event, true)} onLostPointerCapture={(event) => finish(event, true)}
        onClick={(event) => {
          if (suppressClick.current) { suppressClick.current = false; return }
          if (event.detail === 0) beginEditing()
        }} />
      <button type="button" className="scrubbable-number__step" aria-label={t('common.number.increase', { label })}
        disabled={disabled || (!wrap && value !== '' && number >= max)} onClick={() => changeBy(step)}>+</button>
    </div>
    <span id={instructionId} className="scrubbable-number__instructions">{t('common.number.instructions')}</span>
  </div>
}
