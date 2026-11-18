import { useId, useState } from 'react'
import PanelContent from '../common/PanelContent.jsx'
import InputField from '../common/InputField.jsx'
import useTranslation from '../../i18n/useTranslation.js'
import '../../styles/components/time-controls.css'

export default function TimeControls({ clock }) {
  const { t } = useTranslation()
  const [error, setError] = useState('')
  const formId = useId()
  function submit(event) {
    event.preventDefault()
    const value = new FormData(event.currentTarget).get('utc')
    const timestamp = Date.parse(`${value}Z`)
    if (!Number.isFinite(timestamp)) {
      setError('time.validation')
      return
    }
    setError('')
    clock.apply(timestamp)
  }
  return <PanelContent title={t('time.title')} header={
    <p className="time-status" data-live={!clock.paused}>
      <span className="time-status__indicator" aria-hidden="true" />
      {t(clock.paused ? 'time.status.paused' : 'time.status.live')}
    </p>}
    footer={<>
      <button type="button" onClick={clock.paused ? clock.goLive : clock.pause}>
        {t(clock.paused ? 'time.actions.goLive' : 'time.actions.pause')}
      </button>
      <button type="submit" form={formId}>{t('time.actions.apply')}</button>
    </>}>
    <form id={formId} onSubmit={submit}>
      <InputField label={t('time.utc.label')} type="datetime-local" name="utc" required step="1"
        help={t('time.utc.help')} />
      {error && <p role="alert">{t(error)}</p>}
    </form>
    <p className="context-note">{new Date(clock.timestamp).toISOString()} · UTC</p>
    <p className="context-note">{t('time.acquisitionNote')}</p>
  </PanelContent>
}
