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
export default function ContextToolbar({ clock, location, fits, menu, warning, share, stars, surfaceVisible, setSurfaceVisible, dustVisible, setDustVisible, compassMarkerRef }) {
  const { t, date } = useTranslation()
  const options = sections.map((id) => ({ id, label: t(`${id}.title`) }))
  const { active, hint, keepOpen, preview, leave } = menu

  return <>
    <div className="sky-clock" data-select-obstacle data-image-obstacle>
      <SkyCompass markerRef={compassMarkerRef} />
      <time aria-label={t('common.localTime')} dateTime={new Date(clock.timestamp).toISOString()}>
        <strong>{date(clock.timestamp, { hour: 'numeric', minute: '2-digit', second: '2-digit' })}</strong>
        <span>{date(clock.timestamp, { day: 'numeric', month: 'short', year: 'numeric' })}</span>
      </time>
    </div>
    <div className="context-toolbar" onPointerEnter={keepOpen} onPointerLeave={leave}
      onFocus={keepOpen} onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) leave()
      }}>
      <nav className="context-rail" aria-label={t('common.navigation')} data-select-obstacle data-image-obstacle>
        {options.map(({ id, label }) => <div className="context-tool" key={id}>
          <Tooltip message={label} open={hint === id} compact>
          <button id={`context-trigger-${id}`} type="button" className={`context-trigger${active === id ? ' is-active' : ''}`}
            aria-label={label} aria-expanded={active === id} aria-controls={`context-${id}`}
            onPointerEnter={() => preview(id)}
            onPointerLeave={menu.cancelPreview}
            onFocus={() => preview(id)} onBlur={menu.cancelPreview}
            onClick={() => menu.open(id)}>
            <ContextIcon name={id} />
          </button>
          </Tooltip>
        </div>)}
      </nav>
      <div className="context-panels" onPointerEnter={() => { keepOpen(); menu.cancelPreview() }}>
        {options.map(({ id, label }) => <ContextPanel key={id} id={id} anchorId={`context-trigger-${id}`}
          label={label} visible={active === id}>
          {id === 'time' && <TimeControls clock={clock} />}
          {id === 'location' && <LocationControls {...location} />}
          {id === 'search' && <FitsControls fits={fits} observer={location.observer} warning={warning} share={share} />}
          {id === 'sky' && <SkyControls stars={stars} surfaceVisible={surfaceVisible} setSurfaceVisible={setSurfaceVisible}
            dustVisible={dustVisible} setDustVisible={setDustVisible} />}
        </ContextPanel>)}
      </div>
    </div>
  </>
}
