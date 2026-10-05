import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import { useCondominiumSettings } from '../../hooks/useCondominiumSettings'
import { applyTenantFilter } from '../../lib/tenant'
import { ArrowRight, Building2, CircleCheck, Clock3, Megaphone, MessageSquareWarning, Plus, TriangleAlert } from 'lucide-react'
import { buildChargeStatusChartData, getChargeStatus, getChargePaymentStatus } from '../../lib/chargeStatus'
import { formatReferenceLabel } from '../../lib/billingShared'
import { ACTIVE_UNIT_STATUSES } from '../../lib/units'
import { normalizeRole } from '../../lib/auth'
import { buildResidentRequestSummary, filterSyndicNotifications } from '../../lib/residentRequests'
import { InstallAppCard } from '../shared/InstallApp'

function isSameMonth(value, reference = new Date()) {
  if (!value) return false
  const date = new Date(String(value).length === 10 ? `${value}T12:00:00` : value)
  return !Number.isNaN(date.getTime()) && date.getMonth() === reference.getMonth() && date.getFullYear() === reference.getFullYear()
}

function formatMoney(value = 0) {
  return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function formatDate(value) {
  return value ? new Date(`${value}T12:00:00`).toLocaleDateString('pt-BR') : '-'
}

function saudacao() {
  const hora = new Date().getHours()
  if (hora < 12) return 'Bom dia'
  if (hora < 18) return 'Boa tarde'
  return 'Boa noite'
}

function hojePorExtenso() {
  const texto = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })
  return texto.charAt(0).toUpperCase() + texto.slice(1)
}

