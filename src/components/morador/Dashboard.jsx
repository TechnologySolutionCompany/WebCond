import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import { DollarSign, Bell, Home, Phone, Mail, AlertCircle, CheckCircle, AlertTriangle, CalendarClock } from 'lucide-react'
import { buildChargeStatusChartData, countChargeStatuses, getChargeStatus } from '../../lib/chargeStatus'
import ChargesStatusChart from '../shared/ChargesStatusChart'

const BRAND_COPY = '(c) 2026 Technology Solution Company BR - Todos os direitos reservados.'

function formatMoney(value = 0) {
  return Number(value || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  })
}

function statusView(charge) {
  const status = getChargeStatus(charge)
  if (status === 'pago') return { label: 'Pago', badge: 'badge-green' }
  if (status === 'inadimplente') return { label: 'Inadimplente', badge: 'badge-red' }
  return { label: 'Em aberto', badge: 'badge-orange' }
}

export default function MoradorDashboard({ isActive = true }) {
  const { profile } = useAuth()
  const [cobrancas, setCobrancas] = useState([])
  const [avisos, setAvisos] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!isActive) return
    if (!profile?.id) return

    void (async () => {
      setLoading(true)

      const [cobrancasRes, avisosRes] = await Promise.all([
        supabase.from('cobrancas').select('*').eq('morador_id', profile.id).order('created_at', { ascending: false }),
        supabase.from('avisos').select('*').eq('ativo', true).order('created_at', { ascending: false }).limit(10),
      ])

      const avisosFiltrados = (avisosRes.data || [])
        .filter((aviso) => aviso.destinatario === 'todos' || (aviso.destinatario === 'apartamento' && aviso.apartamento_destino === profile.apartamento))
        .slice(0, 3)

      setCobrancas(cobrancasRes.data || [])
      setAvisos(avisosFiltrados)
      setLoading(false)
    })()
  }, [isActive, profile?.id, profile?.apartamento])

  const statusCount = useMemo(() => countChargeStatuses(cobrancas), [cobrancas])
  const chartData = useMemo(() => buildChargeStatusChartData(cobrancas), [cobrancas])

  const totalEmAberto = useMemo(() => (
    cobrancas
      .filter((item) => getChargeStatus(item) === 'em_aberto')
      .reduce((sum, item) => sum + Number(item.valor || 0), 0)
  ), [cobrancas])

  const totalInadimplente = useMemo(() => (
    cobrancas
      .filter((item) => getChargeStatus(item) === 'inadimplente')
      .reduce((sum, item) => sum + Number(item.valor || 0), 0)
  ), [cobrancas])

  const totalAPagar = totalEmAberto + totalInadimplente
  const totalNaoPago = statusCount.em_aberto + statusCount.inadimplente

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
        <div className="spinner" />
      </div>
    )
  }

  return (
    <div className="fade-in">
      <div className="page-header">
        <div className="page-title">Ola, {profile?.nome?.split(' ')[0]}!</div>
        <div className="page-subtitle">Bem-vindo ao WebCond</div>
      </div>

      <div className="card" style={{ marginBottom: 24, borderColor: '#388bfd40' }}>
        <div style={{ display: 'flex', gap: 20, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ width: 60, height: 60, borderRadius: 14, background: '#1a2a3a', border: '2px solid #58a6ff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, fontWeight: 700, color: '#58a6ff', flexShrink: 0 }}>
            {profile?.apartamento || '?'}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 16 }}>{profile?.nome}</div>
            <div style={{ display: 'flex', gap: 16, marginTop: 6, flexWrap: 'wrap' }}>
              <InfoItem icon={Home} text={`Apartamento ${profile?.apartamento || '-'}`} />
              {profile?.whatsapp && <InfoItem icon={Phone} text={profile.whatsapp} />}
              <InfoItem icon={Mail} text={profile?.email} />
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 11, color: '#8b949e', textTransform: 'uppercase', letterSpacing: '.06em' }}>Tecnologia</div>
            <div style={{ fontSize: 13, fontWeight: 600 }}>Technology Solution Company BR</div>
            <div style={{ fontSize: 12, color: '#8b949e' }}>{BRAND_COPY}</div>
          </div>
        </div>
      </div>

      <div className="stats-grid" style={{ marginBottom: 24 }}>
        <div className="stat-card">
          <div className="label">Em aberto</div>
          <div className="value" style={{ color: statusCount.em_aberto > 0 ? '#f0883e' : '#3fb950' }}>{statusCount.em_aberto}</div>
          <div className="sub">dentro do prazo</div>
        </div>
        <div className="stat-card">
          <div className="label">Inadimplente</div>
          <div className="value" style={{ color: statusCount.inadimplente > 0 ? '#f85149' : '#3fb950' }}>{statusCount.inadimplente}</div>
          <div className="sub">apos vencimento</div>
        </div>
        <div className="stat-card">
          <div className="label">Total a pagar</div>
          <div className="value" style={{ color: totalAPagar > 0 ? '#f0883e' : '#3fb950', fontSize: 20 }}>{formatMoney(totalAPagar)}</div>
          <div className="sub">{formatMoney(totalInadimplente)} em inadimplencia</div>
        </div>
        <div className="stat-card">
          <div className="label">Avisos</div>
          <div className="value" style={{ color: '#58a6ff' }}>{avisos.length}</div>
          <div className="sub">comunicados recentes</div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
          <CalendarClock size={16} color="#58a6ff" />
          <span style={{ fontWeight: 600, fontSize: 14 }}>Status das cobrancas por competencia</span>
        </div>
        <ChargesStatusChart data={chartData} />
      </div>

      <div className="grid-2">
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <DollarSign size={16} color="#58a6ff" />
            <span style={{ fontWeight: 600, fontSize: 14 }}>Minhas cobrancas</span>
          </div>
          {cobrancas.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '20px 0', color: '#8b949e', fontSize: 13 }}>
              <CheckCircle size={24} color="#3fb950" style={{ margin: '0 auto 8px' }} />
              <div>Sem cobrancas registradas.</div>
            </div>
          ) : (
            cobrancas.slice(0, 4).map((cobranca) => {
              const status = statusView(cobranca)
              return (
                <div key={cobranca.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid var(--border-subtle)' }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>{cobranca.descricao || cobranca.tipo}</div>
                    <div style={{ fontSize: 11, color: '#8b949e' }}>
                      {cobranca.mes_referencia} · venc. {cobranca.vencimento ? new Date(`${cobranca.vencimento}T12:00:00`).toLocaleDateString('pt-BR') : '-'}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div className="mono" style={{ fontWeight: 600, fontSize: 13 }}>{formatMoney(cobranca.valor)}</div>
                    <span className={`badge ${status.badge}`} style={{ fontSize: 10 }}>
                      {status.label}
                    </span>
                  </div>
                </div>
              )
            })
          )}
        </div>

        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <Bell size={16} color="#58a6ff" />
            <span style={{ fontWeight: 600, fontSize: 14 }}>Avisos recentes</span>
          </div>
          {avisos.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '20px 0', color: '#8b949e', fontSize: 13 }}>Nenhum aviso no momento.</div>
          ) : (
            avisos.map((aviso) => (
              <div key={aviso.id} style={{ padding: '10px 0', borderBottom: '1px solid var(--border-subtle)' }}>
                <div style={{ fontWeight: 600, fontSize: 13 }}>{aviso.titulo}</div>
                <div style={{ fontSize: 12, color: '#8b949e', marginTop: 3, lineHeight: 1.5 }}>
                  {aviso.conteudo.length > 100 ? `${aviso.conteudo.slice(0, 100)}...` : aviso.conteudo}
                </div>
                <div style={{ fontSize: 10, color: '#484f58', marginTop: 4 }}>
                  {new Date(aviso.created_at).toLocaleDateString('pt-BR')}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {totalNaoPago > 0 && (
        <div className="card" style={{ marginTop: 20, borderColor: statusCount.inadimplente > 0 ? '#f8514940' : '#f0883e40', background: statusCount.inadimplente > 0 ? 'rgba(248,81,73,0.08)' : 'rgba(240,136,62,0.05)' }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
            <AlertCircle size={18} color={statusCount.inadimplente > 0 ? '#f85149' : '#f0883e'} style={{ flexShrink: 0, marginTop: 1 }} />
            <div>
              <div style={{ fontWeight: 600, fontSize: 14, color: statusCount.inadimplente > 0 ? '#f85149' : '#f0883e' }}>
                Situacao de cobrancas
              </div>
              <div style={{ fontSize: 13, color: '#8b949e', marginTop: 4 }}>
                Voce possui <strong style={{ color: '#e6edf3' }}>{statusCount.em_aberto} em aberto</strong> e{' '}
                <strong style={{ color: '#e6edf3' }}>{statusCount.inadimplente} inadimplente(s)</strong>, totalizando{' '}
                <strong style={{ color: '#e6edf3' }}>{formatMoney(totalAPagar)}</strong>.
              </div>
            </div>
          </div>
        </div>
      )}

      {statusCount.inadimplente > 0 && (
        <div className="card" style={{ marginTop: 16, borderColor: '#f8514940', background: 'rgba(248,81,73,0.08)' }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
            <AlertTriangle size={18} color="#f85149" style={{ flexShrink: 0, marginTop: 1 }} />
            <div>
              <div style={{ fontWeight: 600, fontSize: 14, color: '#f85149' }}>Atencao: cobranca inadimplente</div>
              <div style={{ fontSize: 13, color: '#8b949e', marginTop: 4 }}>
                Existe cobranca vencida sem pagamento. Regularize para evitar novas medidas administrativas.
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function InfoItem({ icon: Icon, text }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: '#8b949e' }}>
      <Icon size={12} />
      <span>{text}</span>
    </div>
  )
}
