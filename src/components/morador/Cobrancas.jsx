import { useCallback, useEffect, useMemo, useState } from 'react'
import QRCode from 'qrcode'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import { useToast } from '../shared/Toast'
import { formatCurrency, formatReferenceLabel, formatReferenceLong } from '../../lib/billingShared'
import { enrichChargesWithPaymentUrls } from '../../lib/charges'
import { ArrowUpRight, Ban, Check, CircleCheck, Clock3, Copy, FileDown, Hammer, Hourglass, Link2, QrCode, Receipt, Send, TriangleAlert, X } from 'lucide-react'
import { getChargePaymentStatus } from '../../lib/chargeStatus'
import { withTenantFields } from '../../lib/tenant'
import { buildPaymentConfirmationTitle, isResidentPaymentConfirmation, isResidentRequestPending, parseResidentRequest } from '../../lib/residentRequests'
import { readLastView, saveLastView } from '../../lib/lastView'
import { checkChargePayment } from '../../lib/tenantApi'
import { describeResidentAccess } from '../../lib/units'
import { safeHttpUrl } from '../../lib/safeUrl'

const TIPOS_LABEL = {
  condominio: 'Condomínio',
  agua: 'Água',
  energia: 'Energia',
  multa: 'Multa',
  outro: 'Cobrança avulsa',
}

const TIPOS_ICON = { condominio: Receipt, agua: Receipt, energia: Receipt, multa: Hammer, outro: Receipt }

// Situacao vista pelo morador (redesign v2.10A3). "Informada" = avisou que pagou, o sindico ainda confere.
const STATE_META = {
  paid: { label: 'Paga', tone: 'green', Icon: CircleCheck },
  informed: { label: 'Aguardando o síndico', tone: 'primary', Icon: Hourglass },
  open: { label: 'Em aberto', tone: 'amber', Icon: Clock3 },
  late: { label: 'Em atraso', tone: 'red', Icon: TriangleAlert },
  cancelled: { label: 'Cancelada', tone: 'neutral', Icon: Ban },
}

function formatDate(dateValue = '') {
  if (!dateValue) return '-'
  return new Date(`${String(dateValue).slice(0, 10)}T12:00:00`).toLocaleDateString('pt-BR')
}

