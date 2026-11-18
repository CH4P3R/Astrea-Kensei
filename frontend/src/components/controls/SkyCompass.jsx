import useTranslation from '../../i18n/useTranslation.js'

export default function SkyCompass({ markerRef }) {
  const { t } = useTranslation()
  return <div className="sky-compass">
    <svg viewBox="0 0 100 100" role="img" aria-label={t('sky.compass.label')}>
      <g className="sky-compass__grid" fill="none" stroke="currentColor">
        <circle cx="50" cy="50" r="31" />
        <path d="M50 13v6M50 81v6M13 50h6M81 50h6" />
      </g>
      <g className="sky-compass__labels" fill="currentColor" textAnchor="middle" dominantBaseline="central">
        <text x="50" y="8">{t('sky.directions.north.short')}</text>
        <text x="92" y="50">{t('sky.directions.east.short')}</text>
        <text x="50" y="92">{t('sky.directions.south.short')}</text>
        <text x="8" y="50">{t('sky.directions.west.short')}</text>
      </g>
      <circle ref={markerRef} className="sky-compass__position" cx="50" cy="22" r="2.8" />
    </svg>
  </div>
}
