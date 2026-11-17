import { StrictMode, useState } from 'react'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeAll, beforeEach, expect, it, vi } from 'vitest'
import useSkyUrl from '../../src/share/useSkyUrl.js'

const search = { ra: 83.63, dec: -5.39, size: 12, detector: 3 }
const query = '?ra=83.63&dec=-5.39&size=12&detector=3'

function Probe({ options, value = search }) {
  const { initial, initialSearch, warning, sync, shareHref } = useSkyUrl(options)
  const [href, setHref] = useState('')
  return <>
    <output data-testid="state">{JSON.stringify({ initial, initialSearch, warning })}</output>
    <output data-testid="href">{href}</output>
    <button onClick={() => sync(value)}>sync</button>
    <button onClick={() => sync(null)}>clear</button>
    <button onClick={() => setHref(shareHref(value))}>share</button>
    <button onClick={() => setHref(shareHref(null))}>share empty</button>
  </>
}

const state = () => JSON.parse(screen.getByTestId('state').textContent)
const click = (name) => fireEvent.click(screen.getByRole('button', { name, exact: true }))
const navigate = (href) => {
  window.history.replaceState({}, '', href)
  act(() => window.dispatchEvent(new PopStateEvent('popstate')))
}

beforeAll(() => window.history.replaceState({}, '', '/'))

beforeEach(() => {
  // The shared cleanup must reset even when the previous test left a throwing spy.
  expect(window.location.pathname + window.location.search + window.location.hash).toBe('/')
  expect(window.history.state).toEqual({})
})

it('classifies the initial URL once and exposes a valid search across rerenders', () => {
  window.history.replaceState({}, '', `/${query}`)
  const { rerender } = render(<Probe />)
  const expected = {
    initial: { status: 'valid', search },
    initialSearch: search,
    warning: '',
  }
  expect(state()).toEqual(expected)

  window.history.replaceState({}, '', '/?ra=bad')
  rerender(<Probe value={{ ra: 10, dec: 20, size: 7, detector: 0 }} />)
  expect(state()).toEqual(expected)
  click('sync')
  expect(window.location.search).toBe('?ra=10&dec=20&size=7&detector=0')
  expect(state()).toEqual(expected)
})

it('classifies an absent initial URL without restoring or rewriting it', () => {
  window.history.replaceState({ keep: 1 }, '', '/?foo=1#frag')
  const replace = vi.spyOn(window.history, 'replaceState')
  const onRestore = vi.fn()
  render(<Probe options={{ onRestore }} />)
  expect(state()).toEqual({ initial: { status: 'none' }, initialSearch: null, warning: '' })
  expect(replace).not.toHaveBeenCalled()
  expect(onRestore).not.toHaveBeenCalled()
})

it('warns for an invalid startup URL and recovers after an explicit sync', () => {
  window.history.replaceState({}, '', '/?ra=bad')
  render(<Probe />)
  expect(state()).toEqual({
    initial: { status: 'invalid' }, initialSearch: null, warning: 'share.notices.invalid',
  })
  click('sync')
  expect(state()).toEqual({
    initial: { status: 'invalid' }, initialSearch: null, warning: '',
  })
  expect(window.location.search).toBe(query)
})

it('synchronizes explicitly without losing unrelated query, hash, or history state', () => {
  window.history.replaceState({ keep: 1 }, '', '/?foo=1#frag')
  const replace = vi.spyOn(window.history, 'replaceState')
  const onRestore = vi.fn()
  render(<Probe options={{ onRestore }} />)
  click('sync')
  expect(window.location.search + window.location.hash).toBe(`?foo=1&${query.slice(1)}#frag`)
  expect(window.history.state).toEqual({ keep: 1 })
  expect(replace).toHaveBeenCalledExactlyOnceWith(
    { keep: 1 }, '', `${window.location.origin}/?foo=1&${query.slice(1)}#frag`,
  )
  click('sync')
  expect(replace).toHaveBeenCalledTimes(1)
  expect(onRestore).not.toHaveBeenCalled()
})

it('shares only supported fields from the current path without changing browser state', () => {
  window.history.replaceState({ keep: 1 }, '', '/old?token=secret#private')
  const { rerender } = render(<Probe />)
  window.history.replaceState({ keep: 2 }, '', '/sky?latitude=51&longitude=0&token=secret#private')
  const replace = vi.spyOn(window.history, 'replaceState')
  rerender(<Probe value={{ ...search, latitude: 51, longitude: 0, token: 'secret' }} />)
  click('share')
  expect(screen.getByTestId('href').textContent).toBe(`${window.location.origin}/sky${query}`)
  click('share empty')
  expect(screen.getByTestId('href').textContent).toBe('')
  expect(window.location.pathname + window.location.search + window.location.hash)
    .toBe('/sky?latitude=51&longitude=0&token=secret#private')
  expect(window.history.state).toEqual({ keep: 2 })
  expect(replace).not.toHaveBeenCalled()
})

