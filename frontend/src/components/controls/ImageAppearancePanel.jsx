import { useId } from 'react'
import PanelContent from '../common/PanelContent.jsx'
import HelpButton from '../common/HelpButton.jsx'
import Select from '../common/Select.jsx'
import RangeField from '../common/RangeField.jsx'
import CheckboxField from '../common/CheckboxField.jsx'
import useTranslation from '../../i18n/useTranslation.js'
import { IMAGE_PALETTES, imagePaletteGradient, imagePaletteIndex } from '../../config/appearance.js'

export default function ImageAppearancePanel({ appearance }) {
  const { t, number } = useTranslation()
  const id = useId()
  const palette = IMAGE_PALETTES[imagePaletteIndex(appearance.settings.palette)].id
  return <PanelContent title={t('inspector.tabs.appearance')}
    footer={<button type="button" onClick={appearance.restore}>{t('inspector.appearance.restore')}</button>}>
    <section className="inspector-section">
      <h3>{t('inspector.appearance.visual')}</h3>
      <div className="inspector-field-heading"><label htmlFor={id}>{t('inspector.appearance.palette')}</label>
        <HelpButton label={t('inspector.appearance.palette')} message={t('inspector.help.palette')} /></div>
      <Select id={id} label={t('inspector.appearance.palette')} value={palette}
        onChange={(value) => appearance.change('palette', value)} options={IMAGE_PALETTES.map(({ id: value }) => ({ value, label: t(`inspector.appearance.${value}`) }))} />
      <div className="intensity-legend" role="img" aria-label={`${t(`inspector.appearance.${palette}`)}: ${t('inspector.appearance.legend')}`}
        style={{ '--intensity-gradient': imagePaletteGradient(palette) }}>
        <span>{t('inspector.appearance.faint')}</span><span>{t('inspector.appearance.bright')}</span>
      </div>
      <RangeField label={t('inspector.appearance.exposure')} min={-3} max={3} step={0.1}
        value={appearance.settings.exposure} displayValue={`${number(appearance.settings.exposure, { maximumFractionDigits: 1 })} EV`}
        onChange={(value) => appearance.change('exposure', value)} />
      <RangeField label={t('inspector.appearance.opacity')} min={0} max={1} step={0.05}
        value={appearance.settings.opacity} displayValue={`${Math.round(appearance.settings.opacity * 100)} %`}
        onChange={(value) => appearance.change('opacity', value)} />
    </section>
    <section className="inspector-section">
      <h3>{t('inspector.appearance.processing')}</h3>
      {['mask_flags', 'subtract_zodi', 'signal_to_noise'].map((key) => <div className="inspector-toggle" key={key}>
        <CheckboxField label={t(`inspector.appearance.${key}`)} checked={appearance.processing[key]}
          onChange={(event) => appearance.process(key, event.target.checked)} />
        <HelpButton label={t(`inspector.appearance.${key}`)} message={t(`inspector.help.${key}`)} />
      </div>)}
      {appearance.loading && <p role="status">{t('inspector.appearance.loading')}</p>}
      {appearance.error && <div role="alert"><p>{t('inspector.appearance.failed')} {t(appearance.error)}</p>
        <button type="button" onClick={appearance.retry}>{t('inspector.actions.retry')}</button></div>}
    </section>
  </PanelContent>
}
