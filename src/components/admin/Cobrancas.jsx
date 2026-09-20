import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useToast } from '../shared/Toast'
import { useAuth } from '../../hooks/useAuth'
import { useCondominiumSettings } from '../../hooks/useCondominiumSettings'
import WhatsAppIcon from '../shared/WhatsAppIcon'
import { Plus, Search, CheckCircle, X, Loader2, DollarSign, QrCode, Upload, Paperclip, Trash2, Mail, Eye, RefreshCcw, CalendarDays, FileText, Link2 } from 'lucide-react'
import QRCode from 'qrcode'
import { formatCurrency, formatReferenceLabel, parseCurrencyInput } from '../../lib/billingShared'
import { buildChargeStorageFileName, enrichChargesWithPaymentUrls } from '../../lib/charges'
import { applyTenantFilter, withTenantFields } from '../../lib/tenant'
import { getChargePaymentStatus, getChargePaymentStatusMeta, isChargePaid } from '../../lib/chargeStatus'
import { buildResidentRequestSummary, isResidentPaymentConfirmation, isResidentRequestPending, parseResidentRequest } from '../../lib/residentRequests'
import { renderBillingPdf } from '../../lib/adminApi'
import { compareUnitNumbers } from '../../lib/units'

const FILTER_TYPES = [
  { value: 'condominio', label: 'Condominio', color: 'blue' },
  { value: 'agua', label: 'Agua', color: 'blue' },
  { value: 'energia', label: 'Energia', color: 'orange' },
  { value: 'multa', label: 'Multa', color: 'red' },
  { value: 'outro', label: 'Outro', color: 'purple' },
]

const CREATE_TYPES = [
  { value: 'condominio', label: 'Condominio', color: 'blue' },
  { value: 'multa', label: 'Multa', color: 'red' },
  { value: 'outro', label: 'Outro', color: 'purple' },
]

