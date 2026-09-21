import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import { useCondominiumSettings } from '../../hooks/useCondominiumSettings'
import { applyTenantFilter } from '../../lib/tenant'
import { Bell, DollarSign, Home, MessageSquareWarning, Users } from 'lucide-react'
import { buildChargeStatusChartData, countChargeStatuses, getChargePaymentStatus } from '../../lib/chargeStatus'
import ChargeSummaryBars from '../shared/ChargeSummaryBars'
import ChargeTrendLine from '../shared/ChargeTrendLine'
import { NOTICE_RETENTION_DAYS } from '../../lib/avisos'
import { ACTIVE_UNIT_STATUSES } from '../../lib/units'

function isSameMonth(value, reference = new Date()) {
  if (!value) return false
  const date = new Date(String(value).length === 10 ? `${value}T12:00:00` : value)
  return !Number.isNaN(date.getTime()) && date.getMonth() === reference.getMonth() && date.getFullYear() === reference.getFullYear()
}
import { buildResidentRequestSummary, filterSyndicNotifications } from '../../lib/residentRequests'

export default function AdminDashboard({ isActive = true }) {
  const { profile, condominiumId } = useAuth()
  const { settings: condominiumSettings } = useCondominiumSettings(condominiumId)
  const [stats, setStats] = useState({ unidadesAtivas: 0, unidadesCadastradas: 0, avisos: 0 })
  const [cobrancas, setCobrancas] = useState([])
  const [ocorrencias, setOcorrencias] = useState([])
  const [loading, setLoading] = useState(true)

  const fetchDashboard = useCallback(async () => {
    setLoading(true)

    try {
      const [unidadesRes, cobrancasRes, avisosRes, ocorrenciasRes] = await Promise.all([
        supabase.from('unidades').select('id, situacao').eq('condominium_id', condominiumId),
        applyTenantFilter(
          supabase.from('cobrancas').select('id, descricao, valor, pago, payment_status, vencimento, mes_referencia, data_pagamento, paid_at, created_at').order('created_at', { ascending: false }),
          condominiumId,
        ),
        applyTenantFilter(
          supabase.from('avisos').select('id', { count: 'exact', head: true }).eq('ativo', true).gte('created_at', new Date(Date.now() - NOTICE_RETENTION_DAYS * 86400000).toISOString()),
          condominiumId,
        ),
        applyTenantFilter(
          supabase.from('ocorrencias_predio').select('*').order('created_at', { ascending: false }),
          condominiumId,
        ),
      ])

      const unidades = unidadesRes.error ? [] : (unidadesRes.data || [])
      setStats({
        unidadesAtivas: unidades.filter((item) => ACTIVE_UNIT_STATUSES.includes(item.situacao)).length,
        unidadesCadastradas: unidades.length,
        avisos: avisosRes.count || 0,
      })
      setCobrancas(cobrancasRes.data || [])
      setOcorrencias(ocorrenciasRes.data || [])
    } catch (error) {
      console.error('Erro ao carregar painel admin:', error)
      setStats({ unidadesAtivas: 0, unidadesCadastradas: 0, avisos: 0 })
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
  const chartData = useMemo(() => buildChargeStatusChartData(cobrancas, 6), [cobrancas])
  // Recebido no mes: somente cobrancas confirmadas pelo sindico (PAID) com pagamento neste mes.
  const totalRecebido = useMemo(() => (
    cobrancas
      .filter((item) => getChargePaymentStatus(item) === 'PAID' && isSameMonth(item.paid_at || item.data_pagamento))
      .reduce((sum, item) => sum + Number(item.valor || 0), 0)
  ), [cobrancas])

  // Caixa do sindico: so o que os moradores mandaram para ele, e so sobre cobrancas que existem.
  const pendentes = useMemo(() => filterSyndicNotifications(ocorrencias, {
    chargeIds: new Set(cobrancas.map((item) => item.id)),
    viewerId: profile?.id,
  }), [ocorrencias, cobrancas, profile?.id])
  const notificacoes = pendentes.slice(0, 6)
  const unitLimit = Number(condominiumSettings.unitCount || 0)

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
        <StatCard icon={Home} label="Unidades ativas" value={stats.unidadesAtivas} helper={`Ocupadas ou alugadas · ${stats.unidadesCadastradas} de ${unitLimit || '-'} cadastradas`} color="#3fb950" />
        <StatCard icon={Bell} label="Avisos ativos" value={stats.avisos} helper="Publicados pelo sindico" color="#58a6ff" />
        <StatCard icon={MessageSquareWarning} label="Avisos pendentes" value={pendentes.length} helper="Enviados pelos moradores" color="#f0883e" />
        <StatCard icon={DollarSign} label="Recebido no mes" value={Number(totalRecebido || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} helper="Pagamentos confirmados" color="#bc8cff" />
      </div>

      <div className="grid-2" style={{ marginBottom: 24, alignItems: 'start' }}>
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <Users size={16} color="#3fb950" />
            <span style={{ fontWeight: 700, fontSize: 14 }}>Resumo do condominio</span>
          </div>

          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>
            {condominiumSettings.name} possui {stats.unidadesCadastradas} de {unitLimit || '-'} unidades cadastradas.
          </div>

          <ChargeSummaryBars
            totalApartamentos={stats.unidadesCadastradas}
            emAberto={statusCount.em_aberto}
            pago={statusCount.pago}
            inadimplente={statusCount.inadimplente}
          >
            <ChargeTrendLine data={chartData} />
          </ChargeSummaryBars>
        </div>

        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <MessageSquareWarning size={16} color="#f0883e" />
            <span style={{ fontWeight: 700, fontSize: 14 }}>Notificacoes e avisos dos moradores</span>
          </div>

          {notificacoes.length === 0 ? (
            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Nenhum aviso pendente dos moradores no momento.</div>
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

function StatCard({ icon: Icon, label, value, helper, color }) {
  return (
    <div className="stat-card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div className="label">{label}</div>
        <div style={{ background: `${color}22`, borderRadius: 8, padding: 6, display: 'flex' }}>
          <Icon size={16} color={color} />
        </div>
      </div>
      <div className="value" style={{ color }}>{value}</div>
      {helper && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>{helper}</div>}
    </div>
  )
}
