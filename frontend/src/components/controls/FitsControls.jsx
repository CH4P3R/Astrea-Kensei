import { useId, useState } from 'react'
import Tooltip from '../common/Tooltip.jsx'
import PanelContent from '../common/PanelContent.jsx'
import ScrubbableNumberField from '../common/ScrubbableNumberField.jsx'
import RangeField from '../common/RangeField.jsx'
import { coordinateError, cutoutSizeError } from '../../config/search.js'
import useTranslation from '../../i18n/useTranslation.js'
import ShareLink from '../../share/ShareLink.jsx'

export default function FitsControls({ fits, observer, warning, share }) {
  const { t, number } = useTranslation()
  const formId = useId()
  const { ra, dec } = fits.coordinates
  const [validation, setValidation] = useState('')
  const busy = fits.status === 'searching' || fits.status === 'loading'
  const hasResults = fits.images.length > 0
  const sizeError = t(cutoutSizeError(fits.size))
  const projectionReason = !observer
    ? t('search.projectionRequired') : ''

  function submit(event) {
    event.preventDefault()
    if (sizeError || busy) return
    const error = !ra.trim() || !dec.trim() ? 'search.validation.coordinates'
      : coordinateError(Number(ra), Number(dec))
    setValidation(error)
    if (!error) fits.searchByCoordinates(Number(ra), Number(dec))
  }

  function edit(field, value) {
    fits.setCoordinate(field, value)
    setValidation('')
  }

  return <PanelContent title={t('search.title')}
    header={<>
      <RangeField label={t('search.fields.size.label')} min={0.1} max={30} step={0.1}
        value={fits.size} displayValue={`${number(fits.size, { maximumFractionDigits: 1 })}′`}
        help={t('search.fields.size.help')}
        onChange={fits.setSize} />
      {!busy && !hasResults && !fits.active && <p>{t('search.intro')}</p>}
    </>}
    footer={<>
      {!busy && <Tooltip message={sizeError} tone="error">
        <button type="submit" form={formId} aria-disabled={Boolean(sizeError)}
          onClick={(event) => { if (sizeError) event.preventDefault() }}>{t('search.actions.search')}</button>
      </Tooltip>}
      {busy ? <button type="button" onClick={fits.cancel}>{t('search.actions.cancel')}</button>
        : fits.preparing ? <button type="button" onClick={() => { fits.cancelPreparation(); setValidation('') }}>
          {t('search.actions.cancelPreparation')}
        </button>
          : (fits.status !== 'idle' || fits.committed || fits.active || hasResults || warning === 'share.notices.invalid') && <button type="button" onClick={fits.reset}>
            {t('search.actions.clear')}
          </button>}
      {share && <ShareLink {...share} />}
    </>}>
    <form id={formId} onSubmit={submit}>
      <ScrubbableNumberField label={t('search.fields.ra.label')} name="ra" min={0} max={360} wrap required
        value={ra} disabled={busy} placeholder={t('search.fields.ra.placeholder')}
        help={t('search.fields.ra.help')}
        onValueChange={(value) => edit('ra', value)} />
      <ScrubbableNumberField label={t('search.fields.dec.label')} name="dec" min={-90} max={90} required
        value={dec} disabled={busy} placeholder={t('search.fields.dec.placeholder')}
        help={t('search.fields.dec.help')}
        onValueChange={(value) => edit('dec', value)} />
      {validation && <p role="alert">{t(validation)}</p>}
    </form>
    {warning === 'share.notices.invalid' && <p role="status">{t(warning)}</p>}
    {!fits.active && fits.error && <p role="alert">{t(fits.error)}</p>}
    {!busy && !fits.preparing && !fits.active && fits.status === 'results' && !hasResults && <p role="status">{t('search.results.empty')}</p>}
    {!busy && !fits.preparing && hasResults && !fits.active && <Tooltip message={projectionReason} tone="error">
      <button type="button" aria-disabled={Boolean(projectionReason)}
        onClick={() => { if (!projectionReason) fits.load(fits.images[0].id) }}>{t('search.actions.loadLatest')}</button>
    </Tooltip>}
  </PanelContent>
}
