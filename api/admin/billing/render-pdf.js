import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import QRCode from 'qrcode'
import { requireCondominiumAdmin, json, parseJsonBody, rejectForeignOrigin, supabaseAdmin } from '../../_lib/supabaseAdmin.js'
import { resolveCondominiumSettings } from '../../../src/lib/condominium.js'
import { buildChargePdfHtml } from '../../../src/lib/billingPdfTemplate.js'
import { condominiumHasResource } from '../../../src/lib/condominiumPlan.js'
import { montarDadosFatura } from '../../../src/lib/faturaDados.js'
import { montarPixCopiaECola, normalizarChavePix } from '../../../src/lib/pix.js'
import { lerRecebimento } from '../../../src/lib/recebimento.js'
import { bloquearRedeExterna, gerarFaturaPdf } from '../../_lib/fatura/render.js'

let webcondLogoDataUri = null

function loadWebcondLogoDataUri() {
  if (webcondLogoDataUri !== null) return webcondLogoDataUri

  const logoPath = resolve(process.cwd(), 'public', 'logo.png')
  webcondLogoDataUri = ''

  if (existsSync(logoPath)) {
    const logoBase64 = readFileSync(logoPath).toString('base64')
    webcondLogoDataUri = `data:image/png;base64,${logoBase64}`
  }

  return webcondLogoDataUri
}

// Logo do proprio condominio no boleto: so nos planos que preveem personalizacao (MAX, Parceria)
// e so a imagem cadastrada pela plataforma. Qualquer falha cai na logo do WebCond.
const LOGO_TYPES = { png: 'image/png', webp: 'image/webp', jpg: 'image/jpeg', jpeg: 'image/jpeg' }

async function loadCondominiumLogoDataUri(condominium) {
  const path = String(condominium?.metadata?.logo_path || '')
  if (!path) return ''

  if (!condominiumHasResource(condominium, 'logoNoBoleto')) return ''

  try {
    const { data, error } = await supabaseAdmin.storage.from('condominios').download(path)
    if (error || !data) return ''
    const buffer = Buffer.from(await data.arrayBuffer())
    if (!buffer.length || buffer.length > 2 * 1024 * 1024) return ''
    const type = LOGO_TYPES[path.split('.').pop()?.toLowerCase()] || 'image/png'
    return `data:${type};base64,${buffer.toString('base64')}`
  } catch {
    return ''
  }
}

function sanitizeText(value = '', fallback = '') {
  const normalized = String(value || '').trim()
  return normalized || fallback
}

function sanitizeItems(items = []) {
  return (Array.isArray(items) ? items : [])
    .map((item) => ({
      nome: sanitizeText(item?.nome, 'Item'),
      descricao: sanitizeText(item?.descricao, '-'),
      valor: Number(item?.valor || 0),
    }))
    .filter((item) => item.valor > 0)
}

function isLikelyPhoneNumber(value = '') {
  const digits = String(value || '').replace(/\D/g, '')
  return digits.length >= 10 && digits.length <= 13
}

function buildPixDetails(pixKey, fallbackPhone, bankDestination) {
  const normalizedPixKey = sanitizeText(pixKey)
  const phoneValue = isLikelyPhoneNumber(normalizedPixKey)
    ? normalizedPixKey
    : sanitizeText(fallbackPhone || bankDestination, 'N/A')

  return {
    pixChave: normalizedPixKey || 'Nao informado',
    pixTelefone: phoneValue,
    bancoDestinoPix: sanitizeText(bankDestination, 'Nao informado'),
  }
}

async function loadCondominiumData(condominiumId) {
  const { data, error } = await supabaseAdmin
    .from('condominiums')
    .select('id, name, nome, cnpj, address, endereco, pix_key, chave_pix, whatsapp, bank_details, metadata, status, created_at, updated_at')
    .eq('id', condominiumId)
    .maybeSingle()

  if (error || !data) {
    return null
  }

  return data
}

