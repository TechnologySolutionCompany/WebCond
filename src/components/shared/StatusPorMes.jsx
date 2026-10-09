const SERIES = [
  { key: 'pago', label: 'Pagas', color: 'var(--green-solid)' },
  { key: 'em_aberto', label: 'Em aberto', color: 'var(--amber-solid)' },
  { key: 'inadimplente', label: 'Inadimplentes', color: 'var(--red-solid)' },
]

const bloquear = (event) => event.preventDefault()

// Status das cobrancas por mes (v2.10A5): unidades pagas, em aberto e inadimplentes em cada
// competencia. Feito de blocos (nao e imagem nem canvas) e sem botao de exportar: o morador
// so visualiza; segurar o dedo no grafico nao oferece "salvar imagem".
export default function StatusPorMes({ historico = [] }) {
  const meses = historico.length ? historico : []
  const maior = Math.max(1, ...meses.map((mes) => mes.pago + mes.em_aberto + mes.inadimplente))
  const descricao = meses.map((mes) => `${mes.competencia}: ${SERIES.map((serie) => `${serie.label} ${mes[serie.key] || 0}`).join(', ')}`).join('; ')

  if (!meses.length) return <div className="home-muted">Nenhuma cobrança lançada até o momento.</div>

  return (
    <div className="status-chart" onContextMenu={bloquear} onDragStart={bloquear}>
      <div className="status-months" role="img" aria-label={`Unidades por situação em cada mês. ${descricao}`}>
        {meses.map((mes, index) => {
          const total = mes.pago + mes.em_aberto + mes.inadimplente
          const pct = total ? Math.round((mes.pago / total) * 100) : 0
          const atual = index === meses.length - 1
          return (
            <div key={mes.ref} className="status-month">
              <span className="status-month-pct" style={{ fontWeight: atual ? 700 : 500 }}>{pct}%</span>
              <div className="status-month-stack" style={{ height: `${Math.max(6, (total / maior) * 140)}px` }}>
                {SERIES.map((serie) => (mes[serie.key] ? (
                  <div key={serie.key} style={{ height: `${(mes[serie.key] / total) * 100}%`, background: serie.color }} title={`${mes.competencia} · ${serie.label}: ${mes[serie.key]}`} />
                ) : null))}
              </div>
              <span className="status-month-label" style={{ fontWeight: atual ? 700 : 400 }}>{String(mes.competencia).split('/')[0]}</span>
            </div>
          )
        })}
      </div>
      <div className="arrec-legend" style={{ marginTop: 14 }}>
        {SERIES.map((serie) => <span key={serie.key}><i style={{ background: serie.color }} />{serie.label}</span>)}
      </div>
    </div>
  )
}
