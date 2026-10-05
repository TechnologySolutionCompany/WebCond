import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useToast } from '../shared/Toast'
import { useAuth } from '../../hooks/useAuth'
import { useCondominiumSettings } from '../../hooks/useCondominiumSettings'
import WhatsAppIcon from '../shared/WhatsAppIcon'
import { Plus, Search, CheckCircle, X, Loader2, DollarSign, QrCode, Upload, Paperclip, Trash2, Mail, Eye, RefreshCcw, FileText, Link2, Check, ChevronLeft, ChevronRight, CircleCheck, Clock3, Hourglass, MessageCircle, TriangleAlert, Ban } from 'lucide-react'
import QRCode from 'qrcode'
import { formatCurrency, formatReferenceLabel, formatReferenceLong, parseCurrencyInput } from '../../lib/billingShared'
import { buildChargeStorageFileName, enrichChargesWithPaymentUrls } from '../../lib/charges'
import { applyTenantFilter, withTenantFields } from '../../lib/tenant'
import { getChargePaymentStatus, getChargePaymentStatusMeta, isChargePaid } from '../../lib/chargeStatus'
import { buildPaymentConfirmationTitle, buildResidentRequestSummary, isResidentPaymentConfirmation, isResidentRequestPending, parseResidentRequest } from '../../lib/residentRequests'
import { createChargePaymentLinks, notifyAvisos, renderBillingPdf } from '../../lib/adminApi'
import { montarPixCopiaECola } from '../../lib/pix'
import { profileHasResource } from '../../lib/condominiumPlan'
import { describeNotifyResult } from '../../lib/notifications'
import { compareUnitNumbers } from '../../lib/units'
import { safeHttpUrl } from '../../lib/safeUrl'

const FILTER_TYPES = [
  { value: 'condominio', label: 'Condomínio', color: 'blue' },
  { value: 'agua', label: 'Água', color: 'blue' },
  { value: 'energia', label: 'Energia', color: 'orange' },
  { value: 'multa', label: 'Multa', color: 'red' },
  { value: 'outro', label: 'Outro', color: 'purple' },
]

const CREATE_TYPES = [
  { value: 'condominio', label: 'Condomínio', color: 'blue' },
  { value: 'multa', label: 'Multa', color: 'red' },
  { value: 'outro', label: 'Outro', color: 'purple' },
]

const BREAKDOWN_TITLES = {
  condominio: 'Taxa Condominial',
  agua: 'Fatura Compesa',
  energia: 'Fatura Neoenergia',
}

// Situacao de cada cobranca na lista da competencia (redesign v2.10A3).
const CHARGE_STATE_META = {
  paid: { label: 'Paga', tone: 'green', Icon: CircleCheck },
  informed: { label: 'Informada', tone: 'primary', Icon: Hourglass },
  open: { label: 'Em aberto', tone: 'amber', Icon: Clock3 },
  late: { label: 'Atrasada', tone: 'red', Icon: TriangleAlert },
  cancelled: { label: 'Cancelada', tone: 'neutral', Icon: Ban },
}

const emptyForm = {
  chargeId: null,
  destinatario: 'all',
  unidade_id: '',
  tipo: 'condominio',
  descricao: '',
  valor: '',
  valor_condominio: '',
  valor_energia: '',
  valor_agua: '',
  mes_referencia: new Date().toISOString().slice(0, 7),
  vencimento: '',
  observacao: '',
  pagamento_link: '',
  qrcode_externo: '',
  pix_copy_paste_code: '',
}

// Pix "copia e cola" no padrao do Banco Central (v1.09A5). Antes era "PIX|chave|valor|ref",
// que nenhum app de banco le. Chave invalida = '' (a fatura mostra so a chave).
function buildPixPayload(valor, recipient, form, condominiumSettings) {
  return montarPixCopiaECola({
    chave: condominiumSettings.pixKey,
    valor,
    nome: condominiumSettings.name,
    cidade: condominiumSettings.city,
    txid: `${form.mes_referencia}${recipient.unidade_numero || ''}`,
    descricao: `Unidade ${recipient.unidade_numero || ''}`,
  })
}

function getTypeMeta(tipo) {
  return FILTER_TYPES.find((item) => item.value === tipo) || { label: tipo, color: 'blue' }
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(new Error('Nao foi possivel ler a imagem do QRCode.'))
    reader.readAsDataURL(file)
  })
}

function buildChargeDescription(form) {
  if (String(form.descricao || '').trim()) return String(form.descricao || '').trim()
  if (form.tipo === 'condominio') return `Taxas condominiais ${formatReferenceLabel(form.mes_referencia)}`
  if (form.tipo === 'multa') return `Multa ${formatReferenceLabel(form.mes_referencia)}`
  return `Cobranca avulsa ${formatReferenceLabel(form.mes_referencia)}`
}

function buildBreakdown(form) {
  if (form.tipo === 'condominio') {
    // titulo/tipo/origem: como cada linha aparece na fatura nova (v1.09A5).
    return [
      { leftTitle: BREAKDOWN_TITLES.condominio, middleTitle: 'Atualizações, reparos e manutenções das áreas comuns', value: parseCurrencyInput(form.valor_condominio), titulo: 'Taxa condominial', tipo: 'TAXA CONDOMINIAL', origem: 'Rateio fixo' },
      { leftTitle: BREAKDOWN_TITLES.agua, middleTitle: 'Uso da água distribuída para todo condomínio', value: parseCurrencyInput(form.valor_agua), titulo: 'Água do condomínio', tipo: 'RATEIO', origem: 'Fatura Compesa' },
      { leftTitle: BREAKDOWN_TITLES.energia, middleTitle: 'Uso da conta de energia de áreas comuns', value: parseCurrencyInput(form.valor_energia), titulo: 'Energia das áreas comuns', tipo: 'RATEIO', origem: 'Fatura Neoenergia' },
    ]
  }

  return [{
    leftTitle: form.tipo === 'multa' ? 'Multa' : 'Outro',
    middleTitle: buildChargeDescription(form),
    value: parseCurrencyInput(form.valor),
    titulo: form.tipo === 'multa' ? 'Multa' : 'Cobranca avulsa',
    tipo: form.tipo === 'multa' ? 'MULTA' : 'AVULSA',
    origem: '',
  }]
}

