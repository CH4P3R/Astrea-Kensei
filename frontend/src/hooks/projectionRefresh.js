import { loadProjection, observerContext } from '../services/images.js'
import { errorMessage } from '../i18n/messages.js'

export function projectionContextKey(observer, context) {
  if (!observer || !Number.isFinite(observer.latitude) || !Number.isFinite(observer.longitude)
    || !['live', 'paused'].includes(context?.mode)) return null
  const at = context.mode === 'paused' ? Date.parse(context.at) : null
  if (context.mode === 'paused' && !Number.isFinite(at)) return null
  return JSON.stringify([observer.latitude, observer.longitude, context.mode, at])
}

export function projectionContext(key) {
  if (!key) return null
  const [latitude, longitude, mode, at] = JSON.parse(key)
  return { observer: { latitude, longitude }, timeContext: mode === 'live'
    ? { mode } : { mode, at: new Date(at).toISOString() } }
}

// Live rendering uses the wall clock, not the HUD's once-per-second timestamp.
// A new response can start several hundred milliseconds after that HUD tick.
export function projectionTime(context, timestamp = Date.parse(context?.at)) {
  return context?.mode === 'live' ? Date.now() : timestamp
}

export function projectionIsCurrent(projection, timestamp) {
  const times = projection?.sample_times_ms
  return Boolean(Array.isArray(times) && times.length && Number.isFinite(timestamp)
    && Number.isFinite(times[0]) && Number.isFinite(times.at(-1))
    && timestamp >= times[0] && timestamp <= times.at(-1))
}

export function originalProjection(active, contextKey) {
  return projectionContextKey(active.observer, active.timeContext) === contextKey ? active.projection : null
}

function refreshDelay(projection) {
  const times = projection.sample_times_ms
  const lead = Math.min(60000, Math.max(1000, (times.at(-1) - times[0]) / 2))
  return Math.max(0, times.at(-1) - Date.now() - lead)
}

// One request/timer per image survives list additions and equivalent React props.
// A different observing context owns a different manager and cancels every job.
export function createProjectionRefresh(contextKey, context, publish) {
  const records = new Map()
  const requests = new Set()
  const queue = []
  let disposed = false
  const current = (record) => !disposed && records.get(record.id) === record
  const emit = (record) => {
    if (current(record)) publish({ id: record.id, source: record.source, contextKey,
      projection: record.projection, error: record.error })
  }

  function clear(record) {
    window.clearTimeout(record.timer)
    window.clearTimeout(record.expiry)
    window.clearTimeout(record.deadline)
    record.controller?.abort()
    requests.delete(record.controller)
  }

  function expiry(record) {
    window.clearTimeout(record.expiry)
    if (context.timeContext.mode !== 'live' || !record.projection) return
    const remaining = record.projection.sample_times_ms.at(-1) - Date.now()
    if (remaining >= 0) record.expiry = window.setTimeout(() => emit(record), remaining + 1)
  }

  function schedule(record, delay) {
    window.clearTimeout(record.timer)
    if (current(record) && context.timeContext.mode === 'live') {
      record.timer = window.setTimeout(() => enqueue(record), delay)
    }
  }

  function enqueue(record) {
    if (!current(record) || record.queued || record.controller) return
    record.queued = true
    queue.push(record)
    drain()
  }

  function drain() {
    while (!disposed && requests.size < 3 && queue.length) {
      const record = queue.shift()
      record.queued = false
      if (!current(record) || record.controller) continue
      const controller = new AbortController()
      record.controller = controller
      requests.add(controller)
      let deadline
      let timedOut = false
      const valid = () => current(record) && record.controller === controller
        && (!controller.signal.aborted || timedOut)
      Promise.resolve().then(async () => {
        if (!valid()) return
        try {
          const timeout = new Promise((_, reject) => {
            deadline = window.setTimeout(() => {
              timedOut = true
              reject(new TypeError('The projection request timed out.'))
              controller.abort()
            }, 30000)
            record.deadline = deadline
          })
          const next = await Promise.race([loadProjection(record.id,
            observerContext(context.observer, context.timeContext), controller.signal), timeout])
          if (!valid()) return
          if (!projectionIsCurrent(next, projectionTime(context.timeContext))) {
            throw new Error('The projection response does not cover the current observing time.')
          }
          // Replace only after validation. The old, still-current projection is
          // available throughout the request, including transient failures.
          record.projection = next
          record.error = ''
          record.failures = 0
          emit(record)
          expiry(record)
          // A slow/cached response may have little coverage left. Keep trying
          // ahead of expiry without turning successful responses into a loop.
          schedule(record, Math.max(1000, refreshDelay(next)))
        } catch (failure) {
          if (!valid()) return
          record.error = errorMessage(failure)
          record.failures += 1
          emit(record)
          schedule(record, Math.min(30000, 5000 * 2 ** Math.min(record.failures - 1, 3)))
        }
      }).finally(() => {
        window.clearTimeout(deadline)
        requests.delete(controller)
        if (record.controller === controller) record.controller = null
        drain()
      })
    }
  }

  return {
    reconcile(images) {
      const ids = new Set(images.map((image) => image.metadata.id))
      for (const [id, record] of records) {
        if (!ids.has(id)) { records.delete(id); clear(record) }
      }
      for (const active of images) {
        const id = active.metadata.id
        const previous = records.get(id)
        if (previous?.source === active.metadata) continue
        if (previous) clear(previous)
        const record = { id, source: active.metadata, projection: originalProjection(active, contextKey),
          error: '', failures: 0, controller: null, queued: false, timer: null, expiry: null }
        records.set(id, record)
        expiry(record)
        if (projectionIsCurrent(record.projection, projectionTime(context.timeContext))) {
          schedule(record, refreshDelay(record.projection))
        } else enqueue(record)
      }
      drain()
    },
    retry(id) {
      for (const record of records.values()) {
        if (id !== undefined && record.id !== id) continue
        window.clearTimeout(record.timer)
        window.clearTimeout(record.deadline)
        record.controller?.abort()
        requests.delete(record.controller)
        record.controller = null
        enqueue(record)
      }
    },
    dispose() {
      disposed = true
      for (const record of records.values()) clear(record)
      records.clear()
      queue.length = 0
    },
  }
}
