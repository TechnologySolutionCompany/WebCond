function Legend({ color, label }) {
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#8b949e' }}>
      <span style={{ width: 10, height: 10, borderRadius: 999, background: color }} />
      {label}
    </div>
  )
}

export default function ChargesStatusChart({ data = [] }) {
  const width = 640
  const height = 240
  const padding = 26
  const safeData = data.length > 0 ? data : [{ competencia: 'Atual', em_aberto: 0, pago: 0, inadimplente: 0 }]
  const maxValue = Math.max(1, ...safeData.flatMap((item) => [item.em_aberto, item.pago, item.inadimplente]))
  const stepX = safeData.length > 1 ? (width - (padding * 2)) / (safeData.length - 1) : 0

  const makePoints = (key) => safeData.map((item, index) => {
    const x = padding + (stepX * index)
    const y = height - padding - ((item[key] / maxValue) * (height - (padding * 2)))
    return `${x},${y}`
  }).join(' ')

  return (
    <div>
      <svg viewBox={`0 0 ${width} ${height}`} style={{ width: '100%', height: 'auto' }}>
        {[0, 1, 2, 3].map((line) => {
          const y = padding + (((height - (padding * 2)) / 3) * line)
          return <line key={line} x1={padding} y1={y} x2={width - padding} y2={y} stroke="#21262d" />
        })}
        <polyline fill="none" stroke="#f59e0b" strokeWidth="3" points={makePoints('em_aberto')} />
        <polyline fill="none" stroke="#3fb950" strokeWidth="3" points={makePoints('pago')} />
        <polyline fill="none" stroke="#f85149" strokeWidth="3" points={makePoints('inadimplente')} />

        {safeData.map((item, index) => (
          <text key={`${item.competencia}-${index}`} x={padding + (stepX * index)} y={height - 6} fill="#8b949e" fontSize="11" textAnchor="middle">
            {item.competencia}
          </text>
        ))}
      </svg>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 12 }}>
        <Legend color="#f59e0b" label="Em aberto" />
        <Legend color="#3fb950" label="Pago" />
        <Legend color="#f85149" label="Inadimplente" />
      </div>
    </div>
  )
}
