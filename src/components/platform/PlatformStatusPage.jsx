import PlatformStatusBanner from '../shared/PlatformStatusBanner'
import { usePlatformHealth } from '../../hooks/usePlatformHealth'

export default function PlatformStatusPage() {
  const status = usePlatformHealth({ enabled: true, intervalMs: 30000 })

  return (
    <div className="fade-in">
      <div className="page-header">
        <div className="page-title">Status da plataforma</div>
        <div className="page-subtitle">Diagnostico operacional do front-end, API local e conectividade com o banco</div>
      </div>

      <PlatformStatusBanner status={status} />

      <div className="grid-2" style={{ alignItems: 'start' }}>
        <div className="card">
          <div style={{ fontWeight: 700, marginBottom: 12 }}>Resumo tecnico</div>
          <div style={{ display: 'grid', gap: 10 }}>
            <InfoRow label="Modo" value={status.mode || 'offline'} />
            <InfoRow label="Banco" value={status.database || 'unknown'} />
            <InfoRow label="Ultima checagem" value={status.lastCheckedAt ? new Date(status.lastCheckedAt).toLocaleString('pt-BR') : '-'} />
            <InfoRow label="Latencia" value={typeof status.latencyMs === 'number' ? `${status.latencyMs} ms` : '-'} />
          </div>
        </div>

        <div className="card">
          <div style={{ fontWeight: 700, marginBottom: 12 }}>Leitura operacional</div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.7 }}>
            Esta area concentra apenas o estado tecnico da plataforma. O sindico nao visualiza esse painel, e o admin global continua sem acesso a dados financeiros dos condominios.
          </div>
        </div>
      </div>
    </div>
  )
}

function InfoRow({ label, value }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, fontSize: 13 }}>
      <span style={{ color: 'var(--text-muted)' }}>{label}</span>
      <span style={{ fontWeight: 600, textAlign: 'right' }}>{value}</span>
    </div>
  )
}