function buildObservation(form, breakdown) {
  const parts = breakdown.map((item) => `${item.leftTitle}: ${formatCurrency(item.value)}`)
  const extra = String(form.observacao || '').trim()
  return extra ? `${parts.join(' | ')} | Obs: ${extra}` : parts.join(' | ')
}

// Relancar: recupera os valores da observacao gravada ("Taxa Condominial: R$ 100,00 | ... | Obs: texto").
function parseStoredObservation(observacao = '') {
  const result = { valor_condominio: '', valor_agua: '', valor_energia: '', observacao: '' }
  for (const part of String(observacao || '').split(' | ')) {
    const [label, ...rest] = part.split(': ')
    const value = rest.join(': ')
    const amount = value.replace(/[^\d,.-]/g, '').trim()
    if (label === BREAKDOWN_TITLES.condominio) result.valor_condominio = amount
    else if (label === BREAKDOWN_TITLES.agua) result.valor_agua = amount
    else if (label === BREAKDOWN_TITLES.energia) result.valor_energia = amount
    else if (label === 'Obs') result.observacao = value
  }
  return result
}

function shouldUseLegacyPdfFallback(error) {
  return Boolean(error) && (error.code === 'PDF_RENDER_UNAVAILABLE' || error.status === 500 || error.status === 503)
}

function normalizeWhatsappForUrl(value = '') {
  const digits = String(value || '').replace(/\D/g, '')
  if (!digits) return ''
  return digits.startsWith('55') && digits.length >= 12 ? digits : `55${digits}`
}

function isRealEmail(email = '') {
  return Boolean(email) && !String(email).endsWith('@login.webcond.local')
}

function formatDueDate(value) {
  return value ? new Date(`${value}T12:00:00`).toLocaleDateString('pt-BR') : '-'
}

function getChargeUnit(charge) {
  return charge.unidade_numero || charge.profiles?.apartamento || '-'
}

function buildChargeMessage(charge, condominiumSettings, { resend = false } = {}) {
  const residentName = String(charge.profiles?.nome || 'morador').trim()
  const pixKey = String(condominiumSettings.pixKey || charge.pix_copy_paste_code || '').trim() || 'Chave Pix nao informada'
  const boletoLink = String(charge.boleto_download_url || charge.boleto_url || '').trim()
  const intro = resend
    ? `Olá, ${residentName}. A cobrança da unidade ${getChargeUnit(charge)} referente a ${formatReferenceLabel(charge.mes_referencia)} foi atualizada.`
    : `Olá, ${residentName}. Ainda não foi identificado o pagamento da unidade ${getChargeUnit(charge)} (${formatReferenceLabel(charge.mes_referencia)}). Caso já tenha pago, encaminhe o comprovante para atualização no sistema.`

  return [
    intro,
    '',
    `Vencimento: ${formatDueDate(charge.vencimento)}`,
    `Valor total: ${formatCurrency(charge.valor)}`,
    '',
    `Chave Pix do condomínio: ${pixKey}`,
    boletoLink ? `Boleto (PDF): ${boletoLink}` : null,
    '',
    'Esta é uma mensagem automática.',
  ].filter((line) => line !== null).join('\n')
}

async function generateChargePdfBytes({ condominiumSettings, recipient, form, total, pixQrCode, pixCopyPasteCode, paymentLink, breakdown }) {
  const payload = {
    // Modelo novo da fatura (fatura-template.html). Se o servidor do PDF falhar, cai no modelo antigo abaixo.
    modelo: 'fatura',
    unidade: recipient.unidade_numero || '',
    nomeMorador: recipient.nome,
    apartamento: recipient.unidade_numero || '-',
    numero: recipient.whatsapp || condominiumSettings.whatsappLabel,
    observacoes: String(form.observacao || '').trim() || 'N/A',
    valorTotal: total,
    mesReferencia: form.mes_referencia,
    dataVencimento: form.vencimento,
    itens: breakdown.map((item) => ({ nome: item.leftTitle, titulo: item.titulo, descricao: item.middleTitle, tipo: item.tipo, origem: item.origem, valor: item.value })),
    qrcode_pix: pixQrCode,
    pixCopiaCola: pixCopyPasteCode,
    linkPagamento: paymentLink,
  }

  try {
    return await renderBillingPdf(payload)
  } catch (error) {
    if (!shouldUseLegacyPdfFallback(error)) throw error

    const { generateChargesPdf } = await import('../../lib/billingPdf')
    return generateChargesPdf({
      condominium: condominiumSettings,
      charges: [{
        nome: recipient.nome,
        apartamento: recipient.unidade_numero || '-',
        whatsapp: recipient.whatsapp || condominiumSettings.whatsappLabel,
        observacao: String(form.observacao || '').trim() || 'N/A',
        reference: form.mes_referencia,
        vencimento: form.vencimento,
        total,
        qrCodeDataUrl: pixQrCode.startsWith('data:image/') ? pixQrCode : '',
        breakdown,
      }],
    })
  }
}

function buildNotificationRows(recipients, profileId, referenceLabel, condominiumId, { resend = false } = {}) {
  return recipients.map((recipient) => ({
    titulo: resend ? 'Cobranca atualizada' : 'Nova cobranca disponivel',
    conteudo: resend
      ? `A cobranca da unidade ${recipient.unidade_numero} (${referenceLabel}) foi atualizada. Abra "Minhas cobrancas" para ver o novo boleto.`
      : `Uma nova cobranca foi lancada para a unidade ${recipient.unidade_numero} (${referenceLabel}). Abra "Minhas cobrancas" para acessar o boleto e os dados de pagamento.`,
    tipo: 'informativo',
    destinatario: 'apartamento',
    apartamento_destino: recipient.unidade_numero,
    created_by: profileId,
    condominium_id: condominiumId || null,
    condominio_id: condominiumId || null,
  }))
}

