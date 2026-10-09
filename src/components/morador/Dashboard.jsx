import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import { describeResidentAccess, isNoticeForProfile } from '../../lib/units'
import { isNoticeCurrent } from '../../lib/avisos'
import { isNoticeHidden, isNoticeRead, markNoticesRead, readNoticeState } from '../../lib/avisosLidos'
import { ArrowRight, Bell, ChevronRight, CircleCheck, Clock3, DoorClosed, FileText, KeyRound, QrCode, Receipt, TriangleAlert } from 'lucide-react'
import { getChargeStatus } from '../../lib/chargeStatus'
import { formatReferenceLabel } from '../../lib/billingShared'
import PushPrompt from '../shared/PushPrompt'
import { InstallAppCard } from '../shared/InstallApp'
import { getTenantChargeSummary } from '../../lib/tenantApi'
import { saveLastView } from '../../lib/lastView'

const EMPTY_SUMMARY = {
  total_unidades: 0,
  competencia: '',
  unidades_cobradas: 0,
  proximo_vencimento: '',
  carencia_horas: 48,
  em_aberto: 0,
  pago: 0,
  inadimplente: 0,
}

const DIA_MS = 86400000

function formatDate(value) {
  return value ? new Date(`${value}T12:00:00`).toLocaleDateString('pt-BR') : '-'
}

function formatMoney(value = 0) {
  return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function hojePorExtenso() {
  const texto = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })
  return texto.charAt(0).toUpperCase() + texto.slice(1)
}

// Selo do cartao "Proxima cobranca": quanto falta para vencer, ou ha quanto venceu.
function seloDoVencimento(cobranca) {
  if (!cobranca?.vencimento) return { texto: 'Em aberto', tom: 'amber', Icone: Clock3 }
  const hoje = new Date()
  hoje.setHours(12, 0, 0, 0)
  const dias = Math.round((new Date(`${cobranca.vencimento}T12:00:00`) - hoje) / DIA_MS)
  if (getChargeStatus(cobranca) === 'inadimplente') return { texto: 'Em atraso', tom: 'red', Icone: TriangleAlert }
  if (dias < 0) return { texto: `Venceu há ${-dias} ${dias === -1 ? 'dia' : 'dias'}`, tom: 'red', Icone: TriangleAlert }
  if (dias === 0) return { texto: 'Vence hoje', tom: 'amber', Icone: Clock3 }
  return { texto: `Vence em ${dias} ${dias === 1 ? 'dia' : 'dias'}`, tom: dias <= 5 ? 'amber' : 'neutral', Icone: Clock3 }
}

