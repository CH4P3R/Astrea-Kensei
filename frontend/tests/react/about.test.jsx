import { act, cleanup, fireEvent, render, within } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import AppViewport from '../../src/components/layout/AppViewport.jsx'
import I18nProvider from '../../src/i18n/I18nProvider.jsx'
import { projectRepository, teamMembers } from '../../src/config/team.js'
import LanguageSelect from '../../src/components/controls/LanguageSelect.jsx'

vi.mock('../../src/components/layout/AppWorkspace.jsx', () => ({
  default: ({ onOpenAbout }) => <main className="app-viewport" tabIndex={-1}>
    <div className="scene-layer" />
    <div className="ui-layer"><LanguageSelect onOpenAbout={onOpenAbout} /></div>
  </main>,
}))

let originalShowModal
let originalClose

beforeEach(() => {
  vi.useFakeTimers()
  window.localStorage.clear()
  window.history.replaceState({}, '', '/')
  const prototype = HTMLDialogElement.prototype
  originalShowModal = Object.getOwnPropertyDescriptor(prototype, 'showModal')
  originalClose = Object.getOwnPropertyDescriptor(prototype, 'close')
  Object.defineProperty(prototype, 'showModal', { configurable: true, value() { this.setAttribute('open', '') } })
  Object.defineProperty(prototype, 'close', { configurable: true, value() { this.removeAttribute('open') } })
})

afterEach(() => {
  cleanup()
  const prototype = HTMLDialogElement.prototype
  if (originalShowModal) Object.defineProperty(prototype, 'showModal', originalShowModal)
  else delete prototype.showModal
  if (originalClose) Object.defineProperty(prototype, 'close', originalClose)
  else delete prototype.close
  vi.useRealTimers()
})

it('opens a dedicated about dialog from the HUD utility row with GitHub links', () => {
  render(<I18nProvider><AppViewport /></I18nProvider>)
  const hud = document.querySelector('.ui-layer')
  const trigger = within(hud).getByRole('button', { name: 'About Astrea' })
  const language = within(hud).getByRole('combobox')
  const actions = hud.querySelector('.language-actions')
  expect(actions.contains(trigger)).toBe(true)
  expect(trigger.textContent).toBe('')
  expect(actions.nextElementSibling.contains(language)).toBe(true)
  trigger.focus()
  fireEvent.click(trigger)
  const dialog = document.querySelector('.about-modal')
  expect(dialog.dataset.size).toBe('large')
  expect(document.querySelectorAll('dialog[open]').length).toBe(1)
  const about = dialog.querySelector('.about-content')
  expect(within(about).getByRole('heading', { level: 1 }).textContent).toBe('About Astrea')
  expect(within(about).getAllByRole('img').length).toBe(6)
  for (const member of teamMembers) {
    const profile = within(about).getByRole('link', { name: `${member.name} on GitHub (opens in a new tab)` })
    expect(profile.getAttribute('href')).toBe(member.profile)
    expect(profile.getAttribute('target')).toBe('_blank')
    expect(profile.getAttribute('rel')).toBe('noopener noreferrer')
    expect(profile.querySelector('svg')).toBeTruthy()
    const row = profile.closest('li')
    expect(row.querySelector('img').getAttribute('src')).toBe(member.photo)
    expect(row.querySelector('[lang="en"]').textContent).toBe(member.role)
  }
  const repository = within(about).getByRole('link', { name: 'View the project on GitHub (opens in a new tab)' })
  expect(repository.getAttribute('href')).toBe(projectRepository)
  expect(repository.querySelectorAll('svg').length).toBe(2)
  const close = within(dialog).getByRole('button', { name: 'Close' })
  expect(document.activeElement).toBe(close)
  fireEvent.click(close)
  // Commit the dialog unmount before advancing its next-frame focus restoration.
  act(() => vi.advanceTimersByTime(0))
  act(() => vi.advanceTimersByTime(1000))
  expect(document.querySelector('.about-modal')).toBeNull()
  expect(document.activeElement).toBe(document.querySelector('.app-viewport'))
  fireEvent.click(trigger)
  fireEvent(document.querySelector('.about-modal'), new Event('cancel', { cancelable: true }))
  act(() => vi.advanceTimersByTime(0))
  act(() => vi.advanceTimersByTime(1000))
  expect(document.querySelector('.about-modal')).toBeNull()
})