it('clears every supported field, including duplicates, while preserving unrelated state', () => {
  window.history.replaceState({ keep: 1 }, '',
    '/?foo=1&ra=bad&ra=2&dec=3&size=4&detector=5#frag')
  const replace = vi.spyOn(window.history, 'replaceState')
  render(<Probe />)
  click('clear')
  expect(window.location.search + window.location.hash).toBe('?foo=1#frag')
  expect(window.history.state).toEqual({ keep: 1 })
  expect(state().warning).toBe('')
  expect(state().initial).toEqual({ status: 'invalid' })
  click('clear')
  expect(replace).toHaveBeenCalledTimes(1)
})

it('keeps the search shareable and warns when replaceState throws', () => {
  window.history.replaceState({ keep: 1 }, '', '/?foo=1#frag')
  render(<Probe />)
  vi.spyOn(window.history, 'replaceState').mockImplementation(() => {
    throw new DOMException('Not allowed', 'SecurityError')
  })
  click('sync')
  expect(state().warning).toBe('share.notices.history')
  expect(window.location.search + window.location.hash).toBe('?foo=1#frag')
  expect(window.history.state).toEqual({ keep: 1 })
  click('share')
  expect(screen.getByTestId('href').textContent).toBe(`${window.location.origin}/${query}`)
  expect(state().warning).toBe('share.notices.history')
  // Intentionally leave the spy installed: shared cleanup must still reset the URL.
})

it('clears a history warning on a successful retry', () => {
  render(<Probe />)
  const replace = vi.spyOn(window.history, 'replaceState').mockImplementationOnce(() => {
    throw new DOMException('Not allowed', 'SecurityError')
  })
  click('sync')
  expect(state().warning).toBe('share.notices.history')
  click('sync')
  expect(state().warning).toBe('')
  expect(window.location.search).toBe(query)
  expect(replace).toHaveBeenCalledTimes(2)
})

it('clears a history warning when sync already matches the current URL', () => {
  render(<Probe />)
  const replace = vi.spyOn(window.history, 'replaceState').mockImplementationOnce(() => {
    throw new DOMException('Not allowed', 'SecurityError')
  })
  click('sync')
  expect(state().warning).toBe('share.notices.history')
  window.history.replaceState({}, '', `/${query}`)
  replace.mockClear()
  click('sync')
  expect(state().warning).toBe('')
  expect(replace).not.toHaveBeenCalled()
})

it('restores valid, absent, and invalid navigation without mutating the startup snapshot', () => {
  const onRestore = vi.fn()
  render(<Probe options={{ onRestore }} />)
  navigate('/?ra=bad')
  expect(onRestore).toHaveBeenLastCalledWith({ status: 'invalid' })
  expect(state().warning).toBe('share.notices.invalid')
  navigate(`/${query}`)
  expect(onRestore).toHaveBeenLastCalledWith({ status: 'valid', search })
  expect(state().warning).toBe('')
  const replace = vi.spyOn(window.history, 'replaceState')
  click('sync')
  expect(replace).not.toHaveBeenCalled()
  expect(onRestore).toHaveBeenCalledTimes(2)
  navigate('/?ra=bad')
  navigate('/?foo=1')
  expect(onRestore).toHaveBeenLastCalledWith({ status: 'none' })
  expect(onRestore).toHaveBeenCalledTimes(4)
  expect(state()).toEqual({ initial: { status: 'none' }, initialSearch: null, warning: '' })
})

it('clears a history warning on navigation to an absent entry', () => {
  const onRestore = vi.fn()
  render(<Probe options={{ onRestore }} />)
  vi.spyOn(window.history, 'replaceState').mockImplementationOnce(() => {
    throw new DOMException('Not allowed', 'SecurityError')
  })
  click('sync')
  expect(state().warning).toBe('share.notices.history')
  navigate('/?foo=1')
  expect(state().warning).toBe('')
  expect(onRestore).toHaveBeenLastCalledWith({ status: 'none' })
})

it('uses the freshest callback without reattaching the listener and cleans up in StrictMode', () => {
  const first = vi.fn()
  const latest = vi.fn()
  const add = vi.spyOn(window, 'addEventListener')
  const remove = vi.spyOn(window, 'removeEventListener')
  const { rerender, unmount } = render(<StrictMode><Probe options={{ onRestore: first }} /></StrictMode>)
  const registrations = () => add.mock.calls.filter(([type]) => type === 'popstate')
  const initialRegistrations = registrations().length
  rerender(<StrictMode><Probe options={{ onRestore: latest }} /></StrictMode>)
  expect(registrations()).toHaveLength(initialRegistrations)
  navigate(`/${query}`)
  expect(first).not.toHaveBeenCalled()
  expect(latest).toHaveBeenCalledExactlyOnceWith({ status: 'valid', search })
  unmount()
  const removals = remove.mock.calls.filter(([type]) => type === 'popstate')
  expect(removals).toHaveLength(initialRegistrations)
  for (const [, listener] of registrations()) {
    expect(removals.some(([, removed]) => removed === listener)).toBe(true)
  }
  navigate('/?ra=bad')
  expect(latest).toHaveBeenCalledTimes(1)
})
