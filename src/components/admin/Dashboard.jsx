import { useEffect, useMemo, useState } from 'react'
import { Users, DollarSign, Bell, Clock3, MessageSquareWarning, Sparkles, CalendarClock, BadgeInfo, AlertTriangle } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import { useCondominiumSettings } from '../../hooks/useCondominiumSettings'
import { useMoradorPresence } from '../../hooks/useMoradorPresence'
import { applyTenantFilter } from '../../lib/tenant'
import { APARTMENT_TOTAL } from '../../lib/apartments'
import { PROJECT_VERSION } from '../../lib/condoConfig'
import { buildChargeStatusChartData, countChargeStatuses } from '../../lib/chargeStatus'
import ChargesStatusChart from '../shared/ChargesStatusChart'

export default function AdminDashboard({ isActive = true }) {
  const { profile, condominiumId } = useAuth()
  const { settings: condominiumSettings } = useCondominiumSettings(condominiumId)
  const { totalOnline } = useMoradorPresence(profile, false)
  const [stats, setStats] = useState({ moradores: 0, emAberto: 0, inadimplente: 0, recebido: 0, avisos: 0 })
  const [ultimaCobranca, setUltimaCobranca] = useState(null)
  const [health, setHealth] = useState({ online: false, ocorrencias: [] })
  const [chartData, setChartData] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!isActive) return
    void fetchDashboard()
  }, [condominiumId, isActive])

  const fetchDashboard = async () => {
    setLoading(true)

    try {
      const [moradoresRes, cobrancasRes, avisosRes, ocorrenciasRes] = await Promise.all([
        applyTenantFilter(
          supabase.from('profiles').select('id', { count: 'exact', head: true }).in('role', ['morador', 'RESIDENT']).eq('ativo', true),
          condominiumId,
        ),
        applyTenantFilter(
          supabase.from('cobrancas').select('id, descricao, valor, pago, payment_status, vencimento, data_pagamento, paid_at, mes_referencia, created_at').order('created_at', { ascending: false }),
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

      const cobrancas = cobrancasRes.data || []
      const statusSummary = countChargeStatuses(cobrancas)
      const recebido = cobrancas
        .filter((item) => item.pago)
        .reduce((sum, item) => sum + Number(item.valor || 0), 0)

      setStats({
        moradores: moradoresRes.count || 0,
        emAberto: statusSummary.em_aberto,
        inadimplente: statusSummary.inadimplente,
        recebido,
        avisos: avisosRes.count || 0,
      })

      const ultimaPorVencimento = [...cobrancas]
        .filter((item) => item.vencimento)
        .sort((a, b) => new Date(b.vencimento) - new Date(a.vencimento))

      setUltimaCobranca(ultimaPorVencimento[0] || null)
      setHealth({
        online: !(moradoresRes.error || cobrancasRes.error || avisosRes.error),
        ocorrencias: ocorrenciasRes.error ? [] : (ocorrenciasRes.data || []),
      })
      setChartData(buildChargeStatusChartData(cobrancas))
    } catch (error) {
      console.error('Erro ao carregar painel admin:', error)
      setHealth({ online: false, ocorrencias: [] })
      setChartData(buildChargeStatusChartData([]))
    } finally {
      setLoading(false)
    }
  }

  const melhoriasStatus = useMemo(() => {
    const abertas = health.ocorrencias.filter((item) => item.status !== 'resolvido')
    if (abertas.length === 0) {
      return { label: 'Tudo funcionando', color: 'green', helper: 'Nenhuma ocorrencia em aberto.' }
    }

    const titulos = abertas.map((item) => (item.titulo || '').trim().toLowerCase())
    const repetida = titulos.some((value, index) => value && titulos.indexOf(value) !== index)

    if (repetida || abertas.length >= 2) {
      return { label: 'Defeito encontrado', color: 'red', helper: 'Ha ocorrencias repetidas ou multiplos avisos semelhantes.' }
    }

    return { label: 'Precisa de atencao', color: 'orange', helper: 'Existe uma ocorrencia aguardando analise do sindico.' }
  }, [health.ocorrencias])

  const limpezaStatus = useMemo(() => {
    const limpezaAberta = health.ocorrencias.some((item) => item.status !== 'resolvido' && item.categoria === 'limpeza')
    return limpezaAberta
      ? { label: 'Em aberto', color: 'orange' }
      : { label: 'Em dia', color: 'green' }
  }, [health.ocorrencias])

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
        <div className="page-title">Painel do administrador</div>
        <div className="page-subtitle">Visao geral operacional e em tempo real do condominio</div>
      </div>

      <div className="stats-grid">
        <StatCard icon={Users} label="Moradores ativos" value={stats.moradores} color="green" />
        <StatCard icon={Clock3} label="Cobrancas em aberto" value={stats.emAberto} color="orange" />
        <StatCard icon={AlertTriangle} label="Inadimplentes" value={stats.inadimplente} color="red" />
        <StatCard icon={DollarSign} label="Recebido no periodo" value={`R$ ${stats.recebido.toFixed(2).replace('.', ',')}`} color="blue" />
        <StatCard icon={Bell} label="Avisos ativos" value={stats.avisos} color="purple" />
      </div>

      <div className="grid-2" style={{ marginBottom: 24 }}>
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <BadgeInfo size={16} color="#3fb950" />
            <span style={{ fontWeight: 600, fontSize: 14 }}>Informacoes do sistema</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <InfoRow label="Moradores online" value={`${totalOnline} usuario(s)`} badge={totalOnline > 0 ? 'green' : 'blue'} />
            <InfoRow label="Total de apartamentos" value={`${condominiumSettings.unitCount || APARTMENT_TOTAL} unidades`} />
            <InfoRow label="Ultima cobranca" value={ultimaCobranca?.vencimento ? new Date(`${ultimaCobranca.vencimento}T12:00:00`).toLocaleDateString('pt-BR') : 'Sem lancamentos'} />
            <InfoRow label="Chave Pix" value={condominiumSettings.pixKey ? `${condominiumSettings.pixProvider} · ${condominiumSettings.pixKey}` : 'Nao configurada'} />
            <InfoRow label="Canal direto" value={condominiumSettings.whatsappLabel} />
          </div>
        </div>

        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <Sparkles size={16} color="#58a6ff" />
            <span style={{ fontWeight: 600, fontSize: 14 }}>Saude da plataforma</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <InfoRow label="Melhorias" value={melhoriasStatus.label} badge={melhoriasStatus.color} />
            <InfoRow label="Limpeza" value={limpezaStatus.label} badge={limpezaStatus.color} />
            <InfoRow label="Sistema" value={health.online ? 'Tudo funcionando' : 'Precisa de atencao'} badge={health.online ? 'green' : 'orange'} />
            <InfoRow label="Versao do projeto" value={PROJECT_VERSION} />
          </div>
          <div style={{ marginTop: 14, fontSize: 12, color: '#8b949e' }}>{melhoriasStatus.helper}</div>
        </div>
      </div>

      <div className="grid-2" style={{ alignItems: 'start' }}>
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <CalendarClock size={16} color="#58a6ff" />
            <span style={{ fontWeight: 600, fontSize: 14 }}>Status das cobrancas por competencia</span>
          </div>
          <ChargesStatusChart data={chartData} />
        </div>

        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <MessageSquareWarning size={16} color="#f0883e" />
            <span style={{ fontWeight: 600, fontSize: 14 }}>Ultimas notificacoes dos moradores</span>
          </div>
          {health.ocorrencias.length === 0 ? (
            <div style={{ fontSize: 13, color: '#8b949e' }}>Nenhuma ocorrencia registrada no momento.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {health.ocorrencias.slice(0, 4).map((item) => (
                <div key={item.id} style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 14, background: 'var(--bg-3)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', marginBottom: 6 }}>
                    <div style={{ fontWeight: 600 }}>{item.titulo}</div>
                    <span className={`badge ${item.status === 'resolvido' ? 'badge-green' : 'badge-orange'}`}>
                      {item.status === 'resolvido' ? 'Resolvido' : 'Em aberto'}
                    </span>
                  </div>
                  <div style={{ fontSize: 12, color: '#8b949e' }}>{item.descricao}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function StatCard({ icon: Icon, label, value, color }) {
  const colors = { green: '#3fb950', blue: '#58a6ff', orange: '#f0883e', purple: '#bc8cff', red: '#f85149' }
  const dims = { green: '#1a3a24', blue: '#1a2a3a', orange: '#3a2010', purple: '#2a1a3a', red: '#3a1010' }
  const currentColor = colors[color]
  const currentBg = dims[color]

  return (
    <div className="stat-card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div className="label">{label}</div>
        <div style={{ background: currentBg, borderRadius: 8, padding: 6, display: 'flex' }}>
          <Icon size={16} color={currentColor} />
        </div>
      </div>
      <div className="value" style={{ color: currentColor }}>{value}</div>
    </div>
  )
}

function InfoRow({ label, value, badge }) {
  const badgeMap = { green: 'badge-green', blue: 'badge-blue', orange: 'badge-orange', red: 'badge-red' }

  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, fontSize: 13 }}>
      <span style={{ color: '#8b949e' }}>{label}</span>
      {badge
        ? <span className={`badge ${badgeMap[badge]}`}>{value}</span>
        : <span style={{ fontWeight: 500, textAlign: 'right' }}>{value}</span>}
    </div>
  )
}
