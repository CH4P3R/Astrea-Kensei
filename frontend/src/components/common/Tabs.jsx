export default function Tabs({ id, label, items, value, onChange }) {
  function navigate(event, index) {
    const keys = ['ArrowLeft', 'ArrowRight', 'Home', 'End']
    if (!keys.includes(event.key)) return
    event.preventDefault()
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1
      : (index + (event.key === 'ArrowRight' ? 1 : -1) + items.length) % items.length
    onChange(items[next].id)
    document.getElementById(`${id}-tab-${items[next].id}`)?.focus({ preventScroll: true })
  }
  return <div className="panel-tabs" role="tablist" aria-label={label}>
    {items.map((item, index) => <button key={item.id} id={`${id}-tab-${item.id}`} type="button" role="tab"
      aria-selected={value === item.id} aria-controls={`${id}-panel-${item.id}`} tabIndex={value === item.id ? 0 : -1}
      onClick={() => onChange(item.id)} onKeyDown={(event) => navigate(event, index)}>
      {item.icon}<span>{item.label}</span>
    </button>)}
  </div>
}
