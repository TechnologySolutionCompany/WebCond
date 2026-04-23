import { Building2, ShieldCheck, Clock3, Ban, Users, AlertTriangle } from 'lucide-react'

function MetricCard({ icon: Icon, label, value, color, helper }) {
  const colors = {
    blue: '#58a6ff',
    green: '#3fb950',
    orange: '#f0883e',
    red: '#f85149',
    yellow: '#e3b341',
  }

  const dims = {
    blue: '#1a2a3a',
    green: '#1a3a24',
    orange: '#3a2010',
    red: '#3a1010',
    yellow: '#3a2d10',
  }

  return (
    <div className="stat-card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div className="label">{label}</div>
        <div style={{ background: dims[color], borderRadius: 8, padding: 6, display: 'flex' }}>
          <Icon size={16} color={colors[color]} />
        </div>
      </div>
      <div className="value" style={{ color: colors[color] }}>{value}</div>
      {helper && <div className="sub">{helper}</div>}
    </div>
  )
}

export default function PlatformDashboard({
  metrics,
  condominiums,
  loading,
  error,
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

  const pendingItems = (condominiums || []).filter((item) => item.status === 'pending').slice(0, 4)
  const blockedItems = (condominiums || []).filter((item) => item.status === 'blocked').slice(0, 4)

  return (
    <div className="fade-in">
      <div className="page-header">
        <div className="page-title">Painel global</div>
        <div className="page-subtitle">Visao geral da plataforma SaaS sem acesso a dados financeiros dos condominios</div>
      </div>

      <div className="stats-grid">
        <MetricCard icon={Building2} label="Condominios" value={metrics.total_condominiums || 0} color="blue" helper="base total da plataforma" />
        <MetricCard icon={ShieldCheck} label="Ativos" value={metrics.active_count || 0} color="green" helper="ambientes liberados para operacao" />
        <MetricCard icon={Clock3} label="Pendentes" value={metrics.pending_count || 0} color="orange" helper="aguardando revisao da plataforma" />
        <MetricCard icon={Ban} label="Bloqueados" value={metrics.blocked_count || 0} color="red" helper="acessos temporariamente suspensos" />
        <MetricCard icon={Users} label="Usuarios vinculados" value={metrics.total_users || 0} color="yellow" helper="contas associadas aos condominios" />
      </div>

      <div className="grid-2" style={{ alignItems: 'start' }}>
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <Clock3 size={16} color="#f0883e" />
            <span style={{ fontWeight: 600, fontSize: 14 }}>Fila de aprovacao</span>
          </div>

          {pendingItems.length === 0 ? (
            <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>Nenhum condominio aguardando aprovacao neste momento.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {pendingItems.map((item) => (
                <div key={item.id} style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 14, background: 'var(--bg-3)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', marginBottom: 6 }}>
                    <div style={{ fontWeight: 700 }}>{item.name}</div>
                    <span className="badge badge-orange">Pendente</span>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Plano: {item.plan_name || 'Padrao'} · Usuarios: {item.total_users || 0}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                    Sindico: {item.syndic?.nome || 'Nao informado'}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <AlertTriangle size={16} color="#f85149" />
            <span style={{ fontWeight: 600, fontSize: 14 }}>Governanca da plataforma</span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <InfoRow label="Dados financeiros" value="Ocultos do admin global" badge="green" />
            <InfoRow label="Condos bloqueados" value={blockedItems.length} badge={blockedItems.length > 0 ? 'orange' : 'green'} />
            <InfoRow label="Papel exigido" value="PLATFORM_ADMIN" />
            <InfoRow label="Escopo" value="Cadastro, aprovacao e governanca" />
          </div>

          {blockedItems.length > 0 && (
            <div style={{ marginTop: 14, fontSize: 12, color: 'var(--text-muted)' }}>
              Existem condominios bloqueados aguardando regularizacao operacional.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function InfoRow({ label, value, badge }) {
  const badgeMap = {
    green: 'badge-green',
    orange: 'badge-orange',
    red: 'badge-red',
  }

  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, fontSize: 13 }}>
      <span style={{ color: 'var(--text-muted)' }}>{label}</span>
      {badge
        ? <span className={`badge ${badgeMap[badge]}`}>{value}</span>
        : <span style={{ fontWeight: 500, textAlign: 'right' }}>{value}</span>}
    </div>
  )
}
