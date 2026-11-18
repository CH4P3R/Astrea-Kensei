import { useLayoutEffect, useRef, useSyncExternalStore } from 'react'
import useTranslation from '../../i18n/useTranslation.js'
import { readPixelInfo } from '../../three/core/pixelInfoUtils.js'
import { observationTimestamp } from '../../config/comparison.js'
import '../../styles/components/pixel-tooltip.css'

export default function PixelTooltip({ store }) {
  const hit = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)
  const tooltip = useRef(null)
  const { t, number, date } = useTranslation()
  const info = hit && readPixelInfo(hit.active, hit.uv, {
    displayPixels: hit.pixels, appliedProcessing: hit.appliedProcessing,
  })

  useLayoutEffect(() => {
    const element = tooltip.current
    if (!element || !hit) return
    const position = () => {
      const viewport = window.visualViewport
      const left = viewport?.offsetLeft ?? 0
      const top = viewport?.offsetTop ?? 0
      const right = left + (viewport?.width ?? window.innerWidth)
      const bottom = top + (viewport?.height ?? window.innerHeight)
      const { width, height } = element.getBoundingClientRect()
      const x = Math.max(left + 8, Math.min(hit.clientX + 16, right - width - 8))
      const y = Math.max(top + 8, hit.clientY + 16 + height < bottom - 8
        ? hit.clientY + 16 : hit.clientY - height - 16)
      element.style.setProperty('--pixel-x', `${x}px`)
      element.style.setProperty('--pixel-y', `${y}px`)
    }
    position()
    const observer = new ResizeObserver(position)
    observer.observe(element)
    window.addEventListener('resize', position)
    return () => { observer.disconnect(); window.removeEventListener('resize', position) }
  }, [hit, info, t])

  if (!info) return null
  const formatValue = (datum) => datum.status === 'finite'
    ? number(datum.value, { maximumSignificantDigits: 7,
      notation: datum.value !== 0 && (Math.abs(datum.value) < 0.0001 || Math.abs(datum.value) >= 1e7) ? 'scientific' : 'standard' })
    : t(`inspector.pixel.${datum.status}`)
  const unit = (datum) => datum.dimensionless ? t('inspector.pixel.dimensionless')
    : datum.unit || t('inspector.pixel.unknownUnit')
  const metadata = hit.active.metadata
  const acquired = observationTimestamp(metadata.observation?.start_utc)
  return <aside ref={tooltip} className="pixel-tooltip" role="tooltip" aria-label={t('inspector.pixel.title')}>
    <strong>{t('inspector.pixel.coordinates', { x: info.x, y: info.y })}</strong>
    <span className="pixel-tooltip__observation">{metadata.observation_id || info.imageId}</span>
    {acquired !== null && <span className="pixel-tooltip__observation">{date(acquired, {
      timeZone: 'UTC', year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit',
    })} UTC{metadata.detector ? ` · D${metadata.detector}` : ''}</span>}
    <dl>
      <dt>{t('inspector.pixel.original')}</dt><dd>{formatValue(info.original)} <small>{unit(info.original)}</small></dd>
      {info.processed && <><dt>{t('inspector.pixel.processed')}</dt>
        <dd>{formatValue(info.processed)} <small>{unit(info.processed)}</small></dd></>}
      {info.display.status === 'visible' && <><dt>{t('inspector.pixel.normalized')}</dt>
        <dd>{number(info.display.normalizedValue, { maximumFractionDigits: 4 })}</dd></>}
    </dl>
    {info.display.status === 'masked-or-invalid' && <span>{t('inspector.pixel.masked')}</span>}
    <span className="pixel-tooltip__origin">{t('inspector.pixel.origin')}</span>
  </aside>
}
