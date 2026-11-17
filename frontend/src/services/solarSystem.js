import { apiError } from '../i18n/messages.js'
import { prepareSolarSnapshot } from '../three/core/solarSystemUtils.js'

export async function loadSolarSystem(context, signal) {
  const response = await fetch('/api/v1/solar-system', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(context), signal,
  })
  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw apiError(response.status, error.detail)
  }
  return prepareSolarSnapshot(await response.json())
}
