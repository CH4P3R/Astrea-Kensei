import { useId } from 'react'
import PanelContent from '../common/PanelContent.jsx'
import Select from '../common/Select.jsx'
import HelpButton from '../common/HelpButton.jsx'
import ObservationDate from '../controls/ObservationDate.jsx'
import PlaybackControls from './PlaybackControls.jsx'
import ComparisonTimeline from './ComparisonTimeline.jsx'
import ComparisonDateSelector from './ComparisonDateSelector.jsx'
import SpectralComparison from './SpectralComparison.jsx'
import useTranslation from '../../i18n/useTranslation.js'
import '../../styles/components/comparison.css'

function ObservationIdentity({ metadata }) {
  return <div className="comparison-observation">
    <ObservationDate value={metadata.observation.start_utc} />
    <span className="context-note">D{metadata.detector ?? '—'} · {metadata.collection}</span>
  </div>
}

export default function ImageComparisonPanel({ comparison, playback, reason, primary, frames, projections }) {
  const { t } = useTranslation()
  const id = useId()
  const loading = comparison.status === 'loading'
  const searching = comparison.status === 'searching'
  const busy = loading || searching
  const loadedIds = new Set(frames.map((frame) => frame.id))
  const returnToReference = () => playback.show(primary.metadata.id)
  const removeFrame = (frameId) => { returnToReference(); comparison.remove(frameId) }
  const pendingFrames = frames.filter((frame) => !projections.byId[frame.id]?.ready)
  return <PanelContent title={t('inspector.tabs.compare')}>
    <section className="comparison-player" aria-label={t('inspector.compare.sequence')}>
      <ComparisonTimeline frames={frames} playback={playback} reason={reason} loading={loading} onRemove={removeFrame}
        onClear={() => { returnToReference(); comparison.clear() }} />
      {frames.length > 1 && <PlaybackControls playback={playback} reason={reason} frames={frames} />}
    </section>
    <SpectralComparison frames={frames} primary={primary} />
    <div className="comparison-browser">
      <section className="inspector-section comparison-search">
        <h3>{t('inspector.compare.select')}<HelpButton label={t('inspector.compare.select')} message={t('inspector.help.candidates')} /></h3>
        <div className="comparison-discovery">
          <ComparisonDateSelector value={comparison.year} disabled={loading}
            onChange={(year) => { playback.pause(); comparison.setYear(year) }} />
          <p className="context-note">{t('inspector.compare.yearScope')}</p>
          <div className="inspector-field-heading"><label htmlFor={id}>{t('inspector.compare.criteria')}</label>
            <HelpButton label={t('inspector.compare.criteria')} message={t('inspector.help.criteria')} /></div>
          <Select id={id} label={t('inspector.compare.criteria')} value={comparison.sameDetector ? 'same' : 'any'} disabled={loading}
            options={['same', 'any'].map((value) => ({ value, label: t(`inspector.compare.${value}`, { detector: primary.metadata.detector ?? '—' }) }))}
            onChange={(value) => { playback.pause(); comparison.setSameDetector(value === 'same') }} />
          {(busy || comparison.status === 'error' || comparison.status === 'cancelled') && <div className="comparison-actions">
            {busy ? <button type="button" onClick={comparison.cancel}>{t('search.actions.cancel')}</button>
              : <button type="button" className="comparison-search-button" onClick={comparison.retry}>
                {t('inspector.compare.retryYear')}
              </button>}
          </div>}
        </div>
        {loading && <p role="status">{t('inspector.compare.loading')}</p>}
        {searching && <p role="status" className="context-note">{t('inspector.compare.yearSearching', { year: String(comparison.year) })}</p>}
        {comparison.error && <p role="alert">{t(comparison.error)}</p>}
        {comparison.status === 'cancelled' && <p className="context-note">{t('inspector.compare.yearCancelled')}</p>}
      </section>
      {pendingFrames.length > 0 && <section className="inspector-section comparison-projection-status" aria-label={t('inspector.compare.sequence')}>
        {pendingFrames.map((frame) => {
          const projection = projections.byId[frame.id]
          return <div className="comparison-projection-message" key={frame.id} role={projection?.error ? 'alert' : 'status'}>
            <p className="context-note"><strong>{frame.label}</strong> · {t(projection?.error || 'inspector.projection.waiting')}</p>
            {projection?.error && <div className="comparison-row-actions">
              <button type="button" onClick={() => { playback.pause(); projections.retry(frame.id) }}>{t('inspector.actions.retryProjection')}</button>
              {!frame.reference && <button type="button" disabled={loading} aria-label={t('inspector.compare.removeFrame', { frame: frame.label })}
                onClick={() => removeFrame(frame.id)}>{t('inspector.compare.remove')}</button>}
            </div>}
          </div>
        })}
      </section>}
      <section className="inspector-section comparison-results" aria-busy={searching}>
        <h3>{t('inspector.compare.results')}</h3>
        {comparison.dirty ? !searching && !comparison.error && comparison.status !== 'cancelled'
          && <p className="context-note">{t('inspector.compare.draft')}</p>
          : comparison.searchedYear ? <>
            <p className="context-note">{t('inspector.compare.resultsYear', { year: String(comparison.searchedYear) })}</p>
            {comparison.status === 'results' && !comparison.error && comparison.candidates.length === 0
              && <p>{t('inspector.compare.empty')}</p>}
            <ul className="comparison-list comparison-candidates">
              {comparison.candidates.map((image) => {
                const added = loadedIds.has(image.id)
                return <li className="comparison-candidate" key={image.id}>
                  <ObservationIdentity metadata={image} />
                  <button type="button" disabled={busy || added}
                    aria-label={t(added ? 'inspector.compare.added' : 'inspector.compare.addObservation', { date: image.observation.start_utc })}
                    onClick={() => { playback.pause(); comparison.load(image.id) }}>
                    {t(added ? 'inspector.compare.added' : comparison.pendingId === image.id ? 'inspector.compare.adding' : 'inspector.compare.add')}
                  </button>
                </li>
              })}
            </ul>
            {comparison.hasMore && <p className="context-note">{t('inspector.compare.limited')}</p>}
          </> : <p className="context-note">{t('inspector.compare.startSearch')}</p>}
      </section>
    </div>
  </PanelContent>
}
