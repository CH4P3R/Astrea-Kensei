import Tooltip from './Tooltip.jsx'
import useTranslation from '../../i18n/useTranslation.js'
import InfoRounded from './InfoRounded.jsx'

export default function HelpButton({ label, message, id }) {
  const { t } = useTranslation()
  return <Tooltip id={id} message={message} placement="bottom" inline>
    <button type="button" className="input-help" aria-label={t('common.fieldHelp', { label })}>
      <InfoRounded />
    </button>
  </Tooltip>
}
