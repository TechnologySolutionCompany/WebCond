import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useToast } from '../shared/Toast'
import { useAuth } from '../../hooks/useAuth'
import { useCondominiumSettings } from '../../hooks/useCondominiumSettings'
import { Plus, Search, CheckCircle, X, Loader2, DollarSign, QrCode, Link2, Upload, Users, Paperclip, Copy, Trash2, MessageCircle } from 'lucide-react'
import QRCode from 'qrcode'
import { formatCurrency, formatReferenceLabel, parseCurrencyInput } from '../../lib/billingShared'
import { buildChargeStorageFileName, enrichChargesWithPaymentUrls } from '../../lib/charges'
import { applyTenantFilter, withTenantFields } from '../../lib/tenant'
import { getChargePaymentStatusMeta, isChargePaid } from '../../lib/chargeStatus'
import { buildResidentRequestSummary, isResidentPaymentConfirmation, isResidentRequestPending, parseResidentRequest } from '../../lib/residentRequests'
import { renderBillingPdf } from '../../lib/adminApi'

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

const emptyForm = {
  destinatario: 'single',
  morador_id: '',
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
  const resolvedPixKey = String(pixKey || '').trim()
  const pixString = `PIX|${resolvedPixKey}|${amount.toFixed(2)}|${reference}`
  return { pixString, pixLink: '' }
}

function getBadgeColor(tipo) {
  return FILTER_TYPES.find((item) => item.value === tipo)?.color || 'blue'
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
  if (String(form.descricao || '').trim()) {
    return String(form.descricao || '').trim()
  }

  if (form.tipo === 'condominio') {
    return `Taxas condominiais ${formatReferenceLabel(form.mes_referencia)}`
  }

  if (form.tipo === 'multa') {
    return `Multa ${formatReferenceLabel(form.mes_referencia)}`
  }

  return `Cobranca avulsa ${formatReferenceLabel(form.mes_referencia)}`
}

function buildBreakdown(form) {
  if (form.tipo === 'condominio') {
    return [
      {
        leftTitle: 'Taxa Condominial',
        middleTitle: 'Atualizações, reparos e manutenções das áreas comuns',
        value: parseCurrencyInput(form.valor_condominio),
      },
      {
        leftTitle: 'Fatura Compesa',
        middleTitle: 'Uso da água distribuída para todo condomínio',
        value: parseCurrencyInput(form.valor_agua),
      },
      {
        leftTitle: 'Fatura Neoenergia',
        middleTitle: 'Uso da conta de energia de áreas comuns',
        value: parseCurrencyInput(form.valor_energia),
      },
    ]
  }

  return [
    {
      leftTitle: form.tipo === 'multa' ? 'Multa' : 'Outro',
      middleTitle: buildChargeDescription(form),
      value: parseCurrencyInput(form.valor),
    },
  ]
}

function buildObservation(form, breakdown) {
  const parts = breakdown.map((item) => `${item.leftTitle}: ${formatCurrency(item.value)}`)
  const extra = String(form.observacao || '').trim()
  return extra ? `${parts.join(' | ')} | Obs: ${extra}` : parts.join(' | ')
}

function shouldUseLegacyPdfFallback(error) {
  if (!error) return false

  return error.code === 'PDF_RENDER_UNAVAILABLE'
    || error.status === 500
    || error.status === 503
}

function normalizeWhatsappForUrl(value = '') {
  const digits = String(value || '').replace(/\D/g, '')
  if (!digits) return ''
  if (digits.startsWith('55') && digits.length >= 12) return digits
  return `55${digits}`
}

