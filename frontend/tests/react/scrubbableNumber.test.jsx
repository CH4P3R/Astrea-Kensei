import { useState } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import ScrubbableNumberField from '../../src/components/common/ScrubbableNumberField.jsx'
import LocationControls from '../../src/components/controls/LocationControls.jsx'
import FitsControls from '../../src/components/controls/FitsControls.jsx'
import I18nProvider from '../../src/i18n/I18nProvider.jsx'

beforeEach(() => window.localStorage.clear())

function NumberProbe({ initial = '10', onChange = () => {}, ...props }) {
  const [value, setValue] = useState(initial)
  return <ScrubbableNumberField label="Coordinate" help="Coordinate help" name="coordinate"
    min={-90} max={90} value={value} onValueChange={(next) => { setValue(next); onChange(next) }} {...props} />
}

const mount = (element) => render(<I18nProvider>{element}</I18nProvider>)
const input = () => screen.getByRole('spinbutton', { name: 'Coordinate' })
const increment = () => screen.getByRole('button', { name: 'Increase Coordinate' })
const decrement = () => screen.getByRole('button', { name: 'Decrease Coordinate' })

function pointer(element, type, { pointerId = 1, pointerType = 'mouse', isPrimary = true, ...options } = {}) {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, ...options })
  Object.defineProperties(event, { pointerId: { value: pointerId }, pointerType: { value: pointerType },
    isPrimary: { value: isPrimary } })
  fireEvent(element, event)
  return event
}

it('distinguishes a short click from a drag and restores manual edits with Escape', () => {
  mount(<NumberProbe />)
  const field = input()
  expect(field.readOnly).toBe(true)
  pointer(field, 'pointerdown', { clientX: 100, clientY: 20 })
  pointer(field, 'pointermove', { clientX: 102, clientY: 21 })
  pointer(field, 'pointerup', { clientX: 102, clientY: 21 })
  expect(field.readOnly).toBe(false)
  expect(document.activeElement).toBe(field)
  fireEvent.change(field, { target: { value: '12.123456789' } })
  expect(field.value).toBe('12.123456789')
  fireEvent.keyDown(field, { key: 'Escape' })
  expect(field.value).toBe('10')
  expect(field.readOnly).toBe(true)

  pointer(field, 'pointerdown', { clientX: 50 })
  pointer(field, 'pointermove', { clientX: 80 })
  expect(field.value).toBe('13')
  pointer(field, 'pointerup', { clientX: 80 })
  fireEvent.click(field, { detail: 1 })
  expect(field.readOnly).toBe(true)
  expect(document.activeElement).toBe(field)
})

it('keeps vertical touch scrolling native and cancels interrupted horizontal drags', () => {
  const onChange = vi.fn()
  mount(<NumberProbe onChange={onChange} />)
  const field = input()
  pointer(field, 'pointerdown', { pointerType: 'touch', clientX: 30, clientY: 30 })
  const vertical = pointer(field, 'pointermove', { pointerType: 'touch', clientX: 32, clientY: 60 })
  pointer(field, 'pointerup', { pointerType: 'touch', clientX: 32, clientY: 60 })
  fireEvent.click(field, { detail: 1 })
  expect(vertical.defaultPrevented).toBe(false)
  expect(onChange).not.toHaveBeenCalled()
  expect(field.readOnly).toBe(true)

  pointer(field, 'pointerdown', { pointerType: 'touch', clientX: 30, clientY: 30 })
  const horizontal = pointer(field, 'pointermove', { pointerType: 'touch', clientX: 60, clientY: 32 })
  expect(horizontal.defaultPrevented).toBe(true)
  expect(field.value).toBe('13')
  pointer(field, 'pointercancel', { pointerType: 'touch' })
  expect(field.value).toBe('10')
  expect(field.readOnly).toBe(true)

  pointer(field, 'pointerdown', { clientX: 30 })
  pointer(field, 'pointermove', { clientX: 50 })
  fireEvent.keyDown(field, { key: 'Escape' })
  expect(field.value).toBe('10')
})

it('supports keyboard increments, limits, empty values and an ordinary Enter submit while typing', () => {
  mount(<NumberProbe initial="" />)
  const field = input()
  fireEvent.click(increment())
  expect(field.value).toBe('0.1')
  field.focus()
  fireEvent.keyDown(field, { key: 'ArrowRight' })
  expect(field.value).toBe('0.2')
  fireEvent.keyDown(field, { key: 'ArrowDown', shiftKey: true })
  expect(field.value).toBe('0.19')
  fireEvent.keyDown(field, { key: 'End' })
  expect(field.value).toBe('90')
  expect(increment().disabled).toBe(true)
  fireEvent.keyDown(field, { key: 'ArrowUp' })
  expect(field.value).toBe('90')
  fireEvent.keyDown(field, { key: 'Home' })
  expect(field.value).toBe('-90')
  expect(decrement().disabled).toBe(true)
  expect(fireEvent.keyDown(field, { key: 'Enter' })).toBe(false)
  expect(field.readOnly).toBe(false)
  fireEvent.change(field, { target: { value: '30.123456789' } })
  expect(fireEvent.keyDown(field, { key: 'Enter' })).toBe(true)
  expect(field.readOnly).toBe(true)
  expect(field.value).toBe('30.123456789')
})

