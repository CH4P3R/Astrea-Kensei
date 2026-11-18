import { useId, useState } from 'react'
import PanelContent from '../common/PanelContent.jsx'
import ScrubbableNumberField from '../common/ScrubbableNumberField.jsx'
import useTranslation from '../../i18n/useTranslation.js'

export default function LocationControls({ observer, status, error, locate, applyManualLocation }) {
  const { t, number } = useTranslation()
  const [validation, setValidation] = useState('')
  // Untouched fields follow device/external locations; edited fields remain
  // drafts until Apply, even if a pending geolocation request finishes.
  const [draft, setDraft] = useState({})
  const formId = useId()

  function submit(event) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const latitude = data.get('latitude').trim()
    const longitude = data.get('longitude').trim()
    if (!latitude || !longitude || !applyManualLocation(Number(latitude), Number(longitude))) {
      setValidation('location.validation')
      return
    }
    setValidation('')
    setDraft({})
  }

  function edit(field, value) {
    setDraft((current) => ({ ...current, [field]: value }))
    setValidation('')
  }

  return <PanelContent title={t('location.title')} header={<p role="status">{observer
    ? t('location.coordinates', {
      source: t(`location.source.${observer.source}`),
      latitude: number(observer.latitude, { minimumFractionDigits: 4, maximumFractionDigits: 4 }),
      longitude: number(observer.longitude, { minimumFractionDigits: 4, maximumFractionDigits: 4 }),
    }) : t('location.intro')}</p>}
    footer={<>
      <button type="button" onClick={() => { setDraft({}); setValidation(''); locate() }} disabled={status === 'loading'}>
        {t(status === 'loading' ? 'location.actions.locating' : 'location.actions.device')}
      </button>
      <button type="submit" form={formId}>{t('location.actions.apply')}</button>
    </>}>
    {error && <p role="alert">{t(error)}</p>}
    <form id={formId} onSubmit={submit}>
      <ScrubbableNumberField label={t('location.latitude.label')} name="latitude" min={-90} max={90} required
        value={draft.latitude ?? String(observer?.latitude ?? '')} onValueChange={(value) => edit('latitude', value)}
        placeholder={t('location.latitude.placeholder')}
        help={t('location.latitude.help')} />
      <ScrubbableNumberField label={t('location.longitude.label')} name="longitude" min={-180} max={180} required
        value={draft.longitude ?? String(observer?.longitude ?? '')} onValueChange={(value) => edit('longitude', value)}
        placeholder={t('location.longitude.placeholder')}
        help={t('location.longitude.help')} />
      {validation && <p role="alert">{t(validation)}</p>}
    </form>
  </PanelContent>
}
