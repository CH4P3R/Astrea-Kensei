import useTranslation from '../../i18n/useTranslation.js'
import useSpectralComparison from '../../hooks/useSpectralComparison.js'
import { validSpectralTarget } from '../../services/spectralComparison.js'
import HelpButton from '../common/HelpButton.jsx'

const UNAVAILABLE_REASONS = new Set(['outside_image', 'invalid_wcs', 'calibration_unavailable', 'calibration_mismatch', 'invalid_calibration'])
const resultAt = (entry, target) => entry?.result && entry.result.target.ra_deg === target?.ra_deg
  && entry.result.target.dec_deg === target?.dec_deg ? entry.result : null

export default function SpectralComparison({ frames, primary }) {
  const { t, number } = useTranslation()
  const target = primary.metadata.requested
  const { byId, retry } = useSpectralComparison(frames, target)
  const reference = resultAt(byId[primary.metadata.id], target)
  const referenceSample = reference?.status === 'available' ? reference.sample : null
  const format = (value) => number(value, { maximumSignificantDigits: 6 })
  return <section className="inspector-section comparison-spectral" aria-label={t('inspector.spectral.title')}>
    <h3>{t('inspector.spectral.title')}<HelpButton label={t('inspector.spectral.title')} message={t('inspector.spectral.help')} /></h3>
    {validSpectralTarget(target) ? <>
      <p className="context-note">{t('inspector.spectral.target', {
        ra: number(target.ra_deg, { maximumFractionDigits: 6 }), dec: number(target.dec_deg, { maximumFractionDigits: 6 }),
      })}</p>
      <ul className="comparison-spectral-list">
        {frames.map((frame) => {
          const entry = byId[frame.id]
          const result = resultAt(entry, target)
          const sample = result?.status === 'available' ? result.sample : null
          return <li key={frame.id} aria-label={t(frame.reference ? 'inspector.compare.reference' : 'inspector.compare.frame', { frame: frame.label })}>
            <strong>{frame.label}</strong>
            <div className="comparison-spectral-values">
              {sample ? <>
                <span>{t('inspector.spectral.sample', { wavelength: format(sample.wavelength_um), bandwidth: format(sample.bandwidth_um) })}</span>
                {!frame.reference && <span className="context-note">{referenceSample
                  ? t('inspector.spectral.difference', { difference: number(sample.wavelength_um - referenceSample.wavelength_um,
                    { maximumSignificantDigits: 6, signDisplay: 'exceptZero' }) })
                  : t('inspector.spectral.referenceUnavailable')}</span>}
              </> : entry?.status === 'error' ? <>
                <span className="context-note">{t('inspector.spectral.failed')}</span>
                <button type="button" className="text-action" onClick={() => retry(frame.id)}
                  aria-label={t('inspector.spectral.retry', { frame: frame.label })}>{t('inspector.actions.retry')}</button>
              </> : result
                ? <span className="context-note">{t(`inspector.spectral.${UNAVAILABLE_REASONS.has(result?.reason) ? result.reason : 'unavailable'}`)}</span>
                : <span className="context-note">{t('inspector.spectral.loading')}</span>}
            </div>
          </li>
        })}
      </ul>
      <p className="context-note">{t('inspector.spectral.scope')}</p>
    </> : <p className="context-note">{t('inspector.spectral.noTarget')}</p>}
  </section>
}
