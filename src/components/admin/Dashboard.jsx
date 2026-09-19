import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import { useCondominiumSettings } from '../../hooks/useCondominiumSettings'
import { applyTenantFilter } from '../../lib/tenant'
import { Bell, DollarSign, MessageSquareWarning, Users } from 'lucide-react'
import { countChargeStatuses, getChargeStatus } from '../../lib/chargeStatus'
import ChargeSummaryBars from '../shared/ChargeSummaryBars'
import { buildResidentRequestSummary, isResidentRequestPending } from '../../lib/residentRequests'

export default function AdminDashboard({ isActive = true }) {
  const { profile, condominiumId } = useAuth()
  const { settings: condominiumSettings } = useCondominiumSettings(condominiumId)
  const [stats, setStats] = useState({ moradores: 0, avisos: 0, totalApartamentos: 0 })
  const [cobrancas, setCobrancas] = useState([])
  const [ocorrencias, setOcorrencias] = useState([])
  const [loading, setLoading] = useState(true)

  const fetchDashboard = useCallback(async () => {
    setLoading(true)

    try {
      const [moradoresRes, cobrancasRes, avisosRes, ocorrenciasRes] = await Promise.all([
        applyTenantFilter(
          supabase.from('profiles').select('id, apartamento', { count: 'exact' }).in('role', ['morador', 'RESIDENT']).eq('ativo', true),
          condominiumId,
        ),
        applyTenantFilter(
          supabase.from('cobrancas').select('id, descricao, valor, pago, payment_status, vencimento, mes_referencia, created_at').order('created_at', { ascending: false }),
          condominiumId,
        ),
        applyTenantFilter(
          supabase.from('avisos').select('id', { count: 'exact', head: true }).eq('ativo', true),
          condominiumId,
        ),
        applyTenantFilter(
          supabase.from('ocorrencias_predio').select('*').order('created_at', { ascending: false }),
          condominiumId,
        ),
      ])

      const moradores = moradoresRes.data || []
      const uniqueApartments = new Set(moradores.map((item) => String(item.apartamento || '').trim()).filter(Boolean))

      setStats({
        moradores: moradoresRes.count || 0,
        avisos: avisosRes.count || 0,
        totalApartamentos: uniqueApartments.size,
      })
      setCobrancas(cobrancasRes.data || [])
      setOcorrencias(ocorrenciasRes.data || [])
    } catch (error) {
      console.error('Erro ao carregar painel admin:', error)
      setStats({ moradores: 0, avisos: 0, totalApartamentos: 0 })
      setCobrancas([])
      setOcorrencias([])
    } finally {
      setLoading(false)
    }
  }, [condominiumId])

  useEffect(() => {
    if (!isActive) return
    void fetchDashboard()
  }, [fetchDashboard, isActive])

  const statusCount = useMemo(() => countChargeStatuses(cobrancas), [cobrancas])
  const totalRecebido = useMemo(() => (
    cobrancas.filter((item) => getChargeStatus(item) === 'pago').reduce((sum, item) => sum + Number(item.valor || 0), 0)
  ), [cobrancas])

  const notificacoes = useMemo(() => (
    ocorrencias
      .filter((item) => isResidentRequestPending(item))
      .slice(0, 6)
  ), [ocorrencias])

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
        <div className="page-title">Bem vindo Sindico(a)</div>
        <div className="page-subtitle">Visao geral do Sistema em tempo real</div>
      </div>

      <div className="stats-grid">
        <StatCard icon={Users} label="Moradores ativos" value={stats.moradores} color="#3fb950" />
        <StatCard icon={Bell} label="Avisos ativos" value={stats.avisos} color="#58a6ff" />
        <StatCard icon={MessageSquareWarning} label="Solicitacoes pendentes" value={notificacoes.length} color="#f0883e" />
        <StatCard icon={DollarSign} label="Recebido no periodo" value={Number(totalRecebido || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} color="#bc8cff" />
      </div>

      <div className="grid-2" style={{ marginBottom: 24, alignItems: 'start' }}>
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <Users size={16} color="#3fb950" />
            <span style={{ fontWeight: 700, fontSize: 14 }}>Resumo do condominio</span>
          </div>

          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>
            {condominiumSettings.name} possui {stats.totalApartamentos || 0} apartamentos acompanhados nesta base.
          </div>

          <ChargeSummaryBars
            totalApartamentos={stats.totalApartamentos}
            emAberto={statusCount.em_aberto}
            pago={statusCount.pago}
            inadimplente={statusCount.inadimplente}
          />
        </div>

        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <MessageSquareWarning size={16} color="#f0883e" />
            <span style={{ fontWeight: 700, fontSize: 14 }}>Notificacoes e avisos dos moradores</span>
          </div>

          {notificacoes.length === 0 ? (
            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Nenhuma solicitacao pendente no momento.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {notificacoes.map((item) => {
                const summary = buildResidentRequestSummary(item)
                return (
                  <div key={item.id} style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 14, background: 'var(--bg-3)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', marginBottom: 6 }}>
                      <div style={{ fontWeight: 600 }}>{summary.title}</div>
                      <span className="badge badge-orange">Pendente</span>
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6 }}>{summary.detail}</div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function StatCard({ icon: Icon, label, value, color }) {
  return (
    <div className="stat-card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div className="label">{label}</div>
        <div style={{ background: `${color}22`, borderRadius: 8, padding: 6, display: 'flex' }}>
          <Icon size={16} color={color} />
        </div>
      </div>
      <div className="value" style={{ color }}>{value}</div>
    </div>
  )
}
