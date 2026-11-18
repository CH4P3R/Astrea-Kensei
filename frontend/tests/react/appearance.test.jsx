import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest'
import ImageAppearancePanel from '../../src/components/controls/ImageAppearancePanel.jsx'
import I18nProvider from '../../src/i18n/I18nProvider.jsx'
import useImageAppearance from '../../src/hooks/useImageAppearance.js'
import { IMAGE_PALETTES, imagePaletteGradient } from '../../src/config/appearance.js'
import { loadPixels } from '../../src/services/images.js'

vi.mock('../../src/services/images.js', () => ({ loadPixels: vi.fn() }))

const source = (id) => ({ metadata: { id, image: { width: 2, height: 2, dtype: 'float32' } },
  pixels: { raw: new Float32Array([1, 2, 3, NaN]) } })
const first = [source('first')]
const second = [source('second')]
function Probe({ sources = first }) {
  const appearance = useImageAppearance(sources)
  return <>
    <ImageAppearancePanel appearance={appearance} />
    <output data-testid="settings">{JSON.stringify(appearance.settings)}</output>
    <output data-testid="pixels">{JSON.stringify(appearance.pixels.map(({ values }) => [...values]))}</output>
  </>
}
const view = (sources) => <I18nProvider><Probe sources={sources} /></I18nProvider>
const settings = () => JSON.parse(screen.getByTestId('settings').textContent)
const choose = (name) => {
  fireEvent.click(screen.getByRole('combobox', { name: 'Palette' }))
  fireEvent.click(screen.getByRole('option', { name, exact: true }))
}
const scrollDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollIntoView')
beforeAll(() => Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: vi.fn() }))
afterAll(() => {
  if (scrollDescriptor) Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', scrollDescriptor)
  else delete HTMLElement.prototype.scrollIntoView
})
beforeEach(() => {
  window.localStorage.clear()
  vi.mocked(loadPixels).mockReset().mockResolvedValue(new Float32Array([2, NaN, 4, 6]).buffer)
})

it('selects all six palettes with a matching low-to-high legend without downloading or mutating pixels', () => {
  render(view())
  const originalPixels = screen.getByTestId('pixels').textContent
  const labels = ['Grayscale', 'Intensity false color', 'Amber', 'Ice', 'Violet–gold', 'Inverted grayscale']
  IMAGE_PALETTES.forEach(({ id }, index) => {
    choose(labels[index])
    expect(settings().palette).toBe(id)
    expect(screen.getByRole('combobox', { name: 'Palette' }).textContent).toBe(labels[index])
    const legend = screen.getByRole('img', { name: `${labels[index]}: Displayed intensity scale: low to high` })
    expect(legend.style.getPropertyValue('--intensity-gradient')).toBe(imagePaletteGradient(id))
    expect(legend.textContent).toBe('Low intensityHigh intensity')
    expect(screen.getByTestId('pixels').textContent).toBe(originalPixels)
  })
  expect(loadPixels).not.toHaveBeenCalled()
  expect([...first[0].pixels.raw]).toEqual([1, 2, 3, NaN])
})

it('retains visual settings across processing and observations, and resets only appearance', async () => {
  const { rerender } = render(view(first))
  choose('Violet–gold')
  fireEvent.change(screen.getByRole('slider', { name: 'Brightness' }), { target: { value: '1.4' } })
  fireEvent.change(screen.getByRole('slider', { name: 'Opacity' }), { target: { value: '0.35' } })
  const chosen = { palette: 'violetGold', exposure: 1.4, opacity: 0.35 }
  expect(settings()).toEqual(chosen)
  expect(loadPixels).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('checkbox', { name: 'Apply quality flags' }))
  await waitFor(() => expect(screen.queryByText('Applying processing to the images…')).toBeNull())
  expect(loadPixels).toHaveBeenCalledTimes(1)
  expect(loadPixels.mock.calls[0][2]).toEqual({ mask_flags: true, subtract_zodi: false, signal_to_noise: false })
  expect(JSON.parse(screen.getByTestId('pixels').textContent)[0][1]).toBe(-1)
  expect(settings()).toEqual(chosen)

  rerender(view(second))
  await waitFor(() => expect(loadPixels).toHaveBeenCalledTimes(2))
  await waitFor(() => expect(screen.queryByText('Applying processing to the images…')).toBeNull())
  expect(settings()).toEqual(chosen)
  fireEvent.click(screen.getByRole('button', { name: 'Reset appearance' }))
  expect(settings()).toEqual({ palette: 'gray', exposure: 0, opacity: 1 })
  expect(screen.getByRole('checkbox', { name: 'Apply quality flags' }).checked).toBe(true)
  expect(loadPixels).toHaveBeenCalledTimes(2)
})
