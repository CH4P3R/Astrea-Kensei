import { act, render, screen } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import I18nProvider from '../../src/i18n/I18nProvider.jsx'
import PixelTooltip from '../../src/components/controls/PixelTooltip.jsx'
import { createPixelHoverStore } from '../../src/components/controls/pixelHoverStore.js'

beforeEach(() => window.localStorage.clear())
const hit = (id = 'A', extra = {}) => ({
  active: { metadata: { id, observation_id: `Observation ${id}`, detector: 3,
    observation: { start_utc: '2026-11-17T04:05:06Z' },
    image: { width: 2, height: 1, unit: 'MJy/sr' } }, pixels: { raw: new Float64Array([1.25, -3]) } },
  pixels: { values: new Float32Array([0.4, 0.8]) }, uv: { x: 0.1, y: 0.5 },
  clientX: 20, clientY: 30, ...extra,
})

it('follows pixels and pointer without rerendering the workspace, then clears outside the image', () => {
  const store = createPixelHoverStore()
  const parentRender = vi.fn()
  function Workspace() { parentRender(); return <I18nProvider><PixelTooltip store={store} /></I18nProvider> }
  render(<Workspace />)
  expect(screen.queryByRole('tooltip')).toBeNull()
  const first = hit()
  act(() => store.publish(first, 'A'))
  const bubble = screen.getByRole('tooltip')
  expect(bubble.textContent).toContain('Pixel (1, 1)')
  expect(bubble.textContent).toContain('1.25')
  expect(bubble.textContent).toContain('MJy/sr')
  expect(bubble.textContent).toContain('UTC · D3')
  expect(bubble.style.getPropertyValue('--pixel-x')).toBe('36px')
  act(() => store.publish({ ...first, uv: { x: 0.8, y: 0.5 }, clientX: 40 }, 'A'))
  expect(bubble.textContent).toContain('Pixel (2, 1)')
  expect(bubble.textContent).toContain('-3')
  expect(bubble.style.getPropertyValue('--pixel-x')).toBe('56px')
  expect(parentRender).toHaveBeenCalledTimes(1)
  act(() => store.publish(null))
  expect(screen.queryByRole('tooltip')).toBeNull()
})

it('ignores a late clear from an outgoing frame and removes invalid off-image hits', () => {
  const store = createPixelHoverStore()
  render(<I18nProvider><PixelTooltip store={store} /></I18nProvider>)
  act(() => { store.publish(hit('A'), 'A'); store.publish(hit('B'), 'B'); store.publish(null, 'A') })
  expect(screen.getByRole('tooltip').textContent).toContain('Observation B')
  act(() => store.publish(hit('B', { uv: { x: 1.2, y: 0.5 } }), 'B'))
  expect(screen.queryByRole('tooltip')).toBeNull()
})

it('distinguishes original units, actual processed SNR and missing samples', () => {
  const store = createPixelHoverStore()
  render(<I18nProvider><PixelTooltip store={store} /></I18nProvider>)
  const processed = hit('A', { pixels: { raw: new Float64Array([2.5, NaN]), values: new Float32Array([0.2, -1]) },
    appliedProcessing: { signal_to_noise: true } })
  act(() => store.publish(processed))
  expect(screen.getByRole('tooltip').textContent).toContain('Processed value2.5 dimensionless')
  expect(screen.getByRole('tooltip').textContent).toContain('Original value1.25 MJy/sr')
  act(() => store.publish({ ...processed, uv: { x: 0.8, y: 0.5 } }))
  expect(screen.getByRole('tooltip').textContent).toContain('No finite value')
  expect(screen.getByRole('tooltip').textContent).toContain('masked or invalid')
})
