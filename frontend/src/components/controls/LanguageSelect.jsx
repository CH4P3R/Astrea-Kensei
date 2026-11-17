import Select from '../common/Select.jsx'
import GlobalLine from '../common/GlobalLine.jsx'
import useTranslation from '../../i18n/useTranslation.js'
import { languages } from '../../i18n/resources.js'
import { useId } from 'react'
import Tooltip from '../common/Tooltip.jsx'
import InfoRounded from '../common/InfoRounded.jsx'

export default function LanguageSelect({ onOpenAbout }) {
  const { t, language, setLanguage } = useTranslation()
  const id = useId()
  const current = languages.find((option) => option.value === language)
  return <div className={`language-region${onOpenAbout ? ' language-region--about' : ''}`} data-image-obstacle>
    {onOpenAbout && <div className="language-actions">
    <Tooltip message={t('about.title')} inline>
      <button type="button" className="about-launcher" data-about-launcher aria-label={t('about.title')}
        aria-haspopup="dialog" onClick={onOpenAbout}>
        <InfoRounded />
      </button>
    </Tooltip>
    </div>}
    <Select id={id} className="language-select" label={t('common.language.label')}
      ariaLabel={t('common.language.current', { language: current.label })}
      value={language} onChange={setLanguage} options={languages} icon={<GlobalLine />}
      avoidSelector="[data-select-obstacle]" />
  </div>
}
