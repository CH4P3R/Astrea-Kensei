import PanelContent from '../common/PanelContent.jsx'
import CheckboxField from '../common/CheckboxField.jsx'
import HelpButton from '../common/HelpButton.jsx'
import RangeField from '../common/RangeField.jsx'
import useTranslation from '../../i18n/useTranslation.js'
import '../../styles/components/sky-controls.css'

const guideOptions = ['constellations', 'ecliptic', 'equatorial']

export default function SkyControls({ stars, surfaceVisible, setSurfaceVisible, groundOpacity, setGroundOpacity, dustVisible, setDustVisible,
  observer, skyGuides, setSkyGuides, solarSystem, solarVisible, setSolarVisible, deepSkyVisible, setDeepSkyVisible }) {
  const { t, number } = useTranslation()
  const groundPercentage = number(groundOpacity, { style: 'percent', maximumFractionDigits: 0 })
  const status = stars.status === 'idle' ? t('sky.status.idle')
    : stars.status === 'loading' ? t('sky.status.loading')
      : stars.snapshot ? t('sky.status.ready', { count: stars.snapshot.star_count })
        : t('sky.status.unavailable')

  return <PanelContent title={t('sky.title')}
    header={<p className="context-note" role="status">{status}</p>}
    footer={stars.status === 'error' && <button type="button" onClick={stars.retry}>{t('sky.retry')}</button>}>
    <CheckboxField label={t('sky.surface.label')} checked={surfaceVisible}
      onChange={(event) => setSurfaceVisible(event.target.checked)} />
    <RangeField label={t('sky.surface.darkness.label')} help={t('sky.surface.darkness.help')}
      min={0} max={1} step={0.01} value={groundOpacity} displayValue={groundPercentage}
      aria-valuetext={groundPercentage} disabled={!surfaceVisible} onChange={setGroundOpacity} />
    <CheckboxField label={t('sky.dust.label')} checked={dustVisible}
      onChange={(event) => setDustVisible(event.target.checked)} />
    <div className="sky-guide-option">
      <CheckboxField label={t('sky.deepSky.label')} checked={deepSkyVisible} disabled={!observer}
        aria-describedby={`sky-deep-sky-help${observer ? '' : ' sky-guides-location-help'}`}
        onChange={(event) => setDeepSkyVisible(event.target.checked)} />
      <HelpButton id="sky-deep-sky-help" label={t('sky.deepSky.label')} message={t('sky.deepSky.help')} />
    </div>
    <div className="sky-guide-option">
      <CheckboxField label={t('sky.solar.label')} checked={solarVisible} disabled={!observer}
        aria-describedby={`sky-solar-help${observer ? '' : ' sky-guides-location-help'}`}
        onChange={(event) => setSolarVisible(event.target.checked)} />
      <HelpButton id="sky-solar-help" label={t('sky.solar.label')} message={t('sky.solar.help')} />
    </div>
    {solarVisible && solarSystem.status === 'loading' && !solarSystem.snapshot
      && <p role="status" className="context-note">{t('sky.solar.loading')}</p>}
    {solarVisible && solarSystem.error && <p role="alert">{t(solarSystem.error)}</p>}
    {solarVisible && solarSystem.status === 'error'
      && <button type="button" onClick={solarSystem.retry}>{t('sky.solar.retry')}</button>}
    {guideOptions.map((id) => <div className="sky-guide-option" key={id}>
      <CheckboxField label={t(`sky.guides.${id}.label`)} checked={skyGuides[id]} disabled={!observer}
        aria-describedby={`sky-guide-${id}-help${observer ? '' : ' sky-guides-location-help'}`}
        onChange={(event) => {
          const checked = event.target.checked
          setSkyGuides((current) => ({ ...current, [id]: checked }))
        }} />
      <HelpButton id={`sky-guide-${id}-help`} label={t(`sky.guides.${id}.label`)} message={t(`sky.guides.${id}.help`)} />
    </div>)}
    {!observer && <p id="sky-guides-location-help" className="context-note">{t('sky.guides.locationRequired')}</p>}
    {stars.error && <p role="alert">{t(stars.error)}</p>}
  </PanelContent>
}