function buildReminderMessage(charge, condominiumSettings) {
  const dueDate = charge.vencimento
    ? new Date(`${charge.vencimento}T12:00:00`).toLocaleDateString('pt-BR')
    : '-'
  const residentName = String(charge.profiles?.nome || 'morador').trim()
  const pixKey = String(condominiumSettings.pixKey || charge.pix_copy_paste_code || '').trim() || 'Chave Pix nao informada'
  const boletoLink = String(charge.boleto_download_url || charge.boleto_url || '').trim()

  return [
    `Olá, ${residentName}. ainda não foi identificado o pagamento das taxas condominiais. Caso já tenha realizado o pagamento, encaminhe o comprovante para atualização no sistema.`,
    '',
    `Vencimento : ${dueDate}`,
    `Valor Total : ${formatCurrency(charge.valor)}`,
    '',
    'Para sua comodidade, você pode pagar via PIX utilizando as chaves abaixo:',
    '',
    `chave pix do condomínio: ${pixKey}`,
    boletoLink ? `PDF do Boleto - Taxas Condominiais: ${boletoLink}` : null,
    '',
    '`Esta é uma mensagem automatica`',
  ].filter((line) => line !== null).join('\n')
}

async function generateChargePdfBytes({
  condominiumSettings,
  morador,
  form,
  total,
  pixQrCode,
  pixCopyPasteCode,
  paymentLink,
  breakdown,
}) {
  const payload = {
    nomeMorador: morador.nome,
    apartamento: morador.apartamento || '-',
    numero: morador.whatsapp || condominiumSettings.whatsappLabel,
    observacoes: String(form.observacao || '').trim() || 'N/A',
    valorTotal: total,
    mesReferencia: form.mes_referencia,
    dataVencimento: form.vencimento,
    itens: breakdown.map((item) => ({
      nome: item.leftTitle,
      descricao: item.middleTitle,
      valor: item.value,
    })),
    qrcode_pix: pixQrCode,
    pixCopiaCola: pixCopyPasteCode,
    linkPagamento: paymentLink,
  }

  try {
    return await renderBillingPdf(payload)
  } catch (error) {
    if (!shouldUseLegacyPdfFallback(error)) {
      throw error
    }

    const { generateChargesPdf } = await import('../../lib/billingPdf')
    return generateChargesPdf({
      condominium: condominiumSettings,
      charges: [
        {
          nome: morador.nome,
          apartamento: morador.apartamento || '-',
          whatsapp: morador.whatsapp || condominiumSettings.whatsappLabel,
          observacao: String(form.observacao || '').trim() || 'N/A',
          reference: form.mes_referencia,
          vencimento: form.vencimento,
          total,
          qrCodeDataUrl: pixQrCode.startsWith('data:image/') ? pixQrCode : '',
          breakdown,
        },
      ],
    })
  }
}

function buildNotificationRows(moradores, profileId, referenceLabel, condominiumId) {
  const uniqueByApartment = new Map()
  for (const morador of moradores) {
    const apto = String(morador.apartamento || '').trim()
    if (!apto || uniqueByApartment.has(apto)) continue
    uniqueByApartment.set(apto, morador)
  }

  return Array.from(uniqueByApartment.values()).map((morador) => ({
    titulo: 'Nova cobranca disponivel',
    conteudo: `Uma nova cobranca foi lancada para o seu apartamento (${referenceLabel}). Abra "Minhas cobrancas" para acessar o boleto e os dados de pagamento configurados pelo sindico.`,
    tipo: 'informativo',
    destinatario: 'apartamento',
    apartamento_destino: morador.apartamento || '',
    created_by: profileId,
    condominium_id: condominiumId || null,
    condominio_id: condominiumId || null,
  }))
}

