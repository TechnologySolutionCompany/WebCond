function SummaryItem({ label, value, color, helper }) {
  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 14, padding: 14, background: 'var(--bg-2)' }}>
      <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--text-dim)', marginBottom: 8 }}>
        {label}
      </div>
      <div style={{ fontSize: 26, fontWeight: 700, color }}>{value}</div>
      {helper && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6 }}>{helper}</div>}
    </div>
  )
}

export default function ChargeSummaryBars({
  emAberto = 0,
  pago = 0,
  inadimplente = 0,
  totalApartamentos = 0,
  helper = '',
  children = null,
}) {
  const total = Math.max(1, emAberto + pago + inadimplente)

  const items = [
    { key: 'em_aberto', label: 'Em aberto', value: emAberto, color: '#f59e0b' },
    { key: 'pago', label: 'Pago', value: pago, color: '#3fb950' },
    { key: 'inadimplente', label: 'Inadimplente', value: inadimplente, color: '#f85149' },
  ]

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12 }}>
        {items.map((item) => (
          <SummaryItem
            key={item.key}
            label={item.label}
            value={item.value}
            color={item.color}
            helper={helper || (totalApartamentos > 0 ? `${totalApartamentos} unidades registradas` : undefined)}
          />
        ))}
      </div>

      {children || (
      <div style={{ display: 'grid', gap: 10 }}>
        {items.map((item) => {
          const width = item.value > 0 ? `${Math.max(4, (item.value / total) * 100)}%` : '0%'

          return (
            <div key={`bar-${item.key}`}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>
                <span>{item.label}</span>
                <span>{item.value}</span>
              </div>
              <div style={{ height: 10, borderRadius: 999, background: 'var(--bg-3)', overflow: 'hidden' }}>
                <div style={{ width, height: '100%', background: item.color, borderRadius: 999 }} />
              </div>
            </div>
          )
        })}
      </div>
      )}
    </div>
  )
}
