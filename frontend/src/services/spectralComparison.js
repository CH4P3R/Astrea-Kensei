import { loadSpectralSample } from './images.js'

const MAX_CONCURRENT = 3
const REQUEST_TIMEOUT_MS = 130000
const EMPTY = Object.freeze({})

export function validSpectralTarget(target) {
  return Number.isFinite(target?.ra_deg) && target.ra_deg >= 0 && target.ra_deg < 360
    && Number.isFinite(target?.dec_deg) && target.dec_deg >= -90 && target.dec_deg <= 90
}

function validateResult(result, id, target) {
  if (result?.image_id !== id || result.target?.frame !== 'ICRS'
    || result.target.ra_deg !== target.ra_deg || result.target.dec_deg !== target.dec_deg) {
    throw new Error('Spectral response does not match the requested observation and position.')
  }
  if (result.status === 'unavailable') return result
  const sample = result.sample
  if (result.status !== 'available' || !sample
    || !['pixel_x', 'pixel_y', 'detector_x', 'detector_y'].every((key) => Number.isSafeInteger(sample[key]) && sample[key] >= 1)
    || !Number.isFinite(sample.wavelength_um) || sample.wavelength_um <= 0
    || !Number.isFinite(sample.bandwidth_um) || sample.bandwidth_um <= 0
    || result.calibration?.method !== 'CWAVE/CBAND') {
    throw new Error('Invalid calibrated spectral sample.')
  }
  return result
}

// Tasks belong to immutable cutout identities and one fixed ICRS point. Scene
// time, projection renewal and the currently displayed frame never enter here.
export function createSpectralLoader(load = loadSpectralSample) {
  const records = new Map()
  const listeners = new Set()
  let snapshot = EMPTY
  let target = null
  let targetKey = null
  let running = 0
  let active = true

  const publish = () => {
    snapshot = Object.fromEntries([...records].map(([id, entry]) => [id, entry.value]))
    for (const listener of listeners) listener()
  }
  const cancel = (record) => {
    clearTimeout(record.timer)
    record.controller?.abort()
    if (record.running) { record.running = false; running -= 1 }
  }
  const settle = (id, record, value) => {
    if (!active || records.get(id) !== record || !record.running) return
    clearTimeout(record.timer)
    record.running = false
    running -= 1
    record.value = value
    publish()
    pump()
  }
  const pump = () => {
    if (!active || !target) return
    for (const [id, record] of records) {
      if (running >= MAX_CONCURRENT) break
      if (record.value.status !== 'queued') continue
      record.controller = new AbortController()
      record.running = true
      running += 1
      record.value = { status: 'loading' }
      const requestedTarget = { ...target }
      record.timer = setTimeout(() => {
        record.controller.abort()
        settle(id, record, { status: 'error' })
      }, REQUEST_TIMEOUT_MS)
      Promise.resolve().then(() => {
        if (record.controller.signal.aborted) throw new DOMException('Aborted', 'AbortError')
        return load(id, requestedTarget, record.controller.signal)
      }).then((result) => {
        settle(id, record, { status: 'complete', result: validateResult(result, id, requestedTarget) })
      }).catch(() => settle(id, record, { status: 'error' }))
    }
    publish()
  }

  return {
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener) },
    getSnapshot() { return snapshot },
    setImages(ids, requestedTarget) {
      active = true
      const nextTarget = validSpectralTarget(requestedTarget)
        ? { ra_deg: requestedTarget.ra_deg, dec_deg: requestedTarget.dec_deg } : null
      const nextKey = JSON.stringify(nextTarget)
      const keep = new Set(nextTarget ? ids : [])
      for (const [id, record] of records) {
        if (targetKey !== nextKey || !keep.has(id)) { cancel(record); records.delete(id) }
      }
      target = nextTarget
      targetKey = nextKey
      for (const id of keep) {
        if (!records.has(id)) records.set(id, { value: { status: 'queued' }, running: false })
      }
      pump()
    },
    retry(id) {
      const record = records.get(id)
      if (!record || record.running || !active) return
      records.set(id, { value: { status: 'queued' }, running: false })
      pump()
    },
    dispose() {
      active = false
      for (const record of records.values()) cancel(record)
      records.clear()
      target = null
      targetKey = null
      snapshot = EMPTY
    },
  }
}
