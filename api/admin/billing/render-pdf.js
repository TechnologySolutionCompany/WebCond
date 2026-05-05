import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import QRCode from 'qrcode'
import { requireCondominiumAdmin, json, parseJsonBody, supabaseAdmin } from '../../_lib/supabaseAdmin.js'
import { resolveCondominiumSettings } from '../../../src/lib/condominium.js'
import { buildChargePdfHtml } from '../../../src/lib/billingPdfTemplate.js'

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
    .select('id, name, nome, address, endereco, pix_key, chave_pix, whatsapp, bank_details, metadata')
    .eq('id', condominiumId)
    .maybeSingle()

  if (error || !data) {
    return null
  }

  return data
}

async function renderPdfBuffer(html) {
  const puppeteerModule = await import('puppeteer')
  const puppeteer = puppeteerModule.default || puppeteerModule
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  })

  try {
    const page = await browser.newPage()
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

export async function POST(req) {
  const auth = await requireCondominiumAdmin(req)
  if (auth.error) return auth.error

  const body = await parseJsonBody(req)
  if (!body) {
    return json({ error: 'Corpo da requisicao invalido.' }, 400)
  }

  const items = sanitizeItems(body.itens)
  if (items.length === 0) {
    return json({ error: 'Informe ao menos um item valido para gerar o boleto.' }, 400)
  }

  const condominium = await loadCondominiumData(auth.profile.condominium_id)
  if (!condominium) {
    return json({ error: 'Nao foi possivel carregar os dados do condominio para gerar o boleto.' }, 404)
  }

  const settings = resolveCondominiumSettings(condominium)

  const pixCopyPasteCode = sanitizeText(body.pixCopiaCola || body.pix_copy_paste_code)
  const qrCodePix = sanitizeText(body.qrCodePix || body.qrcode_pix)
    || (pixCopyPasteCode ? await QRCode.toDataURL(pixCopyPasteCode) : '')

  const pixDetails = buildPixDetails(
    settings.pixKey,
    settings.whatsappLabel,
    settings.bankDestination,
  )

  const html = buildChargePdfHtml({
    nomeCondominio: settings.name,
    enderecoCondominio: settings.address,
    logoCondominioUrl: loadWebcondLogoDataUri(),
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
    return json({ error: error?.message || 'Nao foi possivel gerar o PDF do boleto.' }, 500)
  }
}
