const SERIES = [
  { key: 'pago', label: 'Pago', color: '#3fb950' },
  { key: 'em_aberto', label: 'Em aberto', color: '#f59e0b' },
  { key: 'inadimplente', label: 'Inadimplente', color: '#f85149' },
]

const WIDTH = 320
const HEIGHT = 110
const PAD = { top: 10, right: 10, bottom: 22, left: 24 }

// Grafico de linha compacto: quantidade de cobrancas por situacao nos ultimos meses.
export default function ChargeTrendLine({ data = [] }) {
  const points = data.length ? data : [{ competencia: 'Atual', pago: 0, em_aberto: 0, inadimplente: 0 }]
  const maxValue = Math.max(1, ...points.flatMap((point) => SERIES.map((serie) => Number(point[serie.key] || 0))))
  const innerWidth = WIDTH - PAD.left - PAD.right
  const innerHeight = HEIGHT - PAD.top - PAD.bottom
  const x = (index) => PAD.left + (points.length === 1 ? innerWidth / 2 : (index / (points.length - 1)) * innerWidth)
  const y = (value) => PAD.top + innerHeight - (value / maxValue) * innerHeight
  const label = (point) => String(point.competencia || '').replace(/\s+de\s+/i, '/').slice(0, 8)

  const summary = points.map((point) => `${point.competencia}: ${SERIES.map((serie) => `${serie.label} ${point[serie.key] || 0}`).join(', ')}`).join('; ')

  return (
    <div>
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} width="100%" height={HEIGHT} role="img" aria-label={`Cobrancas por mes. ${summary}`} style={{ display: 'block', overflow: 'visible' }}>
        {[0, 0.5, 1].map((fraction) => {
          const value = Math.round(maxValue * fraction)
          return (
            <g key={fraction}>
              <line x1={PAD.left} x2={WIDTH - PAD.right} y1={y(value)} y2={y(value)} stroke="var(--border)" strokeWidth="1" strokeDasharray={fraction ? '3 3' : undefined} />
              <text x={PAD.left - 6} y={y(value) + 3} fontSize="9" textAnchor="end" fill="var(--text-muted)">{value}</text>
            </g>
          )
        })}

        {points.map((point, index) => (
          <text key={`x-${index}`} x={x(index)} y={HEIGHT - 6} fontSize="9" textAnchor="middle" fill="var(--text-muted)">{label(point)}</text>
        ))}

        {SERIES.map((serie) => (
          <g key={serie.key}>
            <polyline
              fill="none"
              stroke={serie.color}
              strokeWidth="2"
              strokeLinejoin="round"
              strokeLinecap="round"
              points={points.map((point, index) => `${x(index)},${y(Number(point[serie.key] || 0))}`).join(' ')}
            />
            {points.map((point, index) => (
              <circle key={index} cx={x(index)} cy={y(Number(point[serie.key] || 0))} r="2.5" fill={serie.color}>
                <title>{`${point.competencia} - ${serie.label}: ${point[serie.key] || 0}`}</title>
              </circle>
            ))}
          </g>
        ))}
      </svg>

      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>
        {SERIES.map((serie) => (
          <span key={serie.key} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <span style={{ width: 14, height: 2, background: serie.color, borderRadius: 2 }} />
            {serie.label}
          </span>
        ))}
      </div>
    </div>
  )
}
