import { useCallback, useEffect, useRef, useState } from 'react'
import { Activity, AlertTriangle, CheckCircle2, History, RefreshCcw, ServerCrash, Settings, Trash2, Wifi, WifiOff } from 'lucide-react'
import { getPlatformStatus } from '../../lib/platformApi'
import { clearStatusHistory, loadStatusHistory, pruneHistory, saveStatusHistory, STATUS_REFRESH_MS } from '../../lib/statusHistory'
import { APP_VERSION } from '../../lib/appVersion'

const REFRESH_MS = STATUS_REFRESH_MS
// Barras do grafico: as ultimas 40 verificacoes (10 minutos a cada 15 s).
const CHART_SIZE = 40

const STATUS_META = {
  ok: { label: 'Operacional', color: 'var(--green)', badge: 'badge-green', Icon: CheckCircle2 },
  degraded: { label: 'Lento / com alerta', color: 'var(--orange)', badge: 'badge-orange', Icon: AlertTriangle },
  down: { label: 'Fora do ar', color: 'var(--red)', badge: 'badge-red', Icon: ServerCrash },
  // Nao e problema: e passo de instalacao que ainda falta. Fica azul, nao laranja, e nao conta
  // como incidente no historico.
  setup: { label: 'Aguardando configuracao', color: 'var(--blue)', badge: 'badge-blue', Icon: Settings },
}