export default function Cobrancas() {
  const [cobrancas, setCobrancas] = useState([])
  const [moradores, setMoradores] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterTipo, setFilterTipo] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
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
    const [cobRes, morRes, requestsRes] = await Promise.all([
      applyTenantFilter(
        supabase
        .from('cobrancas')
        .select('*, profiles:morador_id(nome, apartamento, whatsapp)')
        .order('created_at', { ascending: false }),
        condominiumId,
      ),
      applyTenantFilter(
        supabase
        .from('profiles')
        .select('id, nome, apartamento, whatsapp')
        .in('role', ['morador', 'RESIDENT'])
        .eq('ativo', true)
        .order('apartamento'),
        condominiumId,
      ),
      applyTenantFilter(
        supabase
          .from('ocorrencias_predio')
          .select('*')
          .order('created_at', { ascending: false }),
        condominiumId,
      ),
    ])

    const enrichedCharges = await enrichChargesWithPaymentUrls(cobRes.data || [])
    setCobrancas(enrichedCharges)
    setMoradores(morRes.data || [])
    setResidentRequests(requestsRes.data || [])
    setLoading(false)
  }, [condominiumId])

  useEffect(() => {
    void fetchAll()
  }, [fetchAll])

  const handleSave = async () => {
    const isCondominio = form.tipo === 'condominio'
    const breakdown = buildBreakdown(form)
    const total = breakdown.reduce((sum, item) => sum + Number(item.value || 0), 0)

    if (form.destinatario === 'single' && !form.morador_id) {
      toast('Selecione o morador ou escolha enviar para todos.', 'error')
      return
    }

    if (!form.vencimento) {
      toast('Informe a data de vencimento.', 'error')
      return
    }

    if (isCondominio) {
      const filledValues = breakdown.filter((item) => item.value > 0)
      if (filledValues.length === 0) {
        toast('Informe ao menos um valor para as taxas de condominio.', 'error')
        return
      }
    } else if (parseCurrencyInput(form.valor) <= 0) {
      toast('Informe um valor valido para a cobranca.', 'error')
      return
    }

    const selectedMoradores = form.destinatario === 'all'
      ? moradores
      : moradores.filter((morador) => morador.id === form.morador_id)

    if (selectedMoradores.length === 0) {
      toast('Nenhum morador disponivel para esta cobranca.', 'error')
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
      const customPaymentLink = String(form.pagamento_link || '').trim()
      const pixKey = condominiumSettings.pixKey

      let pagamentoAnexoPath = ''
      if (paymentFile) {
        pagamentoAnexoPath = buildChargeStorageFileName(paymentFile.name, 'pagamentos')
        const { error: paymentUploadError } = await supabase
          .storage
          .from('cobrancas')
          .upload(pagamentoAnexoPath, paymentFile)

        if (paymentUploadError) throw paymentUploadError
        uploadedPaths.push(pagamentoAnexoPath)
      }

      const insertRows = []

      for (const morador of selectedMoradores) {
        const { pixString } = buildPixPayload(total, `${morador.apartamento}-${form.mes_referencia}`, pixKey)
        const pixCopyPasteCode = manualPixCopyPasteCode || pixString

        let pixQrCode = uploadedQrCode || externalQrCode
        if (!pixQrCode && (pixCopyPasteCode || pixKey)) {
          pixQrCode = await QRCode.toDataURL(pixCopyPasteCode || pixString)
        }

        const paymentLink = customPaymentLink

        const pdfBytes = await generateChargePdfBytes({
          condominiumSettings,
          morador,
          form,
          total,
          pixQrCode,
          pixCopyPasteCode,
          paymentLink,
          breakdown,
        })

        const boletoPath = buildChargeStorageFileName(`boleto-${morador.apartamento || 'morador'}-${form.mes_referencia}.pdf`, 'boletos')
        const boletoBlob = new Blob([pdfBytes], { type: 'application/pdf' })

        const { error: boletoUploadError } = await supabase
          .storage
          .from('cobrancas')
          .upload(boletoPath, boletoBlob, { contentType: 'application/pdf' })

        if (boletoUploadError) throw boletoUploadError
        uploadedPaths.push(boletoPath)

        insertRows.push(withTenantFields({
          morador_id: morador.id,
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
          pagamento_anexo_path: pagamentoAnexoPath,
          boleto_path: boletoPath,
          payment_status: 'PENDING',
          paid_at: null,
          confirmed_by: null,
          receipt_url: '',
          created_by: profile.id,
        }, condominiumId))
      }

      const { error } = await supabase.from('cobrancas').insert(insertRows)
      if (error) throw error

      const notificationRows = buildNotificationRows(selectedMoradores, profile.id, referenceLabel, condominiumId)
      if (notificationRows.length > 0) {
        const { error: avisoError } = await supabase.from('avisos').insert(notificationRows)
        if (avisoError) {
          toast('Cobranca lancada, mas houve falha ao criar aviso automatico.', 'info')
        }
      }

      toast(
        form.destinatario === 'all'
          ? `Cobrancas lancadas para ${selectedMoradores.length} moradores com boleto e formas de pagamento.`
          : 'Cobranca lancada com sucesso com boleto e pagamento anexado.',
        'success',
      )

      setShowModal(false)
      setForm(emptyForm)
      setPaymentFile(null)
      setPixQrImageData('')
      setPixQrImageName('')
      void fetchAll()
    } catch (error) {
      if (uploadedPaths.length > 0) {
        await supabase.storage.from('cobrancas').remove(uploadedPaths)
      }
      toast(error.message || 'Erro ao lancar cobranca.', 'error')
    } finally {
      setSaving(false)
    }
  }

  const marcarPago = async (charge) => {
    const pendingRequest = residentRequests.find((item) => {
      if (!isResidentPaymentConfirmation(item) || !isResidentRequestPending(item)) return false
      return parseResidentRequest(item).chargeId === charge.id
    })

    if (pendingRequest) {
      const confirmed = window.confirm('O morador informou que ja realizou o pagamento. Verifique o comprovante e/ou o extrato do banco antes da baixa definitiva. Deseja confirmar o pagamento agora?')
      if (!confirmed) return
    }

    const { error } = await supabase
      .from('cobrancas')
      .update({
        pago: true,
        data_pagamento: new Date().toISOString().slice(0, 10),
        payment_status: 'PAID',
        paid_at: new Date().toISOString(),
        confirmed_by: profile.id,
      })
      .eq('id', charge.id)

    if (error) {
      toast('Erro ao atualizar cobranca.', 'error')
      return
    }

    if (pendingRequest) {
      await supabase
        .from('ocorrencias_predio')
        .update({ status: 'resolvido', updated_at: new Date().toISOString() })
        .eq('id', pendingRequest.id)
    }

    toast('Pagamento confirmado!', 'success')
    void fetchAll()
  }

  const excluirCobranca = async (charge) => {
    const confirmed = window.confirm(`Deseja excluir a cobranca "${charge.descricao || charge.tipo}" de ${formatReferenceLabel(charge.mes_referencia)}?`)
    if (!confirmed) return

    const filesToRemove = [charge.pagamento_anexo_path, charge.boleto_path].filter(Boolean)

    if (filesToRemove.length > 0) {
      await supabase.storage.from('cobrancas').remove(filesToRemove)
    }

    const { error } = await supabase
      .from('cobrancas')
      .delete()
      .eq('id', charge.id)

    if (error) {
      toast('Nao foi possivel excluir a cobranca.', 'error')
      return
    }

    toast('Cobranca excluida com sucesso.', 'success')
    void fetchAll()
  }

  const enviarLembrete = (charge) => {
    const whatsapp = normalizeWhatsappForUrl(charge.profiles?.whatsapp)
    if (!whatsapp) {
      toast('Este morador nao possui WhatsApp cadastrado.', 'error')
      return
    }

    const message = buildReminderMessage(charge, condominiumSettings)
    window.open(`https://wa.me/${whatsapp}?text=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer')

    const boletoUrl = charge.boleto_download_url || charge.boleto_url
    if (boletoUrl) {
      window.open(boletoUrl, '_blank', 'noopener,noreferrer')
    } else {
      toast('Cobranca sem PDF de boleto disponivel. O WhatsApp sera aberto apenas com a mensagem.', 'info')
    }
  }

  const filtered = useMemo(() => cobrancas.filter((cobranca) => {
    const nome = cobranca.profiles?.nome?.toLowerCase() || ''
    const apto = cobranca.profiles?.apartamento || ''
    const matchSearch = nome.includes(search.toLowerCase()) || apto.includes(search)
    const matchTipo = !filterTipo || cobranca.tipo === filterTipo
    const chargePaid = isChargePaid(cobranca)
    const matchStatus = !filterStatus || (filterStatus === 'pago' ? chargePaid : !chargePaid)
    return matchSearch && matchTipo && matchStatus
  }), [cobrancas, filterStatus, filterTipo, search])

  const totalPendente = filtered.filter((item) => !isChargePaid(item)).reduce((sum, item) => sum + Number(item.valor || 0), 0)
  const totalPago = filtered.filter((item) => isChargePaid(item)).reduce((sum, item) => sum + Number(item.valor || 0), 0)
  const isCondominio = form.tipo === 'condominio'
  const previewTotal = buildBreakdown(form).reduce((sum, item) => sum + Number(item.value || 0), 0)
  const pendingPaymentRequests = residentRequests.filter((item) => isResidentPaymentConfirmation(item) && isResidentRequestPending(item))
  const pendingPaymentByChargeId = new Map(pendingPaymentRequests.map((item) => [parseResidentRequest(item).chargeId, item]))
  const groupedCharges = filtered.reduce((acc, charge) => {
    const key = charge.mes_referencia || 'sem-referencia'
    if (!acc.has(key)) acc.set(key, [])
    acc.get(key).push(charge)
    return acc
  }, new Map())

  return (
    <div className="fade-in">
      <div className="page-header">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <div className="page-title">Cobrancas</div>
            <div className="page-subtitle">Lance cobrancas com boleto por morador, link/QR de pagamento e notificacao automatica.</div>
          </div>
          <button className="btn btn-primary" onClick={() => setShowModal(true)}>
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
          <div className="label">Total de lancamentos</div>
          <div className="value" style={{ color: '#58a6ff', fontSize: 20 }}>{filtered.length}</div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
          <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#8b949e' }} />
          <input className="input" style={{ paddingLeft: 34 }} placeholder="Buscar morador ou apto..." value={search} onChange={(event) => setSearch(event.target.value)} />
        </div>
        <select className="input" style={{ width: 160 }} value={filterTipo} onChange={(event) => setFilterTipo(event.target.value)}>
          <option value="">Todos os tipos</option>
          {FILTER_TYPES.map((tipo) => <option key={tipo.value} value={tipo.value}>{tipo.label}</option>)}
        </select>
        <select className="input" style={{ width: 140 }} value={filterStatus} onChange={(event) => setFilterStatus(event.target.value)}>
          <option value="">Todos</option>
          <option value="pendente">Pendentes</option>
          <option value="pago">Pagos</option>
        </select>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><div className="spinner" /></div>
      ) : filtered.length === 0 ? (
        <div className="empty-state"><DollarSign size={40} /><p>Nenhuma cobranca encontrada.</p></div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {Array.from(groupedCharges.entries()).sort((a, b) => b[0].localeCompare(a[0])).map(([reference, charges]) => (
            <div key={reference} className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <div style={{ padding: '16px 18px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontSize: 12, color: '#8b949e', textTransform: 'uppercase', letterSpacing: '.06em' }}>Competencia</div>
                  <div style={{ fontSize: 18, fontWeight: 700 }}>{formatReferenceLabel(reference)}</div>
                </div>
                <div style={{ fontSize: 12, color: '#8b949e' }}>{charges.length} cobranca(s)</div>
              </div>

              <div className="table-wrap" style={{ border: 'none', borderRadius: 0 }}>
                <table>
                  <thead>
                    <tr>
                      <th>Morador / Apto</th>
                      <th>Descricao</th>
                      <th>Tipo</th>
                      <th>Vencimento</th>
                      <th>Valor</th>
                      <th>Status</th>
                      <th>Pagamento enviado</th>
                      <th>Acao</th>
                    </tr>
                  </thead>
                  <tbody>
                    {charges.map((cobranca) => {
                      const paymentRequest = pendingPaymentByChargeId.get(cobranca.id)
                      const statusMeta = paymentRequest && !isChargePaid(cobranca)
                        ? { label: 'Pagamento confirmado', badgeClass: 'badge-blue' }
                        : getChargePaymentStatusMeta(cobranca)

                      return (
                        <tr key={cobranca.id}>
                          <td>
                            <div style={{ fontWeight: 600 }}>{cobranca.profiles?.nome || '-'}</div>
                            <div style={{ fontSize: 12, color: '#8b949e' }}>Apt. {cobranca.profiles?.apartamento || '-'}</div>
                          </td>
                          <td>
                            <div>{cobranca.descricao || '-'}</div>
                            {paymentRequest && (
                              <div style={{ fontSize: 11, color: '#8b949e', marginTop: 4 }}>
                                {buildResidentRequestSummary(paymentRequest).detail}
                              </div>
                            )}
                          </td>
                          <td><span className={`badge badge-${getBadgeColor(cobranca.tipo)}`}>{FILTER_TYPES.find((item) => item.value === cobranca.tipo)?.label || cobranca.tipo}</span></td>
                          <td style={{ color: '#8b949e' }}>{cobranca.vencimento ? new Date(`${cobranca.vencimento}T12:00:00`).toLocaleDateString('pt-BR') : '-'}</td>
                          <td className="mono" style={{ fontWeight: 600 }}>{formatCurrency(cobranca.valor)}</td>
                          <td><span className={`badge ${statusMeta.badgeClass}`}>{statusMeta.label}</span></td>
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                              {(cobranca.pix_qr_code || cobranca.pix_qrcode_url) && <span className="badge badge-blue"><QrCode size={10} /> QR</span>}
                              {cobranca.pix_copy_paste_code && <span className="badge badge-orange"><Copy size={10} /> Pix</span>}
                              {(cobranca.pagamento_link || cobranca.pix_link) && <span className="badge badge-green"><Link2 size={10} /> Link</span>}
                              {(cobranca.pagamento_anexo_path || cobranca.pagamento_anexo_url) && <span className="badge badge-purple"><Paperclip size={10} /> Anexo</span>}
                              {!(cobranca.pix_qr_code || cobranca.pix_qrcode_url || cobranca.pix_copy_paste_code || cobranca.pagamento_link || cobranca.pix_link || cobranca.pagamento_anexo_path || cobranca.pagamento_anexo_url) && <span style={{ color: '#8b949e' }}>-</span>}
                            </div>
                          </td>
                          <td>
                            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                              {!isChargePaid(cobranca) && (
                                <>
                                  <button className="btn btn-ghost btn-sm" onClick={() => enviarLembrete(cobranca)} title="Enviar lembrete pelo WhatsApp">
                                    <MessageCircle size={13} /> Lembrete
                                  </button>
                                  <button className="btn btn-ghost btn-sm" onClick={() => marcarPago(cobranca)} title="Marcar como pago">
                                    <CheckCircle size={13} /> {paymentRequest ? 'Confirmar 2x' : 'Pago'}
                                  </button>
                                </>
                              )}
                              <button className="btn btn-danger btn-sm" onClick={() => excluirCobranca(cobranca)}>
                                <Trash2 size={13} /> Excluir
                              </button>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <div className="modal-overlay" onClick={(event) => event.target === event.currentTarget && setShowModal(false)}>
          <div className="modal" style={{ maxWidth: 820 }}>
            <div className="modal-header">
              <div className="modal-title">Nova cobranca</div>
              <button className="btn btn-ghost btn-icon" onClick={() => setShowModal(false)}><X size={16} /></button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <div className="form-group" style={{ gridColumn: '1/-1' }}>
                <label className="form-label">Enviar para</label>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className={`btn btn-sm ${form.destinatario === 'single' ? 'btn-primary' : 'btn-ghost'}`}
                    onClick={() => setForm((current) => ({ ...current, destinatario: 'single' }))}
                  >
                    Selecionar morador
                  </button>
                  <button
                    type="button"
                    className={`btn btn-sm ${form.destinatario === 'all' ? 'btn-primary' : 'btn-ghost'}`}
                    onClick={() => setForm((current) => ({ ...current, destinatario: 'all', morador_id: '' }))}
                  >
                    <Users size={13} /> Enviar para todos
                  </button>
                </div>
              </div>

              {form.destinatario === 'single' && (
                <div className="form-group" style={{ gridColumn: '1/-1' }}>
                  <label className="form-label">Morador *</label>
                  <select className="input" value={form.morador_id} onChange={(event) => setForm((current) => ({ ...current, morador_id: event.target.value }))}>
                    <option value="">Selecione o morador</option>
                    {moradores.map((morador) => <option key={morador.id} value={morador.id}>Apt. {morador.apartamento} - {morador.nome}</option>)}
                  </select>
                </div>
              )}

              <div className="form-group">
                <label className="form-label">Tipo *</label>
                <select className="input" value={form.tipo} onChange={(event) => setForm((current) => ({ ...current, tipo: event.target.value, valor: '', valor_condominio: '', valor_energia: '', valor_agua: '' }))}>
                  {CREATE_TYPES.map((tipo) => <option key={tipo.value} value={tipo.value}>{tipo.label}</option>)}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Mes de referencia *</label>
                <input className="input" type="month" value={form.mes_referencia} onChange={(event) => setForm((current) => ({ ...current, mes_referencia: event.target.value }))} />
              </div>

              <div className="form-group">
                <label className="form-label">Vencimento *</label>
                <input className="input" type="date" value={form.vencimento} onChange={(event) => setForm((current) => ({ ...current, vencimento: event.target.value }))} />
              </div>

              <div className="form-group">
                <label className="form-label">Descricao</label>
                <input className="input" value={form.descricao} onChange={(event) => setForm((current) => ({ ...current, descricao: event.target.value }))} placeholder="Ex.: Taxas de abril/2026" />
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
                <textarea
                  className="input"
                  rows={2}
                  value={form.pix_copy_paste_code}
                  onChange={(event) => setForm((current) => ({ ...current, pix_copy_paste_code: event.target.value }))}
                  placeholder="Cole aqui o codigo Pix copia e cola. Se ficar vazio, o sistema usa a chave Pix do condominio para montar um codigo simples."
                />
              </div>

              <div className="form-group" style={{ gridColumn: '1/-1' }}>
                <label className="form-label">QRCode externo (opcional)</label>
                <input className="input" value={form.qrcode_externo} onChange={(event) => setForm((current) => ({ ...current, qrcode_externo: event.target.value }))} placeholder="URL da imagem do QRCode (se vazio, sera gerado automaticamente)." />
              </div>

              <div className="form-group" style={{ gridColumn: '1/-1' }}>
                <label className="form-label">Enviar imagem do QRCode (opcional)</label>
                <div
                  style={{
                    border: '2px dashed var(--border)',
                    borderRadius: 'var(--r)',
                    padding: '16px',
                    textAlign: 'center',
                    cursor: 'pointer',
                    background: pixQrImageData ? 'var(--blue-dim)' : 'var(--bg-3)',
                  }}
                  onClick={() => document.getElementById('pixQrImageInput').click()}
                >
                  <QrCode size={18} style={{ margin: '0 auto 8px', color: pixQrImageData ? 'var(--blue)' : 'var(--text-muted)' }} />
                  <div style={{ fontSize: 13, color: pixQrImageData ? 'var(--blue)' : 'var(--text-muted)' }}>
                    {pixQrImageName || 'Clique para selecionar a imagem do QRCode'}
                  </div>
                  <input
                    id="pixQrImageInput"
                    type="file"
                    accept="image/*"
                    style={{ display: 'none' }}
                    onChange={async (event) => {
                      const file = event.target.files?.[0]
                      if (!file) {
                        setPixQrImageData('')
                        setPixQrImageName('')
                        return
                      }

                      try {
                        const nextDataUrl = await readFileAsDataUrl(file)
                        setPixQrImageData(nextDataUrl)
                        setPixQrImageName(file.name)
                      } catch (error) {
                        setPixQrImageData('')
                        setPixQrImageName('')
                        toast(error.message || 'Nao foi possivel processar a imagem do QRCode.', 'error')
                      }
                    }}
                  />
                </div>
              </div>

              <div className="form-group" style={{ gridColumn: '1/-1' }}>
                <label className="form-label">Anexar pagamento (qrcode, comprovante, link em PDF, etc.)</label>
                <div
                  style={{
                    border: '2px dashed var(--border)',
                    borderRadius: 'var(--r)',
                    padding: '16px',
                    textAlign: 'center',
                    cursor: 'pointer',
                    background: paymentFile ? 'var(--blue-dim)' : 'var(--bg-3)',
                  }}
                  onClick={() => document.getElementById('paymentAttachmentInput').click()}
                >
                  <Upload size={18} style={{ margin: '0 auto 8px', color: paymentFile ? 'var(--blue)' : 'var(--text-muted)' }} />
                  <div style={{ fontSize: 13, color: paymentFile ? 'var(--blue)' : 'var(--text-muted)' }}>
                    {paymentFile ? paymentFile.name : 'Clique para selecionar arquivo (imagem, PDF, etc.)'}
                  </div>
                  <input
                    id="paymentAttachmentInput"
                    type="file"
                    style={{ display: 'none' }}
                    onChange={(event) => setPaymentFile(event.target.files?.[0] || null)}
                  />
                </div>
              </div>

              <div className="form-group" style={{ gridColumn: '1/-1' }}>
                <label className="form-label">Observacao</label>
                <textarea className="input" rows={3} value={form.observacao} onChange={(event) => setForm((current) => ({ ...current, observacao: event.target.value }))} placeholder="Observacoes adicionais..." />
              </div>
            </div>

            <div style={{ marginTop: 18, padding: 16, borderRadius: 10, background: '#1c2333', border: '1px solid #30363d' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontSize: 12, color: '#8b949e' }}>Resumo da emissao</div>
                  <div style={{ fontWeight: 700, fontSize: 16 }}>
                    {isCondominio ? 'Taxas condominiais' : CREATE_TYPES.find((item) => item.value === form.tipo)?.label || form.tipo}
                  </div>
                  <div style={{ fontSize: 12, color: '#8b949e', marginTop: 4 }}>
                    O morador recebera notificacao, boleto e os meios de pagamento configurados para confirmacao manual.
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 12, color: '#8b949e' }}>Total da cobranca</div>
                  <div style={{ fontWeight: 700, fontSize: 24, color: '#58a6ff' }}>{formatCurrency(previewTotal)}</div>
                  <div style={{ fontSize: 11, color: '#8b949e' }}>
                    Boleto sera gerado automaticamente por morador.
                  </div>
                </div>
              </div>
            </div>

            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setShowModal(false)}>Cancelar</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? <><Loader2 size={14} style={{ animation: 'spin .6s linear infinite' }} /> Processando...</> : 'Lancar cobranca'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