const BREAKDOWN_TITLES = {
  condominio: 'Taxa Condominial',
  agua: 'Fatura Compesa',
  energia: 'Fatura Neoenergia',
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

function buildPixPayload(valor, reference, pixKey) {
  const amount = Number(valor || 0)
  return `PIX|${String(pixKey || '').trim()}|${amount.toFixed(2)}|${reference}`
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
    return [
      { leftTitle: BREAKDOWN_TITLES.condominio, middleTitle: 'Atualizações, reparos e manutenções das áreas comuns', value: parseCurrencyInput(form.valor_condominio) },
      { leftTitle: BREAKDOWN_TITLES.agua, middleTitle: 'Uso da água distribuída para todo condomínio', value: parseCurrencyInput(form.valor_agua) },
      { leftTitle: BREAKDOWN_TITLES.energia, middleTitle: 'Uso da conta de energia de áreas comuns', value: parseCurrencyInput(form.valor_energia) },
    ]
  }

  return [{ leftTitle: form.tipo === 'multa' ? 'Multa' : 'Outro', middleTitle: buildChargeDescription(form), value: parseCurrencyInput(form.valor) }]
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
    nomeMorador: recipient.nome,
    apartamento: recipient.unidade_numero || '-',
    numero: recipient.whatsapp || condominiumSettings.whatsappLabel,
    observacoes: String(form.observacao || '').trim() || 'N/A',
    valorTotal: total,
    mesReferencia: form.mes_referencia,
    dataVencimento: form.vencimento,
    itens: breakdown.map((item) => ({ nome: item.leftTitle, descricao: item.middleTitle, valor: item.value })),
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

    setCobrancas(await enrichChargesWithPaymentUrls(cobRes.data || []))
    setUnits(unitsRes.data || [])
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

  const activeReference = references.find((group) => group.key === openReference) || null
  const referenceCharges = useMemo(() => {
    if (!activeReference) return []
    const query = search.trim().toLowerCase()
    return activeReference.charges
      .filter((charge) => !query || getChargeUnit(charge).toLowerCase().includes(query) || String(charge.profiles?.nome || '').toLowerCase().includes(query))
      .sort((a, b) => compareUnitNumbers(getChargeUnit(a), getChargeUnit(b)))
  }, [activeReference, search])

  const totalPendente = cobrancas.filter((item) => !isChargePaid(item)).reduce((sum, item) => sum + Number(item.valor || 0), 0)
  const totalPago = cobrancas.filter((item) => isChargePaid(item)).reduce((sum, item) => sum + Number(item.valor || 0), 0)

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
      pagamento_link: charge.pagamento_link || '',
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
      const pixKey = condominiumSettings.pixKey

      let pagamentoAnexoPath = ''
      if (paymentFile) {
        pagamentoAnexoPath = buildChargeStorageFileName(paymentFile.name, 'pagamentos', condominiumId)
        const { error: paymentUploadError } = await supabase.storage.from('cobrancas').upload(pagamentoAnexoPath, paymentFile)
        if (paymentUploadError) throw paymentUploadError
        uploadedPaths.push(pagamentoAnexoPath)
      }

      const rows = []
      for (const recipient of selected) {
        const pixCopyPasteCode = manualPixCopyPasteCode || buildPixPayload(total, `${recipient.unidade_numero}-${form.mes_referencia}`, pixKey)
        let pixQrCode = uploadedQrCode || externalQrCode
        if (!pixQrCode && (pixCopyPasteCode || pixKey)) {
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

      if (isRelaunch) {
        const { error } = await supabase.from('cobrancas').update(rows[0]).eq('id', form.chargeId)
        if (error) throw error
        if (form.previousBoletoPath) await supabase.storage.from('cobrancas').remove([form.previousBoletoPath])
      } else {
        const { error } = await supabase.from('cobrancas').insert(rows)
        if (error) throw error
      }

      const { error: avisoError } = await supabase.from('avisos').insert(buildNotificationRows(selected, profile.id, referenceLabel, condominiumId, { resend: isRelaunch }))
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

    toast('Cobranca excluida.', 'success')
    setViewCharge(null)
    void fetchAll()
  }

  const isCondominio = form.tipo === 'condominio'
  const previewTotal = buildBreakdown(form).reduce((sum, item) => sum + Number(item.value || 0), 0)
  const unitsWithoutResponsible = units.length - recipients.length

  return (
    <div className="fade-in">
      <div className="page-header">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <div className="page-title">Cobrancas</div>
            <div className="page-subtitle">Por competencia. Cada cobranca vai para o responsavel financeiro da unidade.</div>
          </div>
          <button className="btn btn-primary" onClick={openNewCharge}>
            <Plus size={15} /> Nova cobranca
          </button>
        </div>
      </div>

      <div className="stats-grid" style={{ marginBottom: 20 }}>
        <div className="stat-card">
          <div className="label">Pendente</div>
          <div className="value" style={{ color: '#f0883e', fontSize: 20 }}>{formatCurrency(totalPendente)}</div>
        </div>
        <div className="stat-card">
          <div className="label">Recebido</div>
          <div className="value" style={{ color: '#3fb950', fontSize: 20 }}>{formatCurrency(totalPago)}</div>
        </div>
        <div className="stat-card">
          <div className="label">Competencias</div>
          <div className="value" style={{ color: '#58a6ff', fontSize: 20 }}>{references.length}</div>
        </div>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><div className="spinner" /></div>
      ) : references.length === 0 ? (
        <div className="empty-state"><DollarSign size={40} /><p>Nenhuma cobranca lancada ainda.</p></div>
      ) : (
        <div className="reference-grid">
          {references.map((group) => (
            <button key={group.key} type="button" className="reference-card" onClick={() => { setSearch(''); setOpenReference(group.key) }}>
              <div className="reference-card-head">
                <CalendarDays size={16} />
                <span className="reference-card-title">{group.key === 'sem-referencia' ? 'Sem competencia' : formatReferenceLabel(group.key)}</span>
              </div>
              <div className="reference-card-total">{formatCurrency(group.total)}</div>
              <div className="reference-card-meta">{group.charges.length} unidade(s) cobrada(s)</div>
              <div className="reference-card-badges">
                <span className="badge badge-green">Recebido {formatCurrency(group.received)}</span>
                {group.open > 0 && <span className="badge badge-orange">{group.open} em aberto</span>}
                {group.overdue > 0 && <span className="badge badge-red">{group.overdue} atrasada(s)</span>}
              </div>
            </button>
          ))}
        </div>
      )}

      {activeReference && (
        <div className="modal-overlay" onClick={(event) => event.target === event.currentTarget && setOpenReference(null)}>
          <div className="modal" style={{ maxWidth: 1100 }} role="dialog" aria-modal="true">
            <div className="modal-header">
              <div>
                <div className="modal-title">Competencia {activeReference.key === 'sem-referencia' ? '-' : formatReferenceLabel(activeReference.key)}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                  {activeReference.charges.length} unidade(s) · Total {formatCurrency(activeReference.total)} · Recebido {formatCurrency(activeReference.received)}
                </div>
              </div>
              <button className="btn btn-ghost btn-icon" onClick={() => setOpenReference(null)} aria-label="Fechar"><X size={16} /></button>
            </div>

            <div style={{ position: 'relative', marginBottom: 14 }}>
              <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#8b949e' }} />
              <input className="input" style={{ paddingLeft: 34 }} placeholder="Buscar unidade ou responsavel..." value={search} onChange={(event) => setSearch(event.target.value)} />
            </div>

            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Unidade</th>
                    <th>Responsavel financeiro</th>
                    <th>Descricao</th>
                    <th>Vencimento</th>
                    <th>Valor</th>
                    <th>Status</th>
                    <th>Acoes</th>
                  </tr>
                </thead>
                <tbody>
                  {referenceCharges.map((charge) => {
                    const paymentRequest = pendingPaymentByChargeId.get(charge.id)
                    const paid = isChargePaid(charge)
                    const statusMeta = paymentRequest && !paid ? { label: 'Pagamento informado', badgeClass: 'badge-blue' } : getChargePaymentStatusMeta(charge)

                    return (
                      <tr key={charge.id}>
                        <td className="mono" style={{ fontWeight: 700 }}>{getChargeUnit(charge)}</td>
                        <td>
                          <div style={{ fontWeight: 600 }}>{charge.profiles?.nome || '-'}</div>
                          {paymentRequest && <div style={{ fontSize: 11, color: '#8b949e', marginTop: 4 }}>{buildResidentRequestSummary(paymentRequest).detail}</div>}
                        </td>
                        <td>
                          <div>{charge.descricao || '-'}</div>
                          <span className={`badge badge-${getTypeMeta(charge.tipo).color}`}>{getTypeMeta(charge.tipo).label}</span>
                        </td>
                        <td style={{ color: '#8b949e' }}>{formatDueDate(charge.vencimento)}</td>
                        <td className="mono" style={{ fontWeight: 600 }}>{formatCurrency(charge.valor)}</td>
                        <td><span className={`badge ${statusMeta.badgeClass}`}>{statusMeta.label}</span></td>
                        <td>
                          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                            <button className="btn btn-ghost btn-sm" onClick={() => setViewCharge(charge)} title="Visualizar cobranca"><Eye size={13} /></button>
                            {!paid && (
                              <>
                                <button className="btn btn-ghost btn-sm" onClick={() => openRelaunch(charge)} title="Relancar (editar e enviar novamente)"><RefreshCcw size={13} /></button>
                                <button className="btn btn-ghost btn-sm" onClick={() => sendWhatsApp(charge)} title="Enviar pelo WhatsApp"><WhatsAppIcon size={14} /></button>
                                <button className="btn btn-ghost btn-sm" onClick={() => sendEmail(charge)} title="Enviar por e-mail"><Mail size={13} /></button>
                                <button className="btn btn-ghost btn-sm" onClick={() => marcarPago(charge)} title="Confirmar pagamento"><CheckCircle size={13} /></button>
                              </>
                            )}
                            <button className="btn btn-ghost btn-sm" style={{ color: 'var(--red)' }} onClick={() => excluirCobranca(charge)} title="Excluir cobranca"><Trash2 size={13} /></button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {viewCharge && (
        <div className="modal-overlay" style={{ zIndex: 110 }} onClick={(event) => event.target === event.currentTarget && setViewCharge(null)}>
          <div className="modal" role="dialog" aria-modal="true">
            <div className="modal-header">
              <div className="modal-title">Unidade {getChargeUnit(viewCharge)} · {formatReferenceLabel(viewCharge.mes_referencia)}</div>
              <button className="btn btn-ghost btn-icon" onClick={() => setViewCharge(null)} aria-label="Fechar"><X size={16} /></button>
            </div>
            <div className="charge-detail-grid">
              <div><div className="form-label">Responsavel financeiro</div><div className="charge-detail-value">{viewCharge.profiles?.nome || '-'}</div></div>
              <div><div className="form-label">Status</div><span className={`badge ${getChargePaymentStatusMeta(viewCharge).badgeClass}`}>{getChargePaymentStatusMeta(viewCharge).label}</span></div>
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
                <button className="btn btn-primary btn-sm" onClick={() => { const charge = viewCharge; setViewCharge(null); openRelaunch(charge) }}>
                  <RefreshCcw size={13} /> Relancar
                </button>
              )}
            </div>
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
                <textarea className="input" rows={2} value={form.pix_copy_paste_code} onChange={(event) => setForm((current) => ({ ...current, pix_copy_paste_code: event.target.value }))} placeholder="Se ficar vazio, o sistema usa a chave Pix do condominio." />
              </div>
              <div className="form-group" style={{ gridColumn: '1/-1' }}>
                <label className="form-label">QRCode externo (opcional)</label>
                <input className="input" value={form.qrcode_externo} onChange={(event) => setForm((current) => ({ ...current, qrcode_externo: event.target.value }))} placeholder="URL da imagem do QRCode (se vazio, sera gerado automaticamente)." />
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
