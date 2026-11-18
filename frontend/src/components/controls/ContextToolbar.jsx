import ContextPanel from '../common/ContextPanel.jsx'
import Tooltip from '../common/Tooltip.jsx'
import ContextIcon from './ContextIcons.jsx'
import TimeControls from './TimeControls.jsx'
import LocationControls from './LocationControls.jsx'
import FitsControls from './FitsControls.jsx'
import SkyControls from './SkyControls.jsx'
import useTranslation from '../../i18n/useTranslation.js'
import SkyCompass from './SkyCompass.jsx'

const sections = ['time', 'location', 'search', 'sky']
export default function ContextToolbar({ clock, location, fits, menu, warning, share, stars, surfaceVisible, setSurfaceVisible, dustVisible, setDustVisible,
  skyGuides, setSkyGuides, solarSystem, solarVisible, setSolarVisible, compassMarkerRef, groundOpacity, setGroundOpacity,
  deepSkyVisible, setDeepSkyVisible }) {
  const { t, date } = useTranslation()
  const options = sections.map((id) => ({ id, label: t(`${id}.title`) }))
  const { active, toggle } = menu

  return <>
    <div className="sky-clock" data-select-obstacle data-image-obstacle>
      <SkyCompass markerRef={compassMarkerRef} />
      <time aria-label={t('common.localTime')} dateTime={new Date(clock.timestamp).toISOString()}>
        <strong>{date(clock.timestamp, { hour: 'numeric', minute: '2-digit', second: '2-digit' })}</strong>
        <span>{date(clock.timestamp, { day: 'numeric', month: 'short', year: 'numeric' })}</span>
      </time>
    </div>
    <div className="context-toolbar">
      <nav className="context-rail" aria-label={t('common.navigation')} data-select-obstacle data-image-obstacle>
        {options.map(({ id, label }) => <div className="context-tool" key={id}>
          <Tooltip message={label} open={active === id ? false : undefined} compact dismissOnClick>
          <button id={`context-trigger-${id}`} type="button" className={`context-trigger${active === id ? ' is-active' : ''}`}
            aria-label={label} aria-expanded={active === id} aria-controls={`context-${id}`}
            onClick={() => toggle(id)}>
            <ContextIcon name={id} />
          </button>
          </Tooltip>
        </div>)}
      </nav>
      <div className="context-panels">
        {options.map(({ id, label }) => <ContextPanel key={id} id={id} anchorId={`context-trigger-${id}`}
          label={label} visible={active === id}>
          {id === 'time' && <TimeControls clock={clock} />}
          {id === 'location' && <LocationControls {...location} />}
          {id === 'search' && <FitsControls fits={fits} observer={location.observer} warning={warning} share={share} />}
          {id === 'sky' && <SkyControls stars={stars} surfaceVisible={surfaceVisible} setSurfaceVisible={setSurfaceVisible}
            groundOpacity={groundOpacity} setGroundOpacity={setGroundOpacity}
            dustVisible={dustVisible} setDustVisible={setDustVisible} observer={location.observer}
            deepSkyVisible={deepSkyVisible} setDeepSkyVisible={setDeepSkyVisible}
            skyGuides={skyGuides} setSkyGuides={setSkyGuides}
            solarSystem={solarSystem} solarVisible={solarVisible} setSolarVisible={setSolarVisible} />}
        </ContextPanel>)}
      </div>
    </div>
  </>
}
