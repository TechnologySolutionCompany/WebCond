import { ArrowRight, Activity, Ban, Building, Building2, Clock3, LifeBuoy, MessageSquareText, ShieldCheck, Users } from 'lucide-react'

function Kpi({ icon: Icon, label, value, helper, tone }) {
  return (
    <div className="kpi-card">
      <div className="kpi-head">
        <span className={`kpi-icon tone-${tone}`}><Icon size={17} /></span>
        <span className="kpi-label">{label}</span>
      </div>
      <div className="kpi-value">{value}</div>
      <div className="kpi-sub">{helper}</div>
    </div>
  )
}

function planLabel(item) {
  if (item.subscription_status !== 'active') return 'Teste'
  return item.plan_name || '-'
}

function cityOf(item) {
  const details = item.address_details || {}
  return [details.city || details.cidade, details.state || details.uf].filter(Boolean).join('/')
}

function since(value) {
  if (!value) return ''
  const days = Math.floor((Date.now() - new Date(value).getTime()) / 86400000)
  if (days <= 0) return 'hoje'
  if (days === 1) return 'ontem'
  return `há ${days} dias`
}

// Painel global da plataforma no formato do prototipo (redesign v2.10A3).
export default function PlatformDashboard({
  metrics,
  condominiums,
  loading,
  error,
  onNavigate = () => {},
  openTickets = 0,
  newFeedbacks = 0,
}) {
  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
        <div className="spinner" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="card">
        <div style={{ fontWeight: 700, marginBottom: 8 }}>Nao foi possivel carregar o painel global.</div>
        <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>{error}</div>
      </div>
    )
  }

  const pendingItems = (condominiums || []).filter((item) => item.status === 'pending').slice(0, 5)
  const attentionItems = (condominiums || []).filter((item) => item.status !== 'pending' && (item.plan_locked || item.plan_expiring_soon)).slice(0, 5)

  return (
    <div className="fade-in screen">
      <div>
        <h1 className="screen-title">Painel global</h1>
        <div className="screen-sub">Visão geral da plataforma, sem acesso a dados financeiros dos condomínios</div>
      </div>

      <div className="kpi-grid">
        <Kpi icon={Building2} label="Condomínios" value={metrics.total_condominiums || 0} helper="base total" tone="primary" />
        <Kpi icon={ShieldCheck} label="Ativos" value={metrics.active_count || 0} helper="liberados para operar" tone="green" />
        <Kpi icon={Clock3} label="Pendentes" value={metrics.pending_count || 0} helper="aguardando revisão" tone="amber" />
        <Kpi icon={Ban} label="Bloqueados" value={metrics.blocked_count || 0} helper="acesso suspenso" tone="red" />
        <Kpi icon={Users} label="Usuários" value={Number(metrics.total_users || 0).toLocaleString('pt-BR')} helper="contas vinculadas" tone="neutral" />
      </div>

      <div className="compose-cols">
        <div className="panel-card" style={{ flex: '1.4 1 420px' }}>
          <div className="panel-card-head">
            <span className="panel-card-title">Fila de aprovação</span>
            <button type="button" className="home-link" onClick={() => onNavigate('condominiums')}>Todos os condomínios<ArrowRight size={15} /></button>
          </div>
          {pendingItems.length === 0 ? (
            <div className="home-empty" style={{ padding: '6px 20px 16px' }}>Nenhum condomínio aguardando aprovação neste momento.</div>
          ) : pendingItems.map((item) => (
            <div key={item.id} className="queue-row">
              <span className="list-icon tone-amber"><Building size={20} /></span>
              <div style={{ flex: '1 1 200px', minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 600, overflowWrap: 'anywhere' }}>{item.name}</div>
                <div className="list-sub" style={{ fontSize: 13 }}>
                  {[cityOf(item), item.unit_count ? `${item.unit_count} unidades` : '', item.syndic?.nome ? `síndico ${item.syndic.nome}` : '', since(item.created_at)].filter(Boolean).join(' · ')}
                </div>
              </div>
              <button type="button" className="mini-btn mini-btn-primary" onClick={() => onNavigate('condominiums')}>Revisar</button>
            </div>
          ))}
        </div>

        <div style={{ flex: '1 1 320px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <button type="button" className="kpi-card" style={{ textAlign: 'left', color: 'var(--text)' }} onClick={() => onNavigate('suporte')}>
              <span className="kpi-label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}><LifeBuoy size={15} />Chamados abertos</span>
              <span className="kpi-value" style={{ fontSize: 26 }}>{openTickets}</span>
            </button>
            <button type="button" className="kpi-card" style={{ textAlign: 'left', color: 'var(--text)' }} onClick={() => onNavigate('feedbacks')}>
              <span className="kpi-label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}><MessageSquareText size={15} />Feedback novo</span>
              <span className="kpi-value" style={{ fontSize: 26 }}>{newFeedbacks}</span>
            </button>
          </div>

          <div className="panel-card">
            <div className="panel-card-head">
              <span className="panel-card-title">Plano pedindo atenção</span>
              <button type="button" className="home-link" onClick={() => onNavigate('status')}><Activity size={15} />Status</button>
            </div>
            {attentionItems.length === 0 ? (
              <div className="home-empty" style={{ padding: '6px 20px 16px' }}>Nenhum plano vencido ou perto de vencer.</div>
            ) : attentionItems.map((item) => (
              <div key={item.id} className="queue-row" style={{ padding: '12px 20px' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="list-ellipsis" style={{ fontSize: 14, fontWeight: 600 }}>{item.name}</div>
                  <div className="list-sub" style={{ fontSize: 13 }}>{planLabel(item)}</div>
                </div>
                <span className={`pill pill-sm ${item.plan_locked ? 'tone-red' : 'tone-amber'}`}>
                  {item.plan_locked ? 'Vencido' : `Vence em ${item.plan_days_left} ${item.plan_days_left === 1 ? 'dia' : 'dias'}`}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