function formatUptime(seconds = 0) {
  if (seconds < 60) return `${seconds}s`
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min`
  return `${Math.floor(seconds / 3600)} h ${Math.floor((seconds % 3600) / 60)} min`
}

// Painel tecnico do admin da plataforma: saude de cada servico, tempo de resposta,
// historico da sessao e indicadores gerais (sem dados financeiros dos condominios).
export default function PlatformStatusPage() {
  const [report, setReport] = useState(null)
  // Historico persistido no navegador: sair e voltar mantem as ultimas 24 h.
  const [history, setHistory] = useState(() => loadStatusHistory())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine)
  const busyRef = useRef(false)

  const refresh = useCallback(async () => {
    if (busyRef.current) return
    busyRef.current = true
    setLoading(true)
    const startedAt = performance.now()
    try {
      const result = await getPlatformStatus()
      const roundTripMs = Math.round(performance.now() - startedAt)
      setReport({ ...result, roundTripMs })
      setError('')
      // So problema de verdade entra no historico. Item aguardando configuracao nao e incidente:
      // se entrasse, o grafico ficaria laranja o tempo todo e esconderia uma queda real.
      const failing = (result.components || [])
        .filter((component) => component.status === 'degraded' || component.status === 'down')
        .map((component) => component.label)
      setHistory((current) => pruneHistory([...current, { at: result.timestamp, ms: roundTripMs, overall: result.overall, failing }]))
    } catch (refreshError) {
      const roundTripMs = Math.round(performance.now() - startedAt)
      setError(refreshError.message || 'Nao foi possivel consultar o servidor.')
      setHistory((current) => pruneHistory([...current, { at: new Date().toISOString(), ms: roundTripMs, overall: 'down', failing: ['Servidor'] }]))
    } finally {
      busyRef.current = false
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    saveStatusHistory(history)
  }, [history])

  useEffect(() => {
    void refresh()
    const interval = window.setInterval(() => void refresh(), REFRESH_MS)
    const goOnline = () => { setOnline(true); void refresh() }
    const goOffline = () => setOnline(false)
    window.addEventListener('online', goOnline)
    window.addEventListener('offline', goOffline)
    return () => {
      window.clearInterval(interval)
      window.removeEventListener('online', goOnline)
      window.removeEventListener('offline', goOffline)
    }
  }, [refresh])

  const overall = error ? 'down' : report?.overall || 'ok'
  const meta = STATUS_META[overall] || STATUS_META.down
  const pendingSetup = error ? [] : report?.pendingSetup || []
  const incidents = history.filter((item) => item.overall !== 'ok')
  const avgMs = history.length ? Math.round(history.reduce((sum, item) => sum + item.ms, 0) / history.length) : null
  const chart = history.slice(-CHART_SIZE)
  const since = history[0]?.at

  const handleClearHistory = () => {
    if (!window.confirm('Apagar o historico de verificacoes deste navegador?')) return
    clearStatusHistory()
    setHistory([])
  }
  const metrics = report?.metrics
  const runtime = report?.runtime

  return (
    <div className="fade-in">
      <div className="page-header">
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <div>
            <div className="page-title">Status da plataforma</div>
            <div className="page-subtitle">Saude dos servicos, tempo de resposta e andamento do sistema. Atualiza sozinho a cada {REFRESH_MS / 1000}s · Versao do App {APP_VERSION}</div>
          </div>
          <button className="btn btn-ghost" onClick={() => void refresh()} disabled={loading}>
            <RefreshCcw size={14} className={loading ? 'spin-icon' : ''} /> Verificar agora
          </button>
        </div>
      </div>

      <div className="card status-hero" style={{ borderLeft: `4px solid ${meta.color}`, marginBottom: 20 }}>
        <meta.Icon size={28} color={meta.color} />
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ fontSize: 18, fontWeight: 700 }}>
            {overall === 'ok' ? 'Todos os sistemas operacionais' : overall === 'degraded' ? 'Sistema funcionando com lentidao ou alertas' : 'Falha em um ou mais servicos'}
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>
            {error || (report ? `Ultima verificacao ${new Date(report.timestamp).toLocaleTimeString('pt-BR')} · servidor ${report.serverMs} ms · ida e volta ${report.roundTripMs} ms` : 'Verificando...')}
          </div>
          {pendingSetup.length > 0 && (
            <div style={{ fontSize: 12, color: 'var(--blue)', marginTop: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Settings size={12} /> Aguardando configuracao: {pendingSetup.join(', ')}.
            </div>
          )}
        </div>
        <span className={`badge ${online ? 'badge-green' : 'badge-red'}`}>
          {online ? <Wifi size={10} /> : <WifiOff size={10} />} {online ? 'Sua conexao: online' : 'Sua conexao: offline'}
        </span>
      </div>

      <div className="status-components">
        {(report?.components || []).map((component) => {
          const componentMeta = STATUS_META[component.status] || STATUS_META.down
          return (
            <div key={component.key} className="card status-component">
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
                <span style={{ fontWeight: 600, fontSize: 14 }}>{component.label}</span>
                <span className="status-dot" style={{ background: componentMeta.color }} title={componentMeta.label} />
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', marginTop: 8 }}>
                <span className={`badge ${componentMeta.badge}`}>{componentMeta.label}</span>
                {typeof component.latencyMs === 'number' && <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{component.latencyMs} ms</span>}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8, lineHeight: 1.5 }}>{component.detail}</div>
            </div>
          )
        })}
      </div>

      <div className="grid-2" style={{ alignItems: 'start', marginTop: 20 }}>
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <Activity size={16} color="var(--blue)" />
            <span style={{ fontWeight: 700 }}>Tempo de resposta (ultimas {chart.length} verificacoes)</span>
          </div>
          <ResponseBars history={chart} />
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 12, color: 'var(--text-muted)', marginTop: 10 }}>
            <span>Media: <strong style={{ color: 'var(--text)' }}>{avgMs ?? '-'} ms</strong></span>
            <span>Verificacoes (24 h): <strong style={{ color: 'var(--text)' }}>{history.length}</strong></span>
            <span>Com problema: <strong style={{ color: incidents.length ? 'var(--orange)' : 'var(--text)' }}>{incidents.length}</strong></span>
          </div>
          {incidents.length > 0 && (
            <div style={{ marginTop: 12, display: 'grid', gap: 6 }}>
              {incidents.slice(-5).reverse().map((item) => (
                <div key={item.at} style={{ fontSize: 12, display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <span>{new Date(item.at).toLocaleTimeString('pt-BR')}</span>
                  {/* Diz qual servico puxou o alerta: "Rotinas automaticas · 200 ms" explica melhor
                      do que "Lento / com alerta" ao lado de um tempo que nao tem nada de lento. */}
                  <span className={`badge ${(STATUS_META[item.overall] || STATUS_META.down).badge}`}>
                    {item.failing?.length ? item.failing.join(', ') : (STATUS_META[item.overall] || STATUS_META.down).label} · {item.ms} ms
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card">
          <div style={{ fontWeight: 700, marginBottom: 12 }}>Servidor</div>
          <div style={{ display: 'grid', gap: 10 }}>
            <InfoRow label="Ambiente" value={runtime?.environment || '-'} />
            <InfoRow label="Regiao" value={runtime?.region || '-'} />
            <InfoRow label="Versao publicada (commit)" value={runtime?.commit || '-'} />
            <InfoRow label="Node.js" value={runtime?.node || '-'} />
            <InfoRow label="Instancia ativa ha" value={runtime ? formatUptime(runtime.instanceUptimeSec) : '-'} />
            <InfoRow label="Memoria da instancia" value={runtime ? `${runtime.memoryMb} MB` : '-'} />
          </div>
        </div>
      </div>

      <div className="card" style={{ marginTop: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <History size={16} color="var(--blue)" />
            <span style={{ fontWeight: 700 }}>Historico de atualizacoes</span>
            {since && <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>desde {new Date(since).toLocaleString('pt-BR')}</span>}
          </div>
          <button className="btn btn-ghost btn-sm" onClick={handleClearHistory} disabled={!history.length}><Trash2 size={12} /> Limpar</button>
        </div>
        <StatusLog history={history} />
      </div>

      {metrics && (
        <div className="card" style={{ marginTop: 20 }}>
          <div style={{ fontWeight: 700, marginBottom: 12 }}>Andamento da plataforma</div>
          <div className="status-metrics">
            <Metric label="Condominios" value={metrics.condominiums.total} helper={`${metrics.condominiums.active} ativos · ${metrics.condominiums.pending} aguardando`} />
            <Metric label="Em teste" value={metrics.condominiums.trial} helper={`${metrics.condominiums.expiringSoon} vencendo em ate 5 dias`} />
            <Metric label="Planos pagos" value={metrics.condominiums.paid} helper={`${metrics.condominiums.partnership} parceria(s)`} />
            <Metric label="Somente visualizacao" value={metrics.condominiums.locked} helper="Teste ou plano vencido" warn={metrics.condominiums.locked > 0} />
            <Metric label="Bloqueados" value={metrics.condominiums.blocked} helper={`${metrics.condominiums.rejected} rejeitado(s)`} />
            <Metric label="Usuarios" value={metrics.users ?? '-'} helper={`${metrics.activeUsers ?? '-'} ativos`} />
            <Metric label="Unidades" value={metrics.units ?? '-'} />
            <Metric label="Cobrancas no mes" value={metrics.chargesMonth ?? '-'} helper="Quantidade (sem valores)" />
            <Metric label="Documentos" value={metrics.documents ?? '-'} />
            <Metric label="Avisos no ar" value={metrics.notices ?? '-'} helper="Apagados apos 30 dias" />
          </div>
        </div>
      )}
    </div>
  )
}

function ResponseBars({ history }) {
  if (!history.length) return <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Aguardando a primeira verificacao...</div>
  const max = Math.max(500, ...history.map((item) => item.ms))
  return (
    <div className="status-bars" role="img" aria-label={`Tempo de resposta das ultimas ${history.length} verificacoes`}>
      {history.map((item) => (
        <span
          key={item.at}
          title={`${new Date(item.at).toLocaleTimeString('pt-BR')}: ${item.ms} ms`}
          style={{ height: `${Math.max(6, (item.ms / max) * 100)}%`, background: (STATUS_META[item.overall] || STATUS_META.down).color }}
        />
      ))}
    </div>
  )
}

// Lista das verificacoes, a mais recente primeiro. Mostra as ultimas 30 da janela de 24 h.
function StatusLog({ history }) {
  if (!history.length) return <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Nenhuma verificacao registrada ainda.</div>
  return (
    <div className="status-log">
      {history.slice(-30).reverse().map((item) => {
        const meta = STATUS_META[item.overall] || STATUS_META.down
        return (
          <div key={item.at} className="status-log-row">
            <span className="status-dot" style={{ background: meta.color }} />
            <span className="status-log-time">{new Date(item.at).toLocaleString('pt-BR')}</span>
            <span className={`badge ${meta.badge}`}>{meta.label}</span>
            <span className="status-log-ms">{item.ms} ms</span>
            {item.failing?.length > 0 && <span className="status-log-failing">{item.failing.join(', ')}</span>}
          </div>
        )
      })}
    </div>
  )
}

function Metric({ label, value, helper, warn = false }) {
  return (
    <div className="status-metric">
      <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--text-dim)' }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, marginTop: 4, color: warn ? 'var(--orange)' : 'var(--text)' }}>{value}</div>
      {helper && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{helper}</div>}
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