// Inicio do morador (redesign v2.10A3): cartao da proxima cobranca em destaque, o mes no
// condominio, avisos recentes e atalhos. Os dados sao os mesmos de antes (RLS do morador).
export default function MoradorDashboard({ isActive = true, onNavigate = () => {} }) {
  const { profile } = useAuth()
  const [cobrancas, setCobrancas] = useState([])
  const [avisos, setAvisos] = useState([])
  const [loading, setLoading] = useState(true)
  const [tenantSummary, setTenantSummary] = useState(EMPTY_SUMMARY)

  useEffect(() => {
    if (!isActive || !profile?.id) return

    void (async () => {
      setLoading(true)

      const [cobrancasRes, avisosRes, summaryRes] = await Promise.all([
        // RLS: cobrancas da pessoa e das unidades dela (inquilino: desde que entrou na unidade).
        supabase.from('cobrancas').select('*').order('created_at', { ascending: false }),
        supabase.from('avisos').select('*').eq('ativo', true).order('created_at', { ascending: false }).limit(40),
        getTenantChargeSummary().catch(() => EMPTY_SUMMARY),
      ])

      // Inicio mostra so os avisos ainda nao abertos (v2.10A4); os lidos ficam em Avisos.
      const lidos = readNoticeState(profile.id)
      const avisosFiltrados = (avisosRes.data || [])
        .filter((aviso) => isNoticeCurrent(aviso) && isNoticeForProfile(aviso, profile))
        .filter((aviso) => !isNoticeRead(lidos, aviso) && !isNoticeHidden(lidos, aviso))

      setCobrancas(cobrancasRes.data || [])
      setAvisos(avisosFiltrados)
      setTenantSummary({ ...EMPTY_SUMMARY, ...summaryRes })
      setLoading(false)
    })()
  }, [isActive, profile])

  const access = describeResidentAccess(profile)
  const avisosRecentes = avisos.slice(0, 3)

  // Em aberto, da que vence primeiro para a ultima.
  const emAberto = useMemo(() => (
    cobrancas
      .filter((item) => getChargeStatus(item) !== 'pago')
      .sort((a, b) => String(a.vencimento || '9999').localeCompare(String(b.vencimento || '9999')))
  ), [cobrancas])
  const proxima = emAberto[0] || null
  const segunda = emAberto[1] || null

  // Abriu o aviso: sai do Inicio e fica registrado em Avisos.
  const abrirAviso = (aviso) => {
    markNoticesRead(profile?.id, [aviso.id])
    setAvisos((atual) => atual.filter((item) => item.id !== aviso.id))
    onNavigate('avisos')
  }

  // Abre Minhas cobrancas ja com o painel de pagamento daquela cobranca.
  const pagar = (cobranca) => {
    if (cobranca?.id && profile?.id) saveLastView('morador-cobranca', profile.id, cobranca.id)
    onNavigate('cobrancas')
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
        <div className="spinner" />
      </div>
    )
  }

  const selo = seloDoVencimento(proxima)
  const cobradas = tenantSummary.unidades_cobradas || 0
  const pct = (valor) => (cobradas ? `${(valor / cobradas) * 100}%` : '0%')

  return (
    <div className="fade-in home">
      <div className="home-head">
        <div>
          <div className="home-date">{hojePorExtenso()}</div>
          <h1 className="page-title" style={{ marginTop: 2 }}>Olá, {profile?.nome?.split(' ')[0]}</h1>
        </div>
        <div className="home-chips">
          <span className="home-chip"><KeyRound size={14} />{access.isOwner ? 'Proprietário(a)' : 'Inquilino(a)'}</span>
          <span className="home-chip"><DoorClosed size={14} />{access.unitsLabel}</span>
        </div>
      </div>

      <div className="home-cols home-cols-morador">
        <div className="home-main">
          <section className="hero-card m-order-1">
            <img src="/brand/wc-simbolo.svg" alt="" aria-hidden="true" className="hero-card-mark" />
            <div className="hero-card-body">
              <div className="hero-card-top">
                <span className="hero-card-kicker"><Receipt size={16} />Próxima cobrança</span>
                {proxima
                  ? <span className={`hero-chip hero-chip-${selo.tom}`}><selo.Icone size={13} />{selo.texto}</span>
                  : <span className="hero-chip hero-chip-green"><CircleCheck size={13} />Tudo em dia</span>}
              </div>

              {proxima ? (
                <>
                  <div>
                    <div className="hero-card-title">{proxima.descricao || proxima.tipo || 'Cobrança'}{proxima.mes_referencia ? ` · ${formatReferenceLabel(proxima.mes_referencia)}` : ''}</div>
                    <div className="hero-card-amount">{formatMoney(proxima.valor)}</div>
                    <div className="hero-card-meta">
                      Vencimento {formatDate(proxima.vencimento)}{proxima.unidade_numero ? ` · Unidade ${proxima.unidade_numero}` : ''}
                    </div>
                  </div>
                  <div className="hero-card-actions">
                    <button type="button" className="hero-btn hero-btn-primary" onClick={() => pagar(proxima)}>
                      <QrCode size={20} />Pagar agora
                    </button>
                    <button type="button" className="hero-btn" onClick={() => onNavigate('cobrancas')}>
                      <Receipt size={18} />Ver cobranças
                    </button>
                  </div>
                </>
              ) : (
                <div>
                  <div className="hero-card-title">Nenhuma cobrança em aberto</div>
                  <div className="hero-card-meta">Quando o síndico lançar uma cobrança, ela aparece aqui com o botão de pagar.</div>
                </div>
              )}
            </div>
          </section>

          {segunda && (
            <button type="button" className="home-row-card m-order-2" onClick={() => pagar(segunda)}>
              <span className="home-icon home-icon-primary"><Receipt size={20} /></span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span className="home-row-title">{segunda.descricao || segunda.tipo || 'Cobrança'}</span>
                <span className="home-row-sub">Também em aberto · vence {formatDate(segunda.vencimento)}</span>
              </span>
              <span className="home-row-amount">{formatMoney(segunda.valor)}</span>
              <ChevronRight size={18} color="var(--text-dim)" />
            </button>
          )}

          <section className="home-panel m-order-6">
            <div className="home-panel-head">
              <span className="home-panel-title">Avisos recentes</span>
              <button type="button" className="home-link" onClick={() => onNavigate('avisos')}>Ver todos<ArrowRight size={15} /></button>
            </div>
            {avisosRecentes.length === 0 ? (
              <div className="home-empty">Nenhum aviso novo. Os avisos já abertos ficam em “Ver todos”.</div>
            ) : avisosRecentes.map((aviso) => (
              <button key={aviso.id} type="button" className="home-notice" onClick={() => abrirAviso(aviso)}>
                <span className="home-icon home-icon-primary"><Bell size={18} /></span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span className="home-row-title home-ellipsis">{aviso.titulo}</span>
                  <span className="home-row-sub home-ellipsis">{aviso.conteudo}</span>
                </span>
                <span className="home-notice-date">{new Date(aviso.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}</span>
              </button>
            ))}
          </section>
        </div>

        <div className="home-side">
          <InstallAppCard />
          <PushPrompt />

          <section className="home-panel home-panel-pad m-order-5">
            <div className="home-panel-head" style={{ padding: 0, marginBottom: 4 }}>
              <span className="home-panel-title">{tenantSummary.competencia ? `${formatReferenceLabel(tenantSummary.competencia)} no condomínio` : 'Mês no condomínio'}</span>
              <span className="home-dim">{tenantSummary.total_unidades} unidades</span>
            </div>
            {cobradas === 0 ? (
              <div className="home-muted">Nenhuma cobrança lançada até o momento.</div>
            ) : (
              <>
                <div className="home-muted" style={{ marginBottom: 16 }}>
                  {tenantSummary.pago} {tenantSummary.pago === 1 ? 'unidade já pagou' : 'unidades já pagaram'}.
                  {tenantSummary.proximo_vencimento && <> Vencimento em {formatDate(tenantSummary.proximo_vencimento).slice(0, 5)}.</>}
                </div>
                <div className="home-bar">
                  <div style={{ width: pct(tenantSummary.pago), background: 'var(--green-solid)' }} />
                  <div style={{ width: pct(tenantSummary.em_aberto), background: 'var(--amber-solid)' }} />
                  <div style={{ width: pct(tenantSummary.inadimplente), background: 'var(--red-solid)' }} />
                </div>
                <div className="home-legend">
                  <div><span><i style={{ background: 'var(--green-solid)' }} />Pagas</span><b>{tenantSummary.pago}</b></div>
                  <div><span><i style={{ background: 'var(--amber-solid)' }} />Em aberto</span><b>{tenantSummary.em_aberto}</b></div>
                  <div><span><i style={{ background: 'var(--red-solid)' }} />Atrasadas</span><b>{tenantSummary.inadimplente}</b></div>
                </div>
              </>
            )}
            <div className="home-note">
              Sem identificação do pagamento em até {tenantSummary.carencia_horas}h após o vencimento, a unidade passa para inadimplente.
            </div>
          </section>

          <div className="home-shortcuts m-order-7">
            <button type="button" className="home-shortcut" onClick={() => onNavigate('ocorrencias')}>
              <span className="home-icon home-icon-amber"><TriangleAlert size={18} /></span>
              <span><span className="home-row-title">Registrar ocorrência</span><span className="home-row-sub">Vai direto para o síndico</span></span>
            </button>
            <button type="button" className="home-shortcut" onClick={() => onNavigate('documentos')}>
              <span className="home-icon home-icon-primary"><FileText size={18} /></span>
              <span><span className="home-row-title">Documentos</span><span className="home-row-sub">Atas, regimento, contas</span></span>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