it('wraps RA steps and drags without silently normalizing manual values', () => {
  mount(<NumberProbe initial="359.9" min={0} max={360} wrap />)
  const field = input()
  fireEvent.click(increment())
  expect(field.value).toBe('0')
  fireEvent.click(decrement())
  expect(field.value).toBe('359.9')
  pointer(field, 'pointerdown', { clientX: 0 })
  pointer(field, 'pointermove', { clientX: 10 })
  pointer(field, 'pointerup', { clientX: 10 })
  expect(field.value).toBe('0.9')
  fireEvent.keyDown(field, { key: 'Enter' })
  fireEvent.change(field, { target: { value: '360' } })
  fireEvent.blur(field)
  expect(field.value).toBe('360')
})

it('does not change a disabled coordinate by buttons, pointer or keyboard', () => {
  const onChange = vi.fn()
  mount(<NumberProbe disabled onChange={onChange} />)
  const field = input()
  expect(field.disabled).toBe(true)
  expect(increment().disabled).toBe(true)
  expect(decrement().disabled).toBe(true)
  fireEvent.click(increment())
  pointer(field, 'pointerdown', { clientX: 0 })
  pointer(field, 'pointermove', { clientX: 100 })
  pointer(field, 'pointerup', { clientX: 100 })
  fireEvent.keyDown(field, { key: 'ArrowUp' })
  expect(onChange).not.toHaveBeenCalled()
})

it('follows external locations while preserving edited drafts until explicit Apply', () => {
  const apply = vi.fn(() => true)
  const locate = vi.fn()
  const props = { status: 'ready', error: '', locate, applyManualLocation: apply }
  const location = (latitude, longitude) => <I18nProvider><LocationControls {...props}
    observer={{ latitude, longitude, source: 'manual' }} /></I18nProvider>
  const view = render(location(10, 20))
  const latitude = screen.getByRole('spinbutton', { name: 'Latitude (°)' })
  const longitude = screen.getByRole('spinbutton', { name: 'Longitude (°)' })
  view.rerender(location(30, 40))
  expect(latitude.value).toBe('30')
  expect(longitude.value).toBe('40')
  fireEvent.click(latitude)
  fireEvent.change(latitude, { target: { value: '31.23456789' } })
  view.rerender(location(50, 60))
  expect(latitude.value).toBe('31.23456789')
  expect(longitude.value).toBe('60')
  fireEvent.click(screen.getByRole('button', { name: 'Increase Longitude (°)' }))
  expect(apply).not.toHaveBeenCalled()
  expect(new FormData(latitude.form).get('latitude')).toBe('31.23456789')
  fireEvent.submit(latitude.form)
  expect(apply).toHaveBeenCalledExactlyOnceWith(31.23456789, 60.1)
  view.rerender(location(31.23456789, 60.1))
  expect(latitude.value).toBe('31.23456789')
  fireEvent.click(screen.getByRole('button', { name: 'Use device location' }))
  expect(locate).toHaveBeenCalledTimes(1)
  view.rerender(location(70, 80))
  expect(latitude.value).toBe('70')
  expect(longitude.value).toBe('80')
})

it('keeps coordinate search explicit and rejects manual RA360 and empty inputs', () => {
  const search = vi.fn()
  function Preparation() {
    const [coordinates, setCoordinates] = useState({ ra: '10', dec: '20' })
    return <FitsControls observer={{ latitude: 0, longitude: 0 }} fits={{ coordinates,
      setCoordinate: (field, value) => setCoordinates((current) => ({ ...current, [field]: value })),
      searchByCoordinates: search, size: 7, setSize() {}, status: 'idle', images: [], active: null }} />
  }
  mount(<Preparation />)
  const ra = screen.getByRole('spinbutton', { name: 'Right ascension, RA (°)' })
  const dec = screen.getByRole('spinbutton', { name: 'Declination, Dec (°)' })
  pointer(ra, 'pointerdown', { clientX: 0 })
  pointer(ra, 'pointermove', { clientX: 20 })
  pointer(ra, 'pointerup', { clientX: 20 })
  fireEvent.click(screen.getByRole('button', { name: 'Increase Declination, Dec (°)' }))
  expect(search).not.toHaveBeenCalled()
  fireEvent.submit(ra.form)
  expect(search).toHaveBeenCalledExactlyOnceWith(12, 20.1)
  search.mockClear()
  fireEvent.keyDown(ra, { key: 'Enter' })
  fireEvent.change(ra, { target: { value: '360' } })
  fireEvent.blur(ra)
  fireEvent.submit(ra.form)
  expect(search).not.toHaveBeenCalled()
  expect(screen.getByRole('alert').textContent).toContain('less than 360')
  fireEvent.change(ra, { target: { value: '83.63' } })
  fireEvent.change(dec, { target: { value: '' } })
  fireEvent.submit(ra.form)
  expect(search).not.toHaveBeenCalled()
  expect(screen.getByRole('alert').textContent).toContain('Enter RA and Dec')
})