// Na Vercel usa o Chromium enxuto do @sparticuz/chromium; localmente usa o Chrome instalado
// (ou o caminho definido em CHROME_EXECUTABLE_PATH).
async function launchBrowser() {
  const { default: puppeteer } = await import('puppeteer-core')

  if (process.env.VERCEL) {
    const { default: chromium } = await import('@sparticuz/chromium')
    return puppeteer.launch({
      args: chromium.args,
      executablePath: await chromium.executablePath(),
      headless: true,
    })
  }

  const executablePath = process.env.CHROME_EXECUTABLE_PATH
  return puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    ...(executablePath ? { executablePath } : { channel: 'chrome' }),
  })
}

async function renderPdfBuffer(html) {
  const browser = await launchBrowser()

  try {
    const page = await browser.newPage()
    await bloquearRedeExterna(page)
    await page.setContent(html, { waitUntil: 'networkidle0' })

    return await page.pdf({
      format: 'A4',
      preferCSSPageSize: true,
      printBackground: true,
      margin: {
        top: '0',
        right: '0',
        bottom: '0',
        left: '0',
      },
    })
  } finally {
    await browser.close()
  }
}

function formatarDocumento(valor = '') {
  const d = String(valor || '').replace(/\D/g, '')
  if (d.length === 14) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`
  if (d.length === 11) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`
  return valor || ''
}

// Itens da fatura nova: cada um com titulo, descricao, tipo (TAXA CONDOMINIAL, RATEIO...) e origem.
function itensDaFatura(items = []) {
  return (Array.isArray(items) ? items : [])
    .map((item) => ({
      titulo: sanitizeText(item?.titulo || item?.nome, 'Item').slice(0, 120),
      descricao: sanitizeText(item?.descricao, '').slice(0, 300),
      tipo: sanitizeText(item?.tipo, 'TAXA').slice(0, 40),
      origem: sanitizeText(item?.origem, '').slice(0, 60),
      valor: Number(item?.valor || 0),
    }))
    .filter((item) => Number.isFinite(item.valor) && item.valor > 0)
}

