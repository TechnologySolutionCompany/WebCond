import { Building2, CircleCheck, Clock3, TriangleAlert } from 'lucide-react'

function formatMoney(value = 0) {
  return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function unidades(n) {
  return `${n} ${n === 1 ? 'unidade' : 'unidades'}`
}

// Cartoes do condominio (v2.10A5): os mesmos no painel do sindico e no Inicio/Resumo do morador.
// cartoes = buildMonthlyCards() (src/lib/condominioResumo.js).
export default function ResumoCards({ cartoes, unidadesAtivas = 0, unidadesSub = '', style }) {
  const pago = cartoes?.pago || { valor: 0, unidades: 0 }
  const aberto = cartoes?.em_aberto || { valor: 0, unidades: 0 }
  const inadimplente = cartoes?.inadimplente || { valor: 0, unidades: 0 }

  const kpis = [
    { Icon: Building2, tom: 'primary', label: 'Unidades ativas', valor: unidadesAtivas, sub: unidadesSub },
    { Icon: CircleCheck, tom: 'green', label: 'Valores pagos no mês', valor: formatMoney(pago.valor), sub: `${unidades(pago.unidades)} ${pago.unidades === 1 ? 'pagou' : 'pagaram'} no mês` },
    { Icon: Clock3, tom: 'amber', label: 'Valores em aberto', valor: formatMoney(aberto.valor), sub: `${unidades(aberto.unidades)} com valor em aberto` },
    { Icon: TriangleAlert, tom: 'red', label: 'Uni. Inadimplente', valor: formatMoney(inadimplente.valor), sub: `${unidades(inadimplente.unidades)} ${inadimplente.unidades === 1 ? 'inadimplente' : 'inadimplentes'}` },
  ]

  return (
    <div className="stats-grid" style={{ marginBottom: 0, ...style }}>
      {kpis.map(({ Icon, tom, label, valor, sub }) => (
        <div key={label} className="stat-card">
          <div className="kpi-head">
            <span className={`kpi-icon kpi-${tom}`}><Icon size={17} /></span>
            <span className="label">{label}</span>
          </div>
          <div className="value">{valor}</div>
          {sub && <div className="sub">{sub}</div>}
        </div>
      ))}
    </div>
  )
}