// Painel do sindico (redesign v2.10A3): indicadores do mes, arrecadacao da competencia mais
// recente, o que precisa do sindico (pedidos dos moradores) e quem esta em atraso.
export default function AdminDashboard({ isActive = true, onNavigate = () => {} }) {
  const { profile, condominiumId } = useAuth()
  const { settings: condominiumSettings } = useCondominiumSettings(condominiumId)
  const [stats, setStats] = useState({ unidadesAtivas: 0, unidadesCadastradas: 0, avisos: 0 })
  const [cobrancas, setCobrancas] = useState([])
  const [ocorrencias, setOcorrencias] = useState([])
  const [loading, setLoading] = useState(true)
  const isAccountant = normalizeRole(profile?.role) === 'contador'

  const fetchDashboard = useCallback(async () => {
    setLoading(true)

    try {
      const [unidadesRes, cobrancasRes, ocorrenciasRes] = await Promise.all([
        supabase.from('unidades').select('id, situacao').eq('condominium_id', condominiumId),
        applyTenantFilter(
          supabase.from('cobrancas').select('id, descricao, valor, pago, payment_status, vencimento, mes_referencia, data_pagamento, paid_at, created_at, unidade_numero').order('created_at', { ascending: false }),
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
      })
      setCobrancas(cobrancasRes.data || [])
      setOcorrencias(ocorrenciasRes.data || [])
    } catch (error) {
      console.error('Erro ao carregar painel admin:', error)
      setStats({ unidadesAtivas: 0, unidadesCadastradas: 0 })
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

  const chartData = useMemo(() => buildChargeStatusChartData(cobrancas, 6), [cobrancas])

  // Recebido no mes: so cobrancas confirmadas pelo sindico (PAID) com pagamento neste mes.
  const recebidoNoMes = useMemo(() => {
    const pagas = cobrancas.filter((item) => getChargePaymentStatus(item) === 'PAID' && isSameMonth(item.paid_at || item.data_pagamento))
    return { valor: pagas.reduce((sum, item) => sum + Number(item.valor || 0), 0), quantidade: pagas.length }
  }, [cobrancas])

  const porStatus = useMemo(() => {
    const total = { em_aberto: { valor: 0, n: 0 }, inadimplente: { valor: 0, n: 0 } }
    for (const item of cobrancas) {
      const status = getChargeStatus(item)
      if (total[status]) {
        total[status].valor += Number(item.valor || 0)
        total[status].n += 1
      }
    }
    return total
  }, [cobrancas])

  // Arrecadacao da competencia mais recente lancada.
  const arrecadacao = useMemo(() => {
    const ultima = cobrancas.map((item) => item.mes_referencia).filter(Boolean).sort().pop()
    if (!ultima) return null
    const doMes = cobrancas.filter((item) => item.mes_referencia === ultima)
    const lancado = doMes.reduce((sum, item) => sum + Number(item.valor || 0), 0)
    const pagas = doMes.filter((item) => getChargeStatus(item) === 'pago')
    const recebido = pagas.reduce((sum, item) => sum + Number(item.valor || 0), 0)
    const atrasadas = doMes.filter((item) => getChargeStatus(item) === 'inadimplente').length
    return {
      ref: ultima,
      lancado,
      recebido,
      pct: lancado ? Math.round((recebido / lancado) * 100) : 0,
      total: doMes.length,
      pagas: pagas.length,
      atrasadas,
      abertas: doMes.length - pagas.length - atrasadas,
    }
  }, [cobrancas])

  // Caixa do sindico: so o que os moradores mandaram para ele, e so sobre cobrancas que existem.
  const pendentes = useMemo(() => filterSyndicNotifications(ocorrencias, {
    chargeIds: new Set(cobrancas.map((item) => item.id)),
    viewerId: profile?.id,
  }), [ocorrencias, cobrancas, profile?.id])

  const emAtraso = useMemo(() => (
    cobrancas
      .filter((item) => getChargeStatus(item) === 'inadimplente')
      .sort((a, b) => String(a.vencimento || '').localeCompare(String(b.vencimento || '')))
      .slice(0, 5)
  ), [cobrancas])

  const unitLimit = Number(condominiumSettings.unitCount || 0)

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
        <div className="spinner" />
      </div>
    )
  }

  const pct = (n) => (arrecadacao?.total ? `${(n / arrecadacao.total) * 100}%` : '0%')
  const kpis = [
    { Icon: CircleCheck, tom: 'green', label: 'Recebido no mês', valor: formatMoney(recebidoNoMes.valor), sub: `${recebidoNoMes.quantidade} ${recebidoNoMes.quantidade === 1 ? 'pagamento confirmado' : 'pagamentos confirmados'}` },
    { Icon: Clock3, tom: 'amber', label: 'A receber', valor: formatMoney(porStatus.em_aberto.valor), sub: `${porStatus.em_aberto.n} ${porStatus.em_aberto.n === 1 ? 'cobrança em aberto' : 'cobranças em aberto'}` },
    { Icon: TriangleAlert, tom: 'red', label: 'Em atraso', valor: formatMoney(porStatus.inadimplente.valor), sub: `${porStatus.inadimplente.n} ${porStatus.inadimplente.n === 1 ? 'cobrança vencida' : 'cobranças vencidas'}` },
    { Icon: Building2, tom: 'primary', label: 'Unidades ativas', valor: stats.unidadesAtivas, sub: `${stats.unidadesCadastradas} de ${unitLimit || '-'} cadastradas` },
  ]

  return (
    <div className="fade-in home">
      <div className="home-head">
        <div>
          <div className="home-date">{hojePorExtenso()}</div>
          <h1 className="page-title" style={{ marginTop: 2 }}>{saudacao()}, {profile?.nome?.split(' ')[0] || 'síndico(a)'}</h1>
        </div>
        {!isAccountant && (
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button type="button" className="btn btn-ghost" onClick={() => onNavigate('avisos')}><Megaphone size={17} />Novo aviso</button>
            <button type="button" className="btn btn-primary" onClick={() => onNavigate('cobrancas')}><Plus size={18} />Nova cobrança</button>
          </div>
        )}
      </div>

      <InstallAppCard />

      <div className="stats-grid" style={{ marginBottom: 0 }}>
        {kpis.map(({ Icon, tom, label, valor, sub }) => (
          <div key={label} className="stat-card">
            <div className="kpi-head">
              <span className={`kpi-icon kpi-${tom}`}><Icon size={17} /></span>
              <span className="label">{label}</span>
            </div>
            <div className="value">{valor}</div>
            <div className="sub">{sub}</div>
          </div>
        ))}
      </div>

      <div className="home-cols">
        <section className="home-main home-panel home-panel-pad" style={{ gap: 18, flex: '1.35 1 420px' }}>
          <div className="home-panel-head" style={{ padding: 0 }}>
            <span className="home-panel-title">Arrecadação{arrecadacao ? ` · ${formatReferenceLabel(arrecadacao.ref)}` : ''}</span>
            <button type="button" className="home-link" onClick={() => onNavigate('cobrancas')}>Ver cobranças<ArrowRight size={15} /></button>
          </div>
          {!arrecadacao ? (
            <div className="home-muted">Nenhuma cobrança lançada ainda. Use “Nova cobrança” para lançar a primeira competência.</div>
          ) : (
            <>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
                <span className="arrec-pct">{arrecadacao.pct}%</span>
                <span className="home-muted">{formatMoney(arrecadacao.recebido)} de {formatMoney(arrecadacao.lancado)} recebidos</span>
              </div>
              <div className="home-bar" style={{ height: 14 }}>
                <div style={{ width: pct(arrecadacao.pagas), background: 'var(--green-solid)' }} />
                <div style={{ width: pct(arrecadacao.abertas), background: 'var(--amber-solid)' }} />
                <div style={{ width: pct(arrecadacao.atrasadas), background: 'var(--red-solid)' }} />
              </div>
              <div className="arrec-legend">
                <span><i style={{ background: 'var(--green-solid)' }} />Pagas <b>{arrecadacao.pagas}</b></span>
                <span><i style={{ background: 'var(--amber-solid)' }} />Em aberto <b>{arrecadacao.abertas}</b></span>
                <span><i style={{ background: 'var(--red-solid)' }} />Em atraso <b>{arrecadacao.atrasadas}</b></span>
              </div>
              <div style={{ borderTop: '1px solid var(--line)', paddingTop: 16 }}>
                <div className="home-muted" style={{ fontSize: 13, marginBottom: 12 }}>Cobranças pagas por mês</div>
                <div className="arrec-months">
                  {chartData.map((mes, index) => {
                    const total = mes.pago + mes.em_aberto + mes.inadimplente
                    const p = total ? Math.round((mes.pago / total) * 100) : 0
                    const atual = index === chartData.length - 1
                    return (
                      <div key={mes.competencia} className="arrec-month">
                        <span className="arrec-month-pct" style={{ fontWeight: atual ? 600 : 400 }}>{p}%</span>
                        <div className="arrec-month-bar" style={{ height: `${Math.max(p, 4) * 0.72}px`, background: atual ? 'var(--primary)' : 'var(--primary-line)' }} />
                        <span className="arrec-month-label" style={{ fontWeight: atual ? 600 : 400 }}>{mes.competencia.split('/')[0]}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            </>
          )}
        </section>

        <div className="home-side" style={{ flex: '1 1 340px' }}>
          <section className="home-panel">
            <div className="home-panel-head" style={{ justifyContent: 'flex-start', gap: 10 }}>
              <span className="home-panel-title">Precisa de você</span>
              {pendentes.length > 0 && <span className="nav-badge">{pendentes.length}</span>}
            </div>
            {pendentes.length === 0 ? (
              <div className="home-empty">Nada pendente dos moradores no momento.</div>
            ) : pendentes.slice(0, 5).map((item) => {
              const summary = buildResidentRequestSummary(item)
              return (
                <div key={item.id} className="inbox-row">
                  <span className="home-icon home-icon-primary"><MessageSquareWarning size={18} /></span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="home-row-title" style={{ fontSize: 14 }}>{summary.title}</div>
                    <div className="home-row-sub home-ellipsis">{summary.detail}</div>
                  </div>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => onNavigate('cobrancas')}>Ver</button>
                </div>
              )
            })}
          </section>

          <section className="home-panel home-panel-pad" style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '16px 18px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <TriangleAlert size={17} color="var(--red)" />
              <span className="home-panel-title" style={{ fontSize: 15 }}>Em atraso</span>
            </div>
            {emAtraso.length === 0 ? (
              <div className="home-muted" style={{ fontSize: 13 }}>Nenhuma cobrança em atraso.</div>
            ) : emAtraso.map((item) => (
              <div key={item.id} className="late-row">
                <span className="late-unit">{item.unidade_numero || '-'}</span>
                <div style={{ flex: 1, minWidth: 0, fontSize: 14 }}>
                  {item.descricao || 'Cobrança'}
                  <div className="home-dim">{formatMoney(item.valor)} · venceu {formatDate(item.vencimento)}</div>
                </div>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => onNavigate('cobrancas')}>Ver</button>
              </div>
            ))}
          </section>
        </div>
      </div>
    </div>
  )
}