function shortDate(dateValue = '') {
  if (!dateValue) return '-'
  return new Date(`${String(dateValue).slice(0, 10)}T12:00:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
}

function getPrimaryPaymentLink(cobranca) {
  return String(cobranca?.pagamento_link || '').trim()
}

function chargeTitle(cobranca) {
  return cobranca.descricao || TIPOS_LABEL[cobranca.tipo] || cobranca.tipo
}

function paidDate(cobranca) {
  return cobranca.data_pagamento || String(cobranca.paid_at || '').slice(0, 10)
}

// Formas de pagar que a cobranca tem: link do banco (baixa automatica), Pix e boleto em PDF.
function paymentMethods(cobranca) {
  const methods = []
  const link = getPrimaryPaymentLink(cobranca)
  if (link) {
    methods.push(cobranca.pagamento_provedor === 'infinitepay'
      ? { key: 'link', label: 'Pix ou cartão pelo banco', sub: 'Página segura da InfinitePay', auto: true, Icon: Link2 }
      : { key: 'link', label: 'Link de pagamento', sub: 'Abre a página de pagamento', auto: false, Icon: Link2 })
  }
  if (cobranca.pix_copy_paste_code) methods.push({ key: 'pix', label: 'Pix copia e cola', sub: 'Pague pelo app do seu banco', auto: false, Icon: QrCode })
  if (cobranca.boleto_download_url) methods.push({ key: 'boleto', label: 'Boleto (PDF)', sub: 'Fatura com todos os dados', auto: false, Icon: FileDown })
  return methods
}

function PaySteps({ state, cobranca }) {
  const steps = [
    { label: 'Lançada', sub: shortDate(String(cobranca.created_at || '').slice(0, 10)) },
    { label: state === 'informed' ? 'Avisada' : 'Pagamento', sub: state === 'informed' ? 'por você' : state === 'paid' ? 'feito' : 'pendente' },
    { label: 'Confirmada', sub: state === 'paid' ? shortDate(paidDate(cobranca)) : 'pelo síndico' },
  ]
  const reached = state === 'paid' ? 3 : state === 'informed' ? 2 : 1
  return (
    <div className="pay-steps">
      {steps.map((step, index) => {
        const done = index < reached
        const current = index === reached && state !== 'cancelled'
        return (
          <div key={step.label} className="pay-step">
            <div className="pay-step-line">
              <i className={index === 0 ? 'off' : done ? 'on' : ''} />
              <div className={`pay-step-dot${done ? ' done' : current ? ' current' : ''}`}>{done && <Check size={13} strokeWidth={2.6} />}</div>
              <i className={index === steps.length - 1 ? 'off' : index < reached - 1 ? 'on' : ''} />
            </div>
            <strong>{step.label}</strong>
            <span>{step.sub}</span>
          </div>
        )
      })}
    </div>
  )
}

// Painel "Pagar" (redesign v2.10A3): lateral no computador, de baixo para cima no celular.
function PaymentSheet({ cobranca, state, onClose, onInform, informing, onCopy }) {
  const methods = useMemo(() => paymentMethods(cobranca), [cobranca])
  const [method, setMethod] = useState(methods[0]?.key || '')
  const [qr, setQr] = useState('')
  const meta = STATE_META[state]
  const StateIcon = meta.Icon
  const TypeIcon = TIPOS_ICON[cobranca.tipo] || Receipt
  const canPay = state === 'open' || state === 'late'
  const providedQr = [cobranca.pix_qrcode_url, cobranca.pix_qr_code].find((value) => String(value || '').startsWith('data:image/')) || ''

  useEffect(() => {
    if (providedQr || !cobranca.pix_copy_paste_code) return
    let active = true
    QRCode.toDataURL(cobranca.pix_copy_paste_code, { margin: 1, width: 240 }).then((url) => { if (active) setQr(url) }).catch(() => {})
    return () => { active = false }
  }, [cobranca.pix_copy_paste_code, providedQr])

  useEffect(() => {
    const onKey = (event) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const link = getPrimaryPaymentLink(cobranca)

  return (
    <div className="sheet-overlay" onClick={(event) => event.target === event.currentTarget && onClose()}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={`Cobrança ${chargeTitle(cobranca)}`}>
        <div className="sheet-grip"><span /></div>
        <div className="sheet-body">
          <div className="sheet-head">
            <span className="list-icon"><TypeIcon size={20} /></span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 16, fontWeight: 600 }} className="list-ellipsis">{chargeTitle(cobranca)}</div>
              <div className="list-sub" style={{ fontSize: 13 }}>{cobranca.unidade_numero ? `Unidade ${cobranca.unidade_numero} · ` : ''}Ref. {formatReferenceLabel(cobranca.mes_referencia)}</div>
            </div>
            <button type="button" className="sheet-close" onClick={onClose} aria-label="Fechar"><X size={18} /></button>
          </div>

          <div>
            <div className="sheet-amount">{formatCurrency(cobranca.valor)}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
              <span className={`pill tone-${meta.tone}`}><StateIcon size={13} />{meta.label}</span>
              <span style={{ fontSize: 14, color: 'var(--text-muted)' }}>{state === 'paid' ? `Pago em ${formatDate(paidDate(cobranca))}` : `Vence ${formatDate(cobranca.vencimento)}`}</span>
            </div>
          </div>

          <PaySteps state={state} cobranca={cobranca} />

          {canPay && methods.length > 0 && (
            <>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ fontSize: 14, fontWeight: 600 }}>Como você quer pagar?</div>
                {methods.map((item) => (
                  <button key={item.key} type="button" className={`pay-method${method === item.key ? ' active' : ''}`} onClick={() => setMethod(item.key)} aria-pressed={method === item.key}>
                    <span className="pay-radio" />
                    <span style={{ color: 'var(--text-muted)', display: 'flex' }}><item.Icon size={20} /></span>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span className="pay-method-label">{item.label}{item.auto && <span className="pill pill-sm tone-green">Baixa automática</span>}</span>
                      <span className="pay-method-sub">{item.sub}</span>
                    </span>
                  </button>
                ))}
              </div>

              {method === 'pix' && (
                <div className="pay-box">
                  <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
                    {(providedQr || qr) && <img className="pay-qr" src={providedQr || qr} alt="QR Code Pix" />}
                    <div style={{ flex: '1 1 160px', fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.5 }}>
                      <div style={{ fontWeight: 600, color: 'var(--text)', fontSize: 14, marginBottom: 4 }}>Pix para o condomínio</div>
                      Aponte a câmera do app do banco para o QR Code ou copie o código abaixo.
                    </div>
                  </div>
                  <div className="pay-code"><span>{cobranca.pix_copy_paste_code}</span></div>
                  <button type="button" className="btn btn-primary pay-big-btn" onClick={() => onCopy(cobranca.pix_copy_paste_code)}><Copy size={18} />Copiar código Pix</button>
                  <ol className="pay-steps-list"><li>Copie o código e abra o app do seu banco</li><li>Escolha Pix › Copia e cola e confirme</li><li>Volte aqui e toque em “Já paguei”</li></ol>
                </div>
              )}

              {method === 'link' && link && (
                <div className="pay-box">
                  <div style={{ fontSize: 14, color: 'var(--text-muted)', lineHeight: 1.55 }}>
                    {cobranca.pagamento_provedor === 'infinitepay'
                      ? <>Você vai para a página segura da InfinitePay e paga com Pix ou cartão. Quando o banco confirmar, a cobrança muda para <b style={{ color: 'var(--green)' }}>paga</b> sozinha.</>
                      : 'Você vai para a página de pagamento informada pelo condomínio. Depois de pagar, volte aqui e toque em “Já paguei”.'}
                  </div>
                  <a href={link} target="_blank" rel="noopener noreferrer" className="btn btn-primary pay-big-btn">Pagar {formatCurrency(cobranca.valor)} agora<ArrowUpRight size={18} /></a>
                </div>
              )}

              {method === 'boleto' && cobranca.boleto_download_url && (
                <div className="pay-box">
                  <div style={{ fontSize: 14, color: 'var(--text-muted)', lineHeight: 1.55 }}>A fatura em PDF traz o valor, o vencimento e os dados de pagamento do condomínio.</div>
                  <a href={cobranca.boleto_download_url} target="_blank" rel="noopener noreferrer" className="btn btn-primary pay-big-btn"><FileDown size={18} />Abrir PDF</a>
                </div>
              )}
            </>
          )}

          {canPay && methods.length === 0 && (
            <div className="pay-note tone-neutral">Nenhuma forma de pagamento foi anexada a esta cobrança. Fale com o síndico.</div>
          )}

          {canPay && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 4 }}>
              <button type="button" className="pay-informed" onClick={onInform} disabled={informing}><Send size={17} />{informing ? 'Enviando...' : 'Já paguei · avisar o síndico'}</button>
              <div style={{ fontSize: 12, color: 'var(--text-dim)', textAlign: 'center', lineHeight: 1.5 }}>
                {cobranca.pagamento_provedor === 'infinitepay' ? 'Pagando pelo banco, a baixa é automática. Pagou de outro jeito? Avise o síndico aqui.' : 'A baixa por Pix ou boleto é feita pelo síndico depois de conferir o extrato.'}
              </div>
            </div>
          )}

          {state === 'informed' && (
            <div className="pay-note tone-primary"><Hourglass size={20} /><div style={{ color: 'var(--text)' }}><b>Aguardando o síndico.</b> Você avisou o pagamento. Assim que ele conferir, a cobrança aparece como paga.</div></div>
          )}

          {state === 'paid' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div className="pay-note tone-green"><CircleCheck size={20} /><div style={{ color: 'var(--text)' }}><b>Pago em {formatDate(paidDate(cobranca))}</b>{cobranca.pagamento_provedor === 'infinitepay' && cobranca.pagamento_ref ? ' · confirmado pelo banco.' : ' · confirmado.'}</div></div>
              {cobranca.receipt_url && <a href={cobranca.receipt_url} target="_blank" rel="noopener noreferrer" className="btn btn-ghost pay-big-btn"><Receipt size={17} />Comprovante do banco</a>}
            </div>
          )}

          {(state === 'informed' || state === 'paid') && cobranca.boleto_download_url && (
            <a href={cobranca.boleto_download_url} target="_blank" rel="noopener noreferrer" className="btn btn-ghost pay-big-btn"><FileDown size={17} />Abrir fatura (PDF)</a>
          )}

          {cobranca.observacao && (
            <div style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6, paddingTop: 12, borderTop: '1px solid var(--line)' }}>{cobranca.observacao}</div>
          )}
        </div>
      </div>
    </div>
  )
}

export default function MoradorCobrancas({ isActive = true }) {
  const { profile, condominiumId } = useAuth()
  const { toast } = useToast()
  const [cobrancas, setCobrancas] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('todas')
  const [selected, setSelected] = useState(null)
  const [paymentRequests, setPaymentRequests] = useState([])
  const [sendingConfirmation, setSendingConfirmation] = useState(false)

  const fetchCobrancas = useCallback(async () => {
    if (!profile?.id) return

    setLoading(true)
    const [{ data }, { data: requestsData }] = await Promise.all([
      supabase
      .from('cobrancas')
      .select('*') // RLS: cobrancas da pessoa e das unidades dela
      .order('created_at', { ascending: false }),
      supabase
        .from('ocorrencias_predio')
        .select('*')
        .eq('created_by', profile.id)
        .order('created_at', { ascending: false }),
    ])

    // Links que viram botao (pagar, boleto, recibo) so passam se forem http(s).
    const enriched = (await enrichChargesWithPaymentUrls(data || [])).map((item) => ({
      ...item,
      pagamento_link: safeHttpUrl(item.pagamento_link),
      boleto_download_url: safeHttpUrl(item.boleto_download_url),
      receipt_url: safeHttpUrl(item.receipt_url),
    }))
    setCobrancas(enriched)
    // Voltou do boleto ou do app do banco (ou veio do "Pagar agora" do Inicio): a cobranca abre de novo.
    const reopenId = readLastView('morador-cobranca', profile.id)
    if (reopenId) setSelected((current) => current || enriched.find((item) => item.id === reopenId) || null)
    setPaymentRequests((requestsData || []).filter((item) => isResidentPaymentConfirmation(item) && isResidentRequestPending(item)))
    setLoading(false)
  }, [profile?.id])

  useEffect(() => {
    if (!profile?.id || !isActive) return
    void fetchCobrancas()
  }, [fetchCobrancas, profile?.id, isActive])

  useEffect(() => {
    if (profile?.id && !loading) saveLastView('morador-cobranca', profile.id, selected?.id || '')
  }, [selected?.id, profile?.id, loading])

  // Volta do pagamento online (InfinitePay): o endereco de retorno traz os codigos da transacao.
  // O servidor confere direto com o banco antes de dar baixa; a tela so repassa os codigos.
  useEffect(() => {
    if (!profile?.id) return
    const params = new URLSearchParams(window.location.search)
    const orderNsu = params.get('order_nsu')
    if (!orderNsu) return
    const retorno = {
      orderNsu,
      transactionNsu: params.get('transaction_nsu') || '',
      slug: params.get('slug') || '',
    }
    for (const key of ['order_nsu', 'transaction_nsu', 'slug', 'receipt_url', 'capture_method']) params.delete(key)
    const rest = params.toString()
    window.history.replaceState(window.history.state, '', `${window.location.pathname}${rest ? `?${rest}` : ''}`)

    void checkChargePayment(retorno)
      .then((result) => {
        if (result?.paid) toast('Pagamento confirmado pelo banco. A cobranca ja aparece como paga.', 'success')
        else toast('Ainda nao recebemos a confirmacao do banco. Ela aparece aqui assim que chegar.', 'info')
        return fetchCobrancas()
      })
      .catch(() => toast('Nao foi possivel conferir o pagamento agora. Ele aparece aqui assim que o banco confirmar.', 'info'))
  }, [profile?.id, fetchCobrancas, toast])

  const pendingChargeRequestIds = useMemo(() => {
    const ids = new Set()
    for (const request of paymentRequests) {
      const parsed = parseResidentRequest(request)
      if (parsed.chargeId) ids.add(parsed.chargeId)
    }
    return ids
  }, [paymentRequests])

  const stateOf = useCallback((cobranca) => {
    const status = getChargePaymentStatus(cobranca)
    if (status === 'PAID') return 'paid'
    if (status === 'CANCELLED') return 'cancelled'
    if (pendingChargeRequestIds.has(cobranca.id) || status === 'UNDER_REVIEW') return 'informed'
    if (status === 'OVERDUE') return 'late'
    return 'open'
  }, [pendingChargeRequestIds])

  const totals = useMemo(() => {
    const year = new Date().getFullYear()
    const open = cobrancas.filter((item) => ['open', 'late', 'informed'].includes(stateOf(item)))
    const paidThisYear = cobrancas.filter((item) => stateOf(item) === 'paid' && String(paidDate(item) || item.mes_referencia || '').startsWith(String(year)))
    const nextDue = open.map((item) => item.vencimento).filter(Boolean).sort()[0] || ''
    return {
      year,
      openValue: open.reduce((sum, item) => sum + Number(item.valor || 0), 0),
      openCount: open.length,
      nextDue,
      paidValue: paidThisYear.reduce((sum, item) => sum + Number(item.valor || 0), 0),
      paidCount: paidThisYear.length,
    }
  }, [cobrancas, stateOf])

  const groups = useMemo(() => {
    const visible = cobrancas.filter((cobranca) => {
      const state = stateOf(cobranca)
      if (filter === 'abertas') return state !== 'paid' && state !== 'cancelled'
      if (filter === 'pagas') return state === 'paid'
      return true
    })
    const map = new Map()
    for (const cobranca of visible) {
      const key = cobranca.mes_referencia || ''
      if (!map.has(key)) map.set(key, [])
      map.get(key).push(cobranca)
    }
    return Array.from(map.entries())
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([key, items]) => ({ key, label: key ? formatReferenceLong(key) : 'Sem competência', items }))
  }, [cobrancas, filter, stateOf])

  const copyPixCode = async (value) => {
    try {
      if (!navigator.clipboard?.writeText) {
        throw new Error('Clipboard indisponivel')
      }

      await navigator.clipboard.writeText(value)
      toast('Codigo Pix copiado.', 'success')
    } catch {
      toast('Nao foi possivel copiar o codigo Pix.', 'error')
    }
  }

  const sendPaymentConfirmation = async (charge) => {
    if (!charge?.id || !profile?.id) return
    if (pendingChargeRequestIds.has(charge.id)) {
      toast('Este pagamento ja esta aguardando a confirmacao do sindico.', 'info')
      return
    }

    setSendingConfirmation(true)
    const { error } = await supabase
      .from('ocorrencias_predio')
      .insert(withTenantFields({
        titulo: buildPaymentConfirmationTitle(charge.id),
        descricao: `O morador informou que realizou o pagamento da cobranca "${charge.descricao || charge.tipo}" referente a ${formatReferenceLabel(charge.mes_referencia)}. Verifique o comprovante e/ou o extrato do banco antes da baixa definitiva.`,
        categoria: 'geral',
        status: 'em_analise',
        apartamento: charge.unidade_numero || profile?.apartamento || '',
        created_by: profile.id,
      }, condominiumId))
    setSendingConfirmation(false)

    if (error) {
      toast('Nao foi possivel avisar o sindico sobre o pagamento.', 'error')
      return
    }

    toast('Avaliacao pendente: o sindico foi avisado e vai confirmar o pagamento.', 'info')
    await fetchCobrancas()
  }

  const access = describeResidentAccess(profile)

  return (
    <div className="fade-in screen">
      <div>
        <h1 className="screen-title">Minhas cobranças</h1>
        <div className="screen-sub">Histórico financeiro · {access.unitsLabel.toLowerCase()}</div>
      </div>

      <div className="totals">
        <div className="total-card total-card-hero">
          <span className="total-card-label"><Clock3 size={15} />Em aberto</span>
          <span className="total-card-value">{formatCurrency(totals.openValue)}</span>
          <span className="total-card-sub">{totals.openCount ? `${totals.openCount} ${totals.openCount === 1 ? 'cobrança' : 'cobranças'}${totals.nextDue ? ` · próxima vence ${shortDate(totals.nextDue)}` : ''}` : 'Nada em aberto. Tudo em dia!'}</span>
        </div>
        <div className="total-card">
          <span className="total-card-label"><CircleCheck size={15} color="var(--green)" />Pago em {totals.year}</span>
          <span className="total-card-value">{formatCurrency(totals.paidValue)}</span>
          <span className="total-card-sub">{totals.paidCount} {totals.paidCount === 1 ? 'cobrança quitada' : 'cobranças quitadas'}</span>
        </div>
      </div>

      <div className="seg" role="tablist" aria-label="Filtrar cobranças">
        {[['todas', 'Todas'], ['abertas', 'Em aberto'], ['pagas', 'Pagas']].map(([key, label]) => (
          <button key={key} type="button" role="tab" aria-selected={filter === key} className={filter === key ? 'active' : ''} onClick={() => setFilter(key)}>{label}</button>
        ))}
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><div className="spinner" /></div>
      ) : groups.length === 0 ? (
        <div className="empty-card">
          <CircleCheck size={36} color="var(--green)" />
          <span>{filter === 'todas' ? 'Nenhuma cobrança lançada para você ainda.' : filter === 'abertas' ? 'Nenhuma cobrança em aberto.' : 'Nenhuma cobrança paga ainda.'}</span>
        </div>
      ) : (
        groups.map((group) => (
          <div key={group.key || 'sem'} className="month-group">
            <div className="section-label">{group.label}</div>
            <div className="list-card">
              {group.items.map((cobranca) => {
                const state = stateOf(cobranca)
                const meta = STATE_META[state]
                const StateIcon = meta.Icon
                const TypeIcon = TIPOS_ICON[cobranca.tipo] || Receipt
                const isPaid = state === 'paid'
                return (
                  <button key={cobranca.id} type="button" className="list-row list-row-click my-charge-grid" onClick={() => setSelected(cobranca)}>
                    <span className="list-grow" style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                      <span className="list-icon"><TypeIcon size={19} /></span>
                      <span style={{ minWidth: 0 }}>
                        <span className="list-ellipsis" style={{ fontSize: 15, fontWeight: 600 }}>{chargeTitle(cobranca)}</span>
                        <span className="list-sub" style={{ fontSize: 13 }}>
                          <span className="list-only-m">{isPaid ? `Pago em ${formatDate(paidDate(cobranca))}` : `Vence ${formatDate(cobranca.vencimento)}`}</span>
                          <span className="list-hide-m">Ref. {formatReferenceLabel(cobranca.mes_referencia)}{cobranca.unidade_numero ? ` · Unidade ${cobranca.unidade_numero}` : ''}</span>
                        </span>
                      </span>
                    </span>
                    <span className="list-hide-m">
                      <span className="list-sub">{isPaid ? 'Pago em' : 'Vencimento'}</span>
                      <span style={{ fontVariantNumeric: 'tabular-nums' }}>{formatDate(isPaid ? paidDate(cobranca) : cobranca.vencimento)}</span>
                    </span>
                    <span className="list-hide-m" style={{ fontSize: 16, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{formatCurrency(cobranca.valor)}</span>
                    <span className="list-hide-m"><span className={`pill tone-${meta.tone}`}><StateIcon size={13} />{meta.label}</span></span>
                    <span className="list-hide-m list-actions">
                      {(state === 'open' || state === 'late') && <span className="mini-btn mini-btn-primary"><QrCode size={16} />Pagar</span>}
                      {state === 'paid' && <span className="mini-btn"><Receipt size={16} />Recibo</span>}
                      {state === 'informed' && <span className="mini-btn">Ver</span>}
                    </span>
                    <span className="list-only-m" style={{ marginLeft: 'auto', textAlign: 'right' }}>
                      <span style={{ display: 'block', fontSize: 15, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{formatCurrency(cobranca.valor)}</span>
                      <span className={`pill pill-sm tone-${meta.tone}`} style={{ marginTop: 4 }}>{meta.label}</span>
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        ))
      )}

      {selected && (
        <PaymentSheet
          key={selected.id}
          cobranca={selected}
          state={stateOf(selected)}
          onClose={() => setSelected(null)}
          onInform={() => sendPaymentConfirmation(selected)}
          informing={sendingConfirmation}
          onCopy={copyPixCode}
        />
      )}
    </div>
  )
}