// Quem recebe a cobranca de cada unidade: o responsavel financeiro definido na unidade.
function buildRecipients(units, links) {
  const people = new Map()
  for (const link of links) {
    if (!link.profiles || link.profiles.ativo === false) continue
    if (!people.has(link.unidade_id)) people.set(link.unidade_id, {})
    people.get(link.unidade_id)[link.vinculo] = link.profiles
  }

  return units
    .map((unit) => {
      const entry = people.get(unit.id) || {}
      const responsible = unit.responsavel_financeiro === 'inquilino' && entry.inquilino ? entry.inquilino : entry.proprietario || entry.inquilino
      return responsible
        ? { ...responsible, unidade_id: unit.id, unidade_numero: unit.numero, papel: responsible === entry.inquilino ? 'Inquilino' : 'Proprietario' }
        : null
    })
    .filter(Boolean)
    .sort((a, b) => compareUnitNumbers(a.unidade_numero, b.unidade_numero))
}

export default function Cobrancas() {
  const [cobrancas, setCobrancas] = useState([])
  const [units, setUnits] = useState([])
  const [links, setLinks] = useState([])
  const [loading, setLoading] = useState(true)
  const [openReference, setOpenReference] = useState(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('todas')
  const [viewCharge, setViewCharge] = useState(null)
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [paymentFile, setPaymentFile] = useState(null)
  const [pixQrImageData, setPixQrImageData] = useState('')
  const [pixQrImageName, setPixQrImageName] = useState('')
  const [saving, setSaving] = useState(false)
  const [residentRequests, setResidentRequests] = useState([])
  const { profile, condominiumId } = useAuth()
  const { settings: condominiumSettings } = useCondominiumSettings(condominiumId)
  const pixAutomatico = profileHasResource(profile, 'pixAutomatico')
  const { toast } = useToast()

  const fetchAll = useCallback(async () => {
    setLoading(true)
    const [cobRes, unitsRes, linksRes, requestsRes] = await Promise.all([
      applyTenantFilter(
        supabase.from('cobrancas').select('*, profiles:morador_id(nome, apartamento, whatsapp, email)').order('created_at', { ascending: false }),
        condominiumId,
      ),
      supabase.from('unidades').select('id, numero, situacao, responsavel_financeiro').eq('condominium_id', condominiumId),
      supabase.from('unidade_vinculos').select('unidade_id, vinculo, profiles(id, nome, whatsapp, email, ativo)'),
      applyTenantFilter(supabase.from('ocorrencias_predio').select('*').order('created_at', { ascending: false }), condominiumId),
    ])

    // Links que viram botao (boleto, anexo, pagamento) so passam se forem http(s).
    setCobrancas((await enrichChargesWithPaymentUrls(cobRes.data || [])).map((item) => ({
      ...item,
      boleto_download_url: safeHttpUrl(item.boleto_download_url),
      boleto_url: safeHttpUrl(item.boleto_url),
      pagamento_anexo_download_url: safeHttpUrl(item.pagamento_anexo_download_url),
      pagamento_anexo_url: safeHttpUrl(item.pagamento_anexo_url),
      pagamento_link: safeHttpUrl(item.pagamento_link),
    })))
    setUnits((unitsRes.data || []).sort((a, b) => compareUnitNumbers(a.numero, b.numero)))
    setLinks(linksRes.data || [])
    setResidentRequests(requestsRes.data || [])
    setLoading(false)
  }, [condominiumId])

  useEffect(() => {
    void fetchAll()
  }, [fetchAll])

  const recipients = useMemo(() => buildRecipients(units, links), [units, links])

  const pendingPaymentByChargeId = useMemo(() => new Map(
    residentRequests
      .filter((item) => isResidentPaymentConfirmation(item) && isResidentRequestPending(item))
      .map((item) => [parseResidentRequest(item).chargeId, item]),
  ), [residentRequests])

  const references = useMemo(() => {
    const groups = new Map()
    for (const charge of cobrancas) {
      const key = charge.mes_referencia || 'sem-referencia'
      if (!groups.has(key)) groups.set(key, { key, charges: [], total: 0, received: 0, open: 0, overdue: 0 })
      const group = groups.get(key)
      group.charges.push(charge)
      group.total += Number(charge.valor || 0)
      const status = getChargePaymentStatus(charge)
      if (status === 'PAID') group.received += Number(charge.valor || 0)
      else if (status === 'OVERDUE') group.overdue += 1
      else if (status !== 'CANCELLED') group.open += 1
    }
    return Array.from(groups.values()).sort((a, b) => b.key.localeCompare(a.key))
  }, [cobrancas])

  // Competencia na tela: a escolhida, ou a mais recente. As setas andam pela lista (mais nova = indice 0).
  const activeIndex = Math.max(0, references.findIndex((group) => group.key === openReference))
  const activeReference = references[activeIndex] || null
  const goToReference = (index) => {
    const target = references[index]
    if (!target) return
    setOpenReference(target.key)
    setStatusFilter('todas')
  }

  const chargeState = useCallback((charge) => {
    const status = getChargePaymentStatus(charge)
    if (status === 'PAID') return 'paid'
    if (status === 'CANCELLED') return 'cancelled'
    if (pendingPaymentByChargeId.has(charge.id) || status === 'UNDER_REVIEW') return 'informed'
    if (status === 'OVERDUE') return 'late'
    return 'open'
  }, [pendingPaymentByChargeId])

  const summary = useMemo(() => {
    const result = { counts: { paid: 0, informed: 0, open: 0, late: 0, cancelled: 0 }, paidValue: 0, informedValue: 0, cancelledValue: 0 }
    for (const charge of activeReference?.charges || []) {
      const state = chargeState(charge)
      result.counts[state] += 1
      if (state === 'paid') result.paidValue += Number(charge.valor || 0)
      if (state === 'informed') result.informedValue += Number(charge.valor || 0)
      if (state === 'cancelled') result.cancelledValue += Number(charge.valor || 0)
    }
    return result
  }, [activeReference, chargeState])

  const percentOf = (value) => (activeReference?.total ? Math.min(100, (value / activeReference.total) * 100) : 0)

  // "Em atraso (meses anteriores)": o que ficou sem pagar nas competencias mais antigas.
  const lateBefore = useMemo(() => cobrancas
    .filter((charge) => activeReference && (charge.mes_referencia || 'sem-referencia') < activeReference.key && chargeState(charge) === 'late')
    .reduce((sum, charge) => sum + Number(charge.valor || 0), 0), [cobrancas, activeReference, chargeState])

  const firstDue = (activeReference?.charges || []).map((charge) => charge.vencimento).filter(Boolean).sort()[0] || ''

  const visibleCharges = useMemo(() => {
    if (!activeReference) return []
    const query = search.trim().toLowerCase()
    return activeReference.charges
      .filter((charge) => statusFilter === 'todas' || chargeState(charge) === statusFilter)
      .filter((charge) => !query || getChargeUnit(charge).toLowerCase().includes(query) || String(charge.profiles?.nome || '').toLowerCase().includes(query))
      .sort((a, b) => compareUnitNumbers(getChargeUnit(a), getChargeUnit(b)))
  }, [activeReference, search, statusFilter, chargeState])

  const resetForm = () => {
    setShowModal(false)
    setForm(emptyForm)
    setPaymentFile(null)
    setPixQrImageData('')
    setPixQrImageName('')
  }

  const openNewCharge = () => {
    setForm({ ...emptyForm, mes_referencia: openReference && openReference !== 'sem-referencia' ? openReference : emptyForm.mes_referencia })
    setShowModal(true)
  }

  // Relancar = editar a cobranca e envia-la de novo ao responsavel financeiro atual da unidade.
  const openRelaunch = (charge) => {
    const stored = parseStoredObservation(charge.observacao)
    setForm({
      ...emptyForm,
      chargeId: charge.id,
      destinatario: 'single',
      unidade_id: charge.unidade_id || recipients.find((item) => item.unidade_numero === getChargeUnit(charge))?.unidade_id || '',
      tipo: CREATE_TYPES.some((item) => item.value === charge.tipo) ? charge.tipo : 'outro',
      descricao: charge.descricao || '',
      valor: charge.tipo === 'condominio' ? '' : String(charge.valor || '').replace('.', ','),
      valor_condominio: stored.valor_condominio,
      valor_agua: stored.valor_agua,
      valor_energia: stored.valor_energia,
      mes_referencia: charge.mes_referencia || emptyForm.mes_referencia,
      vencimento: charge.vencimento || '',
      observacao: stored.observacao,
      // Link da InfinitePay tem o valor antigo: no relancamento, o servidor gera outro.
      pagamento_link: charge.pagamento_provedor === 'infinitepay' ? '' : charge.pagamento_link || '',
      pix_copy_paste_code: '',
      previousBoletoPath: charge.boleto_path || '',
    })
    setShowModal(true)
  }

  const sendWhatsApp = (charge, options) => {
    const whatsapp = normalizeWhatsappForUrl(charge.profiles?.whatsapp)
    if (!whatsapp) {
      toast('O responsavel financeiro desta unidade nao tem WhatsApp cadastrado.', 'error')
      return
    }
    window.open(`https://wa.me/${whatsapp}?text=${encodeURIComponent(buildChargeMessage(charge, condominiumSettings, options))}`, '_blank', 'noopener,noreferrer')
  }

  const sendEmail = (charge, options) => {
    const email = charge.profiles?.email
    if (!isRealEmail(email)) {
      toast('O responsavel financeiro desta unidade nao tem e-mail cadastrado.', 'error')
      return
    }
    const subject = `${condominiumSettings.name || 'Condominio'} - Cobranca unidade ${getChargeUnit(charge)} (${formatReferenceLabel(charge.mes_referencia)})`
    window.location.href = `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(buildChargeMessage(charge, condominiumSettings, options))}`
  }

  const handleSave = async () => {
    const isRelaunch = Boolean(form.chargeId)
    const breakdown = buildBreakdown(form)
    const total = breakdown.reduce((sum, item) => sum + Number(item.value || 0), 0)

    if (form.destinatario === 'single' && !form.unidade_id) {
      toast('Selecione a unidade ou escolha enviar para todas.', 'error')
      return
    }
    if (!form.vencimento) {
      toast('Informe a data de vencimento.', 'error')
      return
    }
    if (String(form.pagamento_link || '').trim() && !safeHttpUrl(form.pagamento_link)) {
      toast('O link de pagamento precisa ser um endereco que comeca com https://', 'error')
      return
    }
    if (form.tipo === 'condominio' ? !breakdown.some((item) => item.value > 0) : parseCurrencyInput(form.valor) <= 0) {
      toast(form.tipo === 'condominio' ? 'Informe ao menos um valor para as taxas de condominio.' : 'Informe um valor valido para a cobranca.', 'error')
      return
    }

    const selected = form.destinatario === 'all' ? recipients : recipients.filter((item) => item.unidade_id === form.unidade_id)
    if (selected.length === 0) {
      toast('Nenhuma unidade com responsavel financeiro cadastrado para receber a cobranca.', 'error')
      return
    }

    setSaving(true)
    const uploadedPaths = []

    try {
      const descricao = buildChargeDescription(form)
      const observacao = buildObservation(form, breakdown)
      const referenceLabel = formatReferenceLabel(form.mes_referencia)
      const uploadedQrCode = String(pixQrImageData || '').trim()
      const externalQrCode = String(form.qrcode_externo || '').trim()
      const manualPixCopyPasteCode = String(form.pix_copy_paste_code || '').trim()
      const paymentLink = String(form.pagamento_link || '').trim()

      let pagamentoAnexoPath = ''
      if (paymentFile) {
        pagamentoAnexoPath = buildChargeStorageFileName(paymentFile.name, 'pagamentos', condominiumId)
        const { error: paymentUploadError } = await supabase.storage.from('cobrancas').upload(pagamentoAnexoPath, paymentFile)
        if (paymentUploadError) throw paymentUploadError
        uploadedPaths.push(pagamentoAnexoPath)
      }

      const rows = []
      for (const recipient of selected) {
        // Pix gerado sozinho: Plano PRO (v2.10A1). No ONE vale o codigo colado ou a imagem enviada.
        const pixCopyPasteCode = manualPixCopyPasteCode || (pixAutomatico ? buildPixPayload(total, recipient, form, condominiumSettings) : '')
        let pixQrCode = uploadedQrCode || externalQrCode
        if (!pixQrCode && pixCopyPasteCode) {
          pixQrCode = await QRCode.toDataURL(pixCopyPasteCode)
        }

        const pdfBytes = await generateChargePdfBytes({ condominiumSettings, recipient, form, total, pixQrCode, pixCopyPasteCode, paymentLink, breakdown })
        const boletoPath = buildChargeStorageFileName(`boleto-${recipient.unidade_numero || 'unidade'}-${form.mes_referencia}.pdf`, 'boletos', condominiumId)
        const { error: boletoUploadError } = await supabase.storage.from('cobrancas').upload(boletoPath, new Blob([pdfBytes], { type: 'application/pdf' }), { contentType: 'application/pdf' })
        if (boletoUploadError) throw boletoUploadError
        uploadedPaths.push(boletoPath)

        const row = {
          morador_id: recipient.id,
          unidade_id: recipient.unidade_id,
          unidade_numero: recipient.unidade_numero,
          descricao,
          valor: total,
          tipo: form.tipo,
          mes_referencia: form.mes_referencia,
          vencimento: form.vencimento,
          observacao,
          pix_qr_code: pixQrCode,
          pix_qrcode_url: pixQrCode.startsWith('data:image/') ? pixQrCode : '',
          pix_copy_paste_code: pixCopyPasteCode,
          pix_link: '',
          pagamento_link: paymentLink,
          boleto_path: boletoPath,
          payment_status: 'PENDING',
          pago: false,
          data_pagamento: null,
          paid_at: null,
          confirmed_by: null,
          receipt_url: '',
        }
        if (pagamentoAnexoPath || !isRelaunch) row.pagamento_anexo_path = pagamentoAnexoPath
        rows.push(isRelaunch ? row : withTenantFields({ ...row, created_by: profile.id }, condominiumId))
      }

      let savedChargeIds = []
      if (isRelaunch) {
        const { error } = await supabase.from('cobrancas').update(rows[0]).eq('id', form.chargeId)
        if (error) throw error
        if (form.previousBoletoPath) await supabase.storage.from('cobrancas').remove([form.previousBoletoPath])
        savedChargeIds = [form.chargeId]
      } else {
        const { data: inserted, error } = await supabase.from('cobrancas').insert(rows).select('id')
        if (error) throw error
        savedChargeIds = (inserted || []).map((row) => row.id)
      }

      // Banco com API (InfinitePay): cada cobranca ganha o link "Pagar agora", com baixa automatica.
      // Pix direto: o servidor responde sem fazer nada. Falha aqui nao desfaz a cobranca.
      if (!paymentLink) {
        void createChargePaymentLinks(savedChargeIds)
          .then((result) => {
            if (result?.provedor === 'infinitepay' && result.falhas) toast(`${result.falhas} link(s) de pagamento da InfinitePay nao foram gerados. Confira a InfiniteTag em Meu perfil > Recebimento.`, 'error')
            if (result?.criados) void fetchAll()
          })
          .catch(() => toast('Cobranca salva, mas o link de pagamento do banco nao foi gerado.', 'info'))
      }

      const { data: createdNotices, error: avisoError } = await supabase
        .from('avisos')
        .insert(buildNotificationRows(selected, profile.id, referenceLabel, condominiumId, { resend: isRelaunch }))
        .select('id')
      if (avisoError) toast('Cobranca salva, mas houve falha ao criar o aviso automatico.', 'info')

      toast(
        isRelaunch
          ? `Cobranca da unidade ${selected[0].unidade_numero} relancada. Envie a mensagem ao responsavel pelos botoes WhatsApp ou E-mail.`
          : `Cobranca lancada para ${selected.length} unidade(s).`,
        'success',
      )
      setOpenReference(form.mes_referencia)
      resetForm()
      void fetchAll()

      // Celular, e-mail e WhatsApp de quem recebeu a cobranca (a cobranca ja esta salva).
      if (createdNotices?.length) {
        void notifyAvisos(createdNotices.map((row) => row.id))
          .then((result) => { const summary = describeNotifyResult(result); if (summary) toast(summary, 'info') })
          .catch(() => toast('Cobranca lancada, mas o envio das notificacoes falhou. O morador ve a cobranca ao abrir o app.', 'info'))
      }
    } catch (error) {
      if (uploadedPaths.length > 0) await supabase.storage.from('cobrancas').remove(uploadedPaths)
      toast(error.message || 'Erro ao lancar cobranca.', 'error')
    } finally {
      setSaving(false)
    }
  }

  const marcarPago = async (charge) => {
    const pendingRequest = pendingPaymentByChargeId.get(charge.id)
    if (pendingRequest && !window.confirm('O morador informou que ja realizou o pagamento. Verifique o comprovante e/ou o extrato do banco antes da baixa definitiva. Deseja confirmar o pagamento agora?')) return

    const { error } = await supabase.from('cobrancas').update({
      pago: true,
      data_pagamento: new Date().toISOString().slice(0, 10),
      payment_status: 'PAID',
      paid_at: new Date().toISOString(),
      confirmed_by: profile.id,
    }).eq('id', charge.id)

    if (error) {
      toast('Erro ao atualizar cobranca.', 'error')
      return
    }

    if (pendingRequest) {
      await supabase.from('ocorrencias_predio').update({ status: 'resolvido', updated_at: new Date().toISOString() }).eq('id', pendingRequest.id)
    }

    toast('Pagamento confirmado!', 'success')
    void fetchAll()
  }

  const excluirCobranca = async (charge) => {
    if (!window.confirm(`Excluir a cobranca da unidade ${getChargeUnit(charge)} (${formatReferenceLabel(charge.mes_referencia)})?`)) return

    const filesToRemove = [charge.pagamento_anexo_path, charge.boleto_path].filter(Boolean)
    if (filesToRemove.length > 0) await supabase.storage.from('cobrancas').remove(filesToRemove)

    const { error } = await supabase.from('cobrancas').delete().eq('id', charge.id)
    if (error) {
      toast('Nao foi possivel excluir a cobranca.', 'error')
      return
    }

    // Sem a cobranca, a confirmacao de pagamento do morador perde o sentido: se ficar,
    // vira uma notificacao presa no painel apontando para algo que nao existe mais.
    await supabase.from('ocorrencias_predio').delete().eq('titulo', buildPaymentConfirmationTitle(charge.id))

    toast('Cobranca excluida.', 'success')
    setViewCharge(null)
    void fetchAll()
  }

  const isCondominio = form.tipo === 'condominio'
  const previewTotal = buildBreakdown(form).reduce((sum, item) => sum + Number(item.value || 0), 0)
  const unitsWithoutResponsible = units.length - recipients.length

  return (
    <div className="fade-in">
      <div className="screen">
        <div className="screen-head">
          <div>
            <h1 className="screen-title">Cobranças</h1>
            <div className="screen-sub">Por competência. Cada cobrança vai para o responsável financeiro da unidade.</div>
          </div>
          <div className="screen-actions">
            <button className="btn btn-primary" onClick={openNewCharge}>
              <Plus size={17} /> Lançar cobranças
            </button>
          </div>
        </div>

        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><div className="spinner" /></div>
        ) : !activeReference ? (
          <div className="empty-card"><DollarSign size={36} /><span>Nenhuma cobrança lançada ainda. Toque em "Lançar cobranças".</span></div>
        ) : (
          <>
            <div className="month-card">
              <div className="month-nav">
                <button type="button" className="month-nav-btn" onClick={() => goToReference(activeIndex + 1)} disabled={activeIndex >= references.length - 1} aria-label="Competência anterior"><ChevronLeft size={18} /></button>
                <div className="month-nav-title">
                  <strong>{activeReference.key === 'sem-referencia' ? 'Sem competência' : formatReferenceLong(activeReference.key)}</strong>
                  <span>{firstDue ? `Vencimento ${formatDueDate(firstDue)} · ` : ''}{activeReference.charges.length} {activeReference.charges.length === 1 ? 'cobrança lançada' : 'cobranças lançadas'}</span>
                </div>
                <button type="button" className="month-nav-btn" onClick={() => goToReference(activeIndex - 1)} disabled={activeIndex <= 0} aria-label="Próxima competência"><ChevronRight size={18} /></button>
              </div>
              <div className="month-bar">
                <div style={{ width: `${percentOf(summary.paidValue)}%`, background: 'var(--green-solid)' }} />
                <div style={{ width: `${percentOf(summary.informedValue)}%`, background: 'var(--primary)' }} />
              </div>
              <div className="month-stats">
                <div><span>Lançado</span><strong>{formatCurrency(activeReference.total)}</strong></div>
                <div><span>Recebido · {Math.round(percentOf(summary.paidValue))}%</span><strong style={{ color: 'var(--green)' }}>{formatCurrency(summary.paidValue)}</strong></div>
                <div><span>A receber</span><strong style={{ color: 'var(--orange)' }}>{formatCurrency(activeReference.total - summary.paidValue - summary.cancelledValue)}</strong></div>
                <div><span>Em atraso (meses anteriores)</span><strong style={{ color: 'var(--red)' }}>{formatCurrency(lateBefore)}</strong></div>
              </div>
            </div>

            <div className="toolbar">
              <label className="search-box">
                <Search size={18} />
                <input className="input" placeholder="Buscar unidade ou responsável" value={search} onChange={(event) => setSearch(event.target.value)} aria-label="Buscar cobrança" />
              </label>
            </div>

            <div className="chips" role="group" aria-label="Filtrar cobranças">
              {[
                ['todas', `Todas · ${activeReference.charges.length}`],
                ['informed', `Informadas · ${summary.counts.informed}`],
                ['open', `Em aberto · ${summary.counts.open}`],
                ['paid', `Pagas · ${summary.counts.paid}`],
                ['late', `Atrasadas · ${summary.counts.late}`],
              ].map(([value, label]) => (
                <button key={value} type="button" className={`chip${statusFilter === value ? ' active' : ''}`} onClick={() => setStatusFilter(value)}>{label}</button>
              ))}
            </div>

            {visibleCharges.length === 0 ? (
              <div className="empty-card"><CheckCircle size={32} /><span>Nenhuma cobrança neste filtro.</span></div>
            ) : (
              <div className="list-card">
                <div className="list-head charge-list-grid"><span>Unid.</span><span>Responsável</span><span>Cobrança</span><span>Valor</span><span>Status</span><span style={{ textAlign: 'right' }}>Ação</span></div>
                {visibleCharges.map((charge) => {
                  const state = chargeState(charge)
                  const meta = CHARGE_STATE_META[state]
                  const StateIcon = meta.Icon
                  return (
                    <div key={charge.id} className="list-row list-row-click charge-list-grid" role="button" tabIndex={0} aria-label={`Abrir cobrança da unidade ${getChargeUnit(charge)}`} onClick={() => setViewCharge(charge)} onKeyDown={(event) => { if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); setViewCharge(charge) } }}>
                      <span className="unit-tag">{getChargeUnit(charge)}</span>
                      <span className="list-grow" style={{ minWidth: 0 }}>
                        <span className="list-ellipsis">{charge.profiles?.nome || '-'}</span>
                        <span className="list-sub list-ellipsis">{getTypeMeta(charge.tipo).label}<span className="list-only-m"> · {formatCurrency(charge.valor)}</span></span>
                        <span className="list-only-m" style={{ marginTop: 4 }}><span className={`pill pill-sm tone-${meta.tone}`}>{meta.label}</span></span>
                      </span>
                      <span className="list-hide-m" style={{ minWidth: 0 }}>
                        <span className="list-ellipsis">{charge.descricao || '-'}</span>
                        <span className="list-sub">Vence {formatDueDate(charge.vencimento)}</span>
                      </span>
                      <span className="list-hide-m" style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{formatCurrency(charge.valor)}</span>
                      <span className="list-hide-m"><span className={`pill tone-${meta.tone}`}><StateIcon size={13} />{meta.label}</span></span>
                      <span className="list-actions" onClick={(event) => event.stopPropagation()}>
                        {state === 'informed' && (
                          <button type="button" className="mini-btn mini-btn-primary" onClick={() => marcarPago(charge)}><Check size={15} />Confirmar</button>
                        )}
                        {(state === 'open' || state === 'late') && (
                          <button type="button" className="mini-btn" onClick={() => sendWhatsApp(charge)} title="Lembrar pelo WhatsApp" aria-label="Lembrar pelo WhatsApp"><MessageCircle size={15} /><span className="list-hide-m">Lembrar</span></button>
                        )}
                        {state === 'paid' && (
                          <span className="list-sub" style={{ fontSize: 13 }}>{charge.data_pagamento ? `em ${formatDueDate(charge.data_pagamento)}` : 'pago'}</span>
                        )}
                        <button type="button" className="mini-btn mini-btn-icon list-hide-m" onClick={() => setViewCharge(charge)} title="Abrir cobrança" aria-label={`Abrir cobrança da unidade ${getChargeUnit(charge)}`}><Eye size={15} /></button>
                      </span>
                    </div>
                  )
                })}
              </div>
            )}
          </>
        )}
      </div>

      {viewCharge && (
        <div className="modal-overlay" style={{ zIndex: 110 }} onClick={(event) => event.target === event.currentTarget && setViewCharge(null)}>
          <div className="modal" role="dialog" aria-modal="true">
            <div className="modal-header">
              <div className="modal-title">Unidade {getChargeUnit(viewCharge)} · {formatReferenceLabel(viewCharge.mes_referencia)}</div>
              <button className="btn btn-ghost btn-icon" onClick={() => setViewCharge(null)} aria-label="Fechar"><X size={16} /></button>
            </div>
            <div className="charge-detail-grid">
              <div><div className="form-label">Responsavel financeiro</div><div className="charge-detail-value">{viewCharge.profiles?.nome || '-'}</div></div>
              <div><div className="form-label">Status</div><span className={`pill tone-${CHARGE_STATE_META[chargeState(viewCharge)].tone}`}>{CHARGE_STATE_META[chargeState(viewCharge)].label}</span></div>
              <div><div className="form-label">Descricao</div><div className="charge-detail-value">{viewCharge.descricao || '-'}</div></div>
              <div><div className="form-label">Valor</div><div className="charge-detail-value">{formatCurrency(viewCharge.valor)}</div></div>
              <div><div className="form-label">Vencimento</div><div className="charge-detail-value">{formatDueDate(viewCharge.vencimento)}</div></div>
              <div><div className="form-label">Pago em</div><div className="charge-detail-value">{viewCharge.data_pagamento ? formatDueDate(viewCharge.data_pagamento) : '-'}</div></div>
            </div>
            {viewCharge.observacao && <div className="charge-detail-note" style={{ marginTop: 14, fontSize: 13 }}>{viewCharge.observacao}</div>}
            <div className="charge-actions">
              {(viewCharge.boleto_download_url || viewCharge.boleto_url) && (
                <a className="btn btn-ghost btn-sm" href={viewCharge.boleto_download_url || viewCharge.boleto_url} target="_blank" rel="noopener noreferrer"><FileText size={13} /> Abrir boleto</a>
              )}
              {(viewCharge.pagamento_anexo_download_url || viewCharge.pagamento_anexo_url) && (
                <a className="btn btn-ghost btn-sm" href={viewCharge.pagamento_anexo_download_url || viewCharge.pagamento_anexo_url} target="_blank" rel="noopener noreferrer"><Paperclip size={13} /> Anexo</a>
              )}
              {viewCharge.pagamento_link && (
                <a className="btn btn-ghost btn-sm" href={viewCharge.pagamento_link} target="_blank" rel="noopener noreferrer"><Link2 size={13} /> Link de pagamento</a>
              )}
              {!isChargePaid(viewCharge) && (
                <>
                  <button className="btn btn-ghost btn-sm" onClick={() => sendWhatsApp(viewCharge)}><WhatsAppIcon size={14} /> WhatsApp</button>
                  <button className="btn btn-ghost btn-sm" onClick={() => sendEmail(viewCharge)}><Mail size={13} /> E-mail</button>
                  <button className="btn btn-ghost btn-sm" onClick={() => { const charge = viewCharge; setViewCharge(null); openRelaunch(charge) }}>
                    <RefreshCcw size={13} /> Relançar
                  </button>
                  <button className="btn btn-primary btn-sm" onClick={() => { const charge = viewCharge; setViewCharge(null); void marcarPago(charge) }}>
                    <CheckCircle size={13} /> Confirmar pagamento
                  </button>
                </>
              )}
              <button className="btn btn-ghost btn-sm" style={{ color: 'var(--red)' }} onClick={() => excluirCobranca(viewCharge)}><Trash2 size={13} /> Excluir</button>
            </div>
            {pendingPaymentByChargeId.get(viewCharge.id) && !isChargePaid(viewCharge) && (
              <div className="charge-detail-note" style={{ marginTop: 12, fontSize: 13 }}>{buildResidentRequestSummary(pendingPaymentByChargeId.get(viewCharge.id)).detail}</div>
            )}
          </div>
        </div>
      )}

      {showModal && (
        <div className="modal-overlay" style={{ zIndex: 120 }} onClick={(event) => event.target === event.currentTarget && !saving && resetForm()}>
          <div className="modal" style={{ maxWidth: 820 }} role="dialog" aria-modal="true">
            <div className="modal-header">
              <div className="modal-title">{form.chargeId ? 'Relancar cobranca' : 'Nova cobranca'}</div>
              <button className="btn btn-ghost btn-icon" onClick={resetForm} disabled={saving} aria-label="Fechar"><X size={16} /></button>
            </div>

            <div className="condo-form-grid">
              {form.chargeId ? (
                <div className="form-group" style={{ gridColumn: '1/-1' }}>
                  <label className="form-label">Unidade</label>
                  <div className="condo-readonly">
                    {recipients.find((item) => item.unidade_id === form.unidade_id)
                      ? (() => { const item = recipients.find((entry) => entry.unidade_id === form.unidade_id); return `Unidade ${item.unidade_numero} · ${item.papel}: ${item.nome}` })()
                      : 'Unidade sem responsavel financeiro cadastrado'}
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>O boleto e regerado para o responsavel financeiro atual da unidade e a cobranca volta a ficar pendente.</div>
                  </div>
                </div>
              ) : (
                <>
                  <div className="form-group" style={{ gridColumn: '1/-1' }}>
                    <label className="form-label">Enviar para</label>
                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                      <button type="button" className={`btn btn-sm ${form.destinatario === 'all' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setForm((current) => ({ ...current, destinatario: 'all', unidade_id: '' }))}>
                        Todas as unidades ({recipients.length})
                      </button>
                      <button type="button" className={`btn btn-sm ${form.destinatario === 'single' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setForm((current) => ({ ...current, destinatario: 'single' }))}>
                        Uma unidade
                      </button>
                    </div>
                    {unitsWithoutResponsible > 0 && (
                      <div style={{ fontSize: 11, color: 'var(--orange)', marginTop: 6 }}>{unitsWithoutResponsible} unidade(s) sem responsavel financeiro nao recebem cobranca.</div>
                    )}
                  </div>

                  {form.destinatario === 'single' && (
                    <div className="form-group" style={{ gridColumn: '1/-1' }}>
                      <label className="form-label">Unidade *</label>
                      <select className="input" value={form.unidade_id} onChange={(event) => setForm((current) => ({ ...current, unidade_id: event.target.value }))}>
                        <option value="">Selecione a unidade</option>
                        {recipients.map((item) => <option key={item.unidade_id} value={item.unidade_id}>Unidade {item.unidade_numero} · {item.papel}: {item.nome}</option>)}
                      </select>
                    </div>
                  )}
                </>
              )}

              <div className="form-group">
                <label className="form-label">Tipo *</label>
                <select className="input" value={form.tipo} onChange={(event) => setForm((current) => ({ ...current, tipo: event.target.value, valor: '', valor_condominio: '', valor_energia: '', valor_agua: '' }))}>
                  {CREATE_TYPES.map((tipo) => <option key={tipo.value} value={tipo.value}>{tipo.label}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Competencia *</label>
                <input className="input" type="month" value={form.mes_referencia} onChange={(event) => setForm((current) => ({ ...current, mes_referencia: event.target.value }))} />
              </div>
              <div className="form-group">
                <label className="form-label">Vencimento *</label>
                <input className="input" type="date" value={form.vencimento} onChange={(event) => setForm((current) => ({ ...current, vencimento: event.target.value }))} />
              </div>
              <div className="form-group">
                <label className="form-label">Descricao</label>
                <input className="input" value={form.descricao} onChange={(event) => setForm((current) => ({ ...current, descricao: event.target.value }))} placeholder="Ex.: Taxas de setembro/2026" />
              </div>

              {isCondominio ? (
                <>
                  <div className="form-group">
                    <label className="form-label">Valor do condominio</label>
                    <input className="input" value={form.valor_condominio} onChange={(event) => setForm((current) => ({ ...current, valor_condominio: event.target.value }))} placeholder="0,00" />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Valor da conta de energia</label>
                    <input className="input" value={form.valor_energia} onChange={(event) => setForm((current) => ({ ...current, valor_energia: event.target.value }))} placeholder="0,00" />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Valor da conta de agua</label>
                    <input className="input" value={form.valor_agua} onChange={(event) => setForm((current) => ({ ...current, valor_agua: event.target.value }))} placeholder="0,00" />
                  </div>
                </>
              ) : (
                <div className="form-group">
                  <label className="form-label">Valor (R$) *</label>
                  <input className="input" value={form.valor} onChange={(event) => setForm((current) => ({ ...current, valor: event.target.value }))} placeholder="0,00" />
                </div>
              )}

              <div className="form-group" style={{ gridColumn: '1/-1' }}>
                <label className="form-label">Link de pagamento (opcional)</label>
                <input className="input" value={form.pagamento_link} onChange={(event) => setForm((current) => ({ ...current, pagamento_link: event.target.value }))} placeholder="https://... ou link Pix" />
              </div>
              <div className="form-group" style={{ gridColumn: '1/-1' }}>
                <label className="form-label">Pix copia e cola (opcional)</label>
                <textarea className="input" rows={2} value={form.pix_copy_paste_code} onChange={(event) => setForm((current) => ({ ...current, pix_copy_paste_code: event.target.value }))} placeholder={pixAutomatico ? 'Se ficar vazio, o WebCond gera o Pix da chave do condominio com o valor certo.' : 'Cole o Pix copia e cola do seu banco. A geracao automatica e do Plano PRO.'} />
              </div>
              <div className="form-group" style={{ gridColumn: '1/-1' }}>
                <label className="form-label">QRCode externo (opcional)</label>
                <input className="input" value={form.qrcode_externo} onChange={(event) => setForm((current) => ({ ...current, qrcode_externo: event.target.value }))} placeholder={pixAutomatico ? 'URL da imagem do QRCode (se vazio, sera gerado automaticamente).' : 'URL da imagem do QRCode do seu banco.'} />
              </div>

              <div className="form-group">
                <label className="form-label">Imagem do QRCode (opcional)</label>
                <label className="btn btn-ghost" style={{ justifyContent: 'center' }}>
                  <QrCode size={14} /> {pixQrImageName || 'Selecionar imagem'}
                  <input
                    type="file"
                    accept="image/*"
                    className="sr-only"
                    onChange={async (event) => {
                      const file = event.target.files?.[0]
                      if (!file) return
                      try {
                        setPixQrImageData(await readFileAsDataUrl(file))
                        setPixQrImageName(file.name)
                      } catch (error) {
                        toast(error.message || 'Nao foi possivel processar a imagem do QRCode.', 'error')
                      }
                    }}
                  />
                </label>
              </div>
              <div className="form-group">
                <label className="form-label">Anexo de pagamento (opcional)</label>
                <label className="btn btn-ghost" style={{ justifyContent: 'center' }}>
                  <Upload size={14} /> {paymentFile ? paymentFile.name : 'Selecionar arquivo'}
                  <input type="file" className="sr-only" onChange={(event) => setPaymentFile(event.target.files?.[0] || null)} />
                </label>
              </div>

              <div className="form-group" style={{ gridColumn: '1/-1' }}>
                <label className="form-label">Observacao</label>
                <textarea className="input" rows={2} value={form.observacao} onChange={(event) => setForm((current) => ({ ...current, observacao: event.target.value }))} placeholder="Observacoes adicionais..." />
              </div>
            </div>

            <div style={{ marginTop: 18, padding: 16, borderRadius: 10, background: 'var(--bg-3)', border: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', maxWidth: 420 }}>
                Um boleto por unidade, enviado ao responsavel financeiro. A unidade recebe aviso no sistema; WhatsApp e e-mail pelos botoes da competencia.
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Total por unidade</div>
                <div style={{ fontWeight: 700, fontSize: 24, color: 'var(--blue)' }}>{formatCurrency(previewTotal)}</div>
              </div>
            </div>

            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={resetForm} disabled={saving}>Cancelar</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? <><Loader2 size={14} className="spin-icon" /> Processando...</> : form.chargeId ? 'Relancar cobranca' : 'Lancar cobranca'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
