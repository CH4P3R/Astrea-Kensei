import useAnchoredPanel from '../../hooks/useAnchoredPanel.js'

export default function ContextPanel({ id, anchorId, label, visible, children }) {
  const panelRef = useAnchoredPanel(anchorId, visible)

  return <div ref={panelRef} id={`context-${id}`} className="context-panel"
    data-visible={visible} data-select-obstacle data-image-obstacle inert={!visible} aria-hidden={!visible} role="region" aria-label={label}>
    <div className="context-panel-surface">
      {children}
    </div>
  </div>
}
