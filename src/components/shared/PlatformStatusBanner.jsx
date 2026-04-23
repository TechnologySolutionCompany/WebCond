import { Activity, AlertTriangle, CheckCircle2, RefreshCcw, ServerCrash } from 'lucide-react'

export default function PlatformStatusBanner({ status, compact = false }) {
  if (!status) return null

  const checks = Array.isArray(status.checks) ? status.checks : []
  const hasError = checks.some((item) => item.status === 'error') || (!status.loading && !status.ok)
  const hasWarning = !hasError && (checks.some((item) => item.status === 'warn') || status.mode === 'limited')

  const tone = hasError ? 'red' : hasWarning ? 'orange' : 'green'
  const Icon = hasError ? ServerCrash : hasWarning ? AlertTriangle : CheckCircle2
  const title = hasError
    ? 'Integração com o backend precisa de atenção'
    : hasWarning
      ? 'Integração está funcional com limitações'
      : 'Integração front-end e back-end estável'

  const subtitle = status.loading
    ? 'Verificando conexão...'
    : hasError
      ? (status.error || 'O sistema encontrou falhas ao validar o backend.')
      : hasWarning
        ? 'Operações comuns estão funcionando, mas recursos administrativos sensíveis dependem de configuração adicional.'
        : `Banco conectado${typeof status.latencyMs === 'number' ? ` em ${status.latencyMs} ms` : ''}.`

  return (
    <div className={`platform-status-banner platform-status-${tone} ${compact ? 'platform-status-compact' : ''}`}>
      <div className="platform-status-main">
        <div className="platform-status-icon">
          {status.loading ? <RefreshCcw size={18} className="spin-icon" /> : <Icon size={18} />}
        </div>
        <div className="platform-status-copy">
          <div className="platform-status-title">{title}</div>
          <div className="platform-status-subtitle">{subtitle}</div>
        </div>
        <div className={`badge ${hasError ? 'badge-red' : hasWarning ? 'badge-orange' : 'badge-green'}`}>
          <Activity size={10} />
          {status.loading ? 'Verificando' : status.mode === 'full' ? 'Completo' : status.mode === 'limited' ? 'Limitado' : 'Offline'}
        </div>
      </div>

      {!compact && checks.length > 0 && (
        <div className="platform-status-grid">
          {checks.map((item) => (
            <div key={item.key} className="platform-status-check">
              <div className="platform-status-check-label">{item.label}</div>
              <div className={`platform-status-check-value platform-status-check-${item.status}`}>{item.detail}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
