import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import { useCondominiumSettings } from '../../hooks/useCondominiumSettings'
import { Bell, CalendarClock, DollarSign, MessageSquareText } from 'lucide-react'
import { countChargeStatuses, getChargeStatus } from '../../lib/chargeStatus'
import { formatReferenceLabel } from '../../lib/billingShared'
import ChargeSummaryBars from '../shared/ChargeSummaryBars'
import { getTenantChargeSummary } from '../../lib/tenantApi'

function formatMoney(value = 0) {
  return Number(value || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  })
}

export default function MoradorDashboard({ isActive = true }) {
  const { profile } = useAuth()
  const { settings: condominiumSettings } = useCondominiumSettings(profile?.condominium_id || profile?.condominio_id || null)
  const [cobrancas, setCobrancas] = useState([])
  const [avisos, setAvisos] = useState([])
  const [loading, setLoading] = useState(true)
  const [tenantSummary, setTenantSummary] = useState({
    total_apartamentos: 0,
    em_aberto: 0,
    pago: 0,
    inadimplente: 0,
  })

  useEffect(() => {
    if (!isActive || !profile?.id) return

    void (async () => {
      setLoading(true)

      const [cobrancasRes, avisosRes, summaryRes] = await Promise.all([
        supabase.from('cobrancas').select('*').eq('morador_id', profile.id).order('created_at', { ascending: false }),
        supabase.from('avisos').select('*').eq('ativo', true).order('created_at', { ascending: false }).limit(12),
        getTenantChargeSummary().catch(() => ({
          total_apartamentos: 0,
          em_aberto: 0,
          pago: 0,
          inadimplente: 0,
        })),
      ])

      const avisosFiltrados = (avisosRes.data || [])
        .filter((aviso) => aviso.destinatario === 'todos' || (aviso.destinatario === 'apartamento' && aviso.apartamento_destino === profile.apartamento))

      setCobrancas(cobrancasRes.data || [])
      setAvisos(avisosFiltrados)
      setTenantSummary(summaryRes || {
        total_apartamentos: 0,
        em_aberto: 0,
        pago: 0,
        inadimplente: 0,
      })
      setLoading(false)
    })()
  }, [isActive, profile?.id, profile?.apartamento])

  const statusCount = useMemo(() => countChargeStatuses(cobrancas), [cobrancas])
  const avisosRecentes = avisos.slice(0, 3)
  const avisosHistorico = avisos.slice(0, 6)

  const totalAPagar = useMemo(() => (
    cobrancas
      .filter((item) => getChargeStatus(item) !== 'pago')
      .reduce((sum, item) => sum + Number(item.valor || 0), 0)
  ), [cobrancas])

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
        <div className="page-title">Ola, {profile?.nome?.split(' ')[0]}</div>
        <div className="page-subtitle">Bem-vindo ao Sistema do {condominiumSettings.name}</div>
      </div>

      <div className="card" style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
          <CalendarClock size={16} color="#58a6ff" />
          <span style={{ fontWeight: 700, fontSize: 14 }}>Resumo anonimizado do condominio</span>
        </div>
        <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>
          De {tenantSummary.total_apartamentos || 0} apartamentos registrados, {tenantSummary.inadimplente || 0} estao atrasados e {tenantSummary.em_aberto || 0} seguem em aberto.
        </div>
        <ChargeSummaryBars
          totalApartamentos={tenantSummary.total_apartamentos}
          emAberto={tenantSummary.em_aberto}
          pago={tenantSummary.pago}
          inadimplente={tenantSummary.inadimplente}
        />
      </div>

      <div className="grid-2" style={{ marginBottom: 24, alignItems: 'start' }}>
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <DollarSign size={16} color="#58a6ff" />
            <span style={{ fontWeight: 700, fontSize: 14 }}>Minhas cobrancas</span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 16 }}>
            <MiniStat label="Em aberto" value={statusCount.em_aberto} color="#f59e0b" />
            <MiniStat label="Inadimplente" value={statusCount.inadimplente} color="#f85149" />
            <MiniStat label="Total a pagar" value={formatMoney(totalAPagar)} color="#58a6ff" />
          </div>

          {cobrancas.length === 0 ? (
            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Nenhuma cobranca registrada.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {cobrancas.slice(0, 4).map((cobranca) => (
                <div key={cobranca.id} style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 12, background: 'var(--bg-3)' }}>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{cobranca.descricao || cobranca.tipo}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                    {formatReferenceLabel(cobranca.mes_referencia)} · venc. {cobranca.vencimento ? new Date(`${cobranca.vencimento}T12:00:00`).toLocaleDateString('pt-BR') : '-'}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                    Valor: <strong style={{ color: 'var(--text)' }}>{formatMoney(cobranca.valor)}</strong>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <Bell size={16} color="#58a6ff" />
            <span style={{ fontWeight: 700, fontSize: 14 }}>Avisos recentes</span>
          </div>

          {avisosRecentes.length === 0 ? (
            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Nenhum aviso no momento.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {avisosRecentes.map((aviso) => (
                <div key={aviso.id} style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 12, background: 'var(--bg-3)' }}>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{aviso.titulo}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4, lineHeight: 1.6 }}>
                    {aviso.conteudo.length > 120 ? `${aviso.conteudo.slice(0, 120)}...` : aviso.conteudo}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="card" style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
          <MessageSquareText size={16} color="#58a6ff" />
          <span style={{ fontWeight: 700, fontSize: 14 }}>Historico de avisos</span>
        </div>

        {avisosHistorico.length === 0 ? (
          <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Nenhum aviso pendente para consulta.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {avisosHistorico.map((aviso) => (
              <div key={`history-${aviso.id}`} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, borderBottom: '1px solid var(--border-subtle)', paddingBottom: 12 }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{aviso.titulo}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>{aviso.conteudo.length > 160 ? `${aviso.conteudo.slice(0, 160)}...` : aviso.conteudo}</div>
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-dim)', whiteSpace: 'nowrap' }}>
                  {new Date(aviso.created_at).toLocaleDateString('pt-BR')}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

    </div>
  )
}

function MiniStat({ label, value, color }) {
  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 12, background: 'var(--bg-3)' }}>
      <div style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '.06em' }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700, color, marginTop: 6 }}>{value}</div>
    </div>
  )
}