// Modelo novo (v1.09A5): fatura-template.html + dados do banco. O grafico dos 3 meses e as
// unidades em aberto vem das cobrancas do proprio condominio (o sindico so ve as dele).
async function renderFatura(body, condominium, settings) {
  const itens = itensDaFatura(body.itens)
  if (!itens.length) return json({ error: 'Informe ao menos um item valido para gerar a fatura.' }, 400)

  const referencia = /^\d{4}-\d{2}$/.test(String(body.mesReferencia || '')) ? body.mesReferencia : ''
  const unidade = sanitizeText(body.unidade || body.apartamento, '').slice(0, 20)
  const total = itens.reduce((soma, item) => soma + item.valor, 0)
  const recebimento = lerRecebimento(condominium.metadata)
  const cidade = condominium.metadata?.address_details?.city || ''

  const { data: cobrancas } = await supabaseAdmin
    .from('cobrancas')
    .select('unidade_numero, mes_referencia, vencimento, pago, payment_status, created_at')
    .or(`condominium_id.eq.${condominium.id},condominio_id.eq.${condominium.id}`)
    .limit(5000)

  const chave = normalizarChavePix(settings.pixKey)
  // Pix gerado sozinho a partir da chave e recurso do Plano Pro (v2.10A1). No ONE vale o que o
  // sindico colou ou a imagem do QR que ele enviou; a chave aparece escrita do mesmo jeito.
  const pixAutomatico = condominiumHasResource(condominium, 'pixAutomatico')
  const copiaECola = sanitizeText(body.pixCopiaCola || body.pix_copy_paste_code)
    || (pixAutomatico ? montarPixCopiaECola({ chave: settings.pixKey, valor: total, nome: settings.name, cidade, txid: `${referencia}${unidade}`, descricao: `Unidade ${unidade}` }) : '')
  const qrEnviado = sanitizeText(body.qrCodePix || body.qrcode_pix)
  const qrcode = qrEnviado.startsWith('data:image/') ? qrEnviado : (copiaECola ? await QRCode.toDataURL(copiaECola, { margin: 1, width: 360 }) : '')

  const dados = montarDadosFatura({
    condominio: {
      nome: settings.name,
      endereco: settings.address,
      cnpj: formatarDocumento(condominium.cnpj),
      logo_url: (await loadCondominiumLogoDataUri(condominium)) || loadWebcondLogoDataUri(),
    },
    morador: {
      nome: sanitizeText(body.nomeMorador, 'Morador(a)'),
      contato: sanitizeText(body.numero || body.telefone, ''),
      unidade,
      bloco: sanitizeText(body.bloco, 'Bloco unico'),
      obs: sanitizeText(body.observacoes, 'N/A'),
    },
    referencia,
    vencimento: sanitizeText(body.dataVencimento),
    itens,
    cobrancasDoCondominio: cobrancas || [],
    mostrarUnidadesAbertas: recebimento.mostrarUnidadesAbertas,
    pagamento: {
      chave: chave?.chave || settings.pixKey,
      tipoChave: chave?.tipo,
      copiaECola,
      qrcode,
      link: /^https:\/\//.test(String(body.linkPagamento || '')) ? String(body.linkPagamento) : '',
      banco: settings.bankDestination,
      instrucoes: recebimento.instrucoes,
    },
  })

  try {
    const pdfBuffer = await gerarFaturaPdf(dados)
    return new Response(pdfBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="fatura-${dados.fatura.numero}.pdf"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (error) {
    // Detalhe tecnico (caminho do Chromium, timeout interno) fica so no log do servidor.
    console.error('render-pdf fatura:', error)
    return json({ error: 'Nao foi possivel gerar o PDF da fatura.' }, 500)
  }
}

export async function POST(req) {
  const originError = rejectForeignOrigin(req)
  if (originError) return originError

  const auth = await requireCondominiumAdmin(req)
  if (auth.error) return auth.error

  const body = await parseJsonBody(req)
  if (!body) {
    return json({ error: 'Corpo da requisicao invalido.' }, 400)
  }

  const condominium = await loadCondominiumData(auth.profile.condominium_id)
  if (!condominium) {
    return json({ error: 'Nao foi possivel carregar os dados do condominio para gerar o boleto.' }, 404)
  }

  const settings = resolveCondominiumSettings(condominium)
  if (body.modelo === 'fatura') return renderFatura(body, condominium, settings)

  const items = sanitizeItems(body.itens)
  if (items.length === 0) {
    return json({ error: 'Informe ao menos um item valido para gerar o boleto.' }, 400)
  }

  const pixCopyPasteCode = sanitizeText(body.pixCopiaCola || body.pix_copy_paste_code)
  // So imagem embutida (data:image/...). Uma URL aqui faria o servidor busca-la (SSRF).
  const qrEnviado = sanitizeText(body.qrCodePix || body.qrcode_pix)
  const qrCodePix = (qrEnviado.startsWith('data:image/') ? qrEnviado : '')
    || (pixCopyPasteCode ? await QRCode.toDataURL(pixCopyPasteCode) : '')

  const pixDetails = buildPixDetails(
    settings.pixKey,
    settings.whatsappLabel,
    settings.bankDestination,
  )

  const html = buildChargePdfHtml({
    nomeCondominio: settings.name,
    enderecoCondominio: settings.address,
    logoCondominioUrl: (await loadCondominiumLogoDataUri(condominium)) || loadWebcondLogoDataUri(),
    nomeMorador: sanitizeText(body.nomeMorador, 'Morador'),
    apartamento: sanitizeText(body.apartamento, '-'),
    numero: sanitizeText(body.numero || body.telefone, '-'),
    observacoes: sanitizeText(body.observacoes, 'N/A'),
    valorTotal: Number(body.valorTotal || 0),
    mesReferencia: sanitizeText(body.mesReferencia),
    dataVencimento: sanitizeText(body.dataVencimento),
    itens: items,
    outrosItens: body.outrosItens || body.outros_itens || [],
    qrcode_pix: qrCodePix,
    pixCopiaCola: pixCopyPasteCode || 'Nao informado',
    linkPagamento: sanitizeText(body.linkPagamento || body.link_pagamento),
    ...pixDetails,
  })

  try {
    const pdfBuffer = await renderPdfBuffer(html)

    return new Response(pdfBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'inline; filename="boleto-webcond.pdf"',
        'Cache-Control': 'no-store',
      },
    })
  } catch (error) {
    console.error('render-pdf boleto:', error)
    return json({ error: 'Nao foi possivel gerar o PDF do boleto.' }, 500)
  }
}
