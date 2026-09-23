import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import { resolveCondominiumSettings } from './condominium'
import { formatCurrency, formatDateLabel, formatReferenceLabel } from './billingShared'

const PAGE_WIDTH = 595.28
const PAGE_HEIGHT = 841.89
const GREEN = rgb(0.12, 0.42, 0.09)
// Marca WebCond: azul #2160C4 e verde #3DAE4A.
const BRAND_BLUE = rgb(0.129, 0.376, 0.769)
const BRAND_GREEN = rgb(0.239, 0.682, 0.290)
const TEXT = rgb(0.07, 0.25, 0.26)
const LINE = rgb(0.18, 0.38, 0.4)
const WHITE = rgb(1, 1, 1)
const MARGIN_X = 22

function asText(value = '') {
  return String(value || '').replace(/\s+/g, ' ').trim()
}

function drawText(page, font, text, x, y, size = 11, color = TEXT) {
  page.drawText(asText(text), {
    x,
    y,
    size,
    font,
    color,
  })
}

function drawCenteredText(page, font, text, x, y, width, size = 11, color = TEXT) {
  const content = asText(text)
  const textWidth = font.widthOfTextAtSize(content, size)
  drawText(page, font, content, x + ((width - textWidth) / 2), y, size, color)
}

function drawFittedText(page, font, text, x, y, maxWidth, preferredSize, minSize, color = TEXT) {
  const content = asText(text)
  let size = preferredSize

  while (size > minSize && font.widthOfTextAtSize(content, size) > maxWidth) {
    size -= 0.5
  }

  drawText(page, font, content, x, y, size, color)
}

function wrapText(text, font, size, maxWidth, maxLines = 3) {
  const words = asText(text).split(' ').filter(Boolean)
  const lines = []
  let current = ''

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      current = candidate
      continue
    }

    if (current) lines.push(current)
    current = word

    if (lines.length === maxLines - 1) break
  }

  if (current && lines.length < maxLines) lines.push(current)
  return lines.length ? lines : ['-']
}

function drawWrappedText(page, font, text, x, y, size, color, maxWidth, lineHeight = 14, maxLines = 3) {
  const lines = wrapText(text, font, size, maxWidth, maxLines)
  lines.forEach((line, index) => {
    drawText(page, font, line, x, y - (index * lineHeight), size, color)
  })
  return y - (lines.length * lineHeight)
}

function drawHeader(page, fonts, settings, logoImage) {
  const logoX = 31
  const logoY = 722
  const logoSize = 94

  page.drawCircle({
    x: logoX + (logoSize / 2),
    y: logoY + (logoSize / 2),
    size: logoSize / 2,
    color: WHITE,
  })

  if (logoImage) {
    // O simbolo e quadrado: desenha sem esticar, centralizado no circulo branco.
    page.drawImage(logoImage, {
      x: logoX + 11,
      y: logoY + 11,
      width: 72,
      height: 72,
    })
  } else {
    drawCenteredText(page, fonts.bold, 'Web', logoX, logoY + 53, logoSize, 19, BRAND_BLUE)
    drawCenteredText(page, fonts.bold, 'Cond', logoX, logoY + 32, logoSize, 19, BRAND_GREEN)
  }

  const titleX = 362
  drawFittedText(page, fonts.bold, 'CONDOMÍNIO', titleX, 790, 208, 32, 24, GREEN)

  page.drawRectangle({
    x: titleX,
    y: 752,
    width: 210,
    height: 35,
    color: GREEN,
  })
  drawFittedText(page, fonts.regular, settings.name.toUpperCase(), titleX + 12, 762, 186, 21, 11, WHITE)

  page.drawRectangle({
    x: titleX,
    y: 707,
    width: 210,
    height: 29,
    color: GREEN,
  })
  drawCenteredText(page, fonts.bold, 'TAXAS CONDOMINIAIS', titleX, 716, 210, 16, WHITE)

  page.drawLine({
    start: { x: MARGIN_X, y: 704 },
    end: { x: PAGE_WIDTH - MARGIN_X, y: 704 },
    thickness: 1.6,
    color: GREEN,
  })
}

function drawField(page, fonts, label, value, x, y, valueMaxWidth = 260) {
  drawText(page, fonts.bold, label, x, y, 12, GREEN)
  drawWrappedText(page, fonts.regular, value || '-', x + 72, y, 11, TEXT, valueMaxWidth, 13, 2)
}

function drawSummary(page, fonts, charge) {
  drawField(page, fonts, 'Morador(a):', charge.nome || '-', 25, 669)
  drawField(page, fonts, 'APTO:', charge.apartamento || '-', 25, 648)
  drawField(page, fonts, 'Nº:', charge.whatsapp || '-', 25, 627)
  drawField(page, fonts, 'OBS:', charge.observacao || 'N/A', 25, 606)

  page.drawCircle({
    x: 414,
    y: 658,
    size: 13,
    borderColor: GREEN,
    borderWidth: 3,
  })
  drawCenteredText(page, fonts.bold, '$', 401, 648, 26, 18, GREEN)
  drawText(page, fonts.bold, 'Total a pagar:', 438, 667, 13, GREEN)
  drawText(page, fonts.regular, formatCurrency(charge.total), 438, 642, 24, GREEN)

  page.drawRectangle({
    x: 402,
    y: 588,
    width: 28,
    height: 28,
    borderColor: GREEN,
    borderWidth: 2,
  })
  drawText(page, fonts.bold, 'Referente a:', 446, 603, 14, GREEN)
  drawText(page, fonts.regular, formatReferenceLabel(charge.reference), 446, 582, 11, TEXT)

  page.drawRectangle({
    x: 362,
    y: 537,
    width: 210,
    height: 32,
    color: GREEN,
  })
  drawText(page, fonts.bold, 'Vencimento', 372, 548, 14, WHITE)
  drawText(page, fonts.regular, formatDateLabel(charge.vencimento), 459, 544, 22, WHITE)

  page.drawLine({
    start: { x: MARGIN_X, y: 537 },
    end: { x: PAGE_WIDTH - MARGIN_X, y: 537 },
    thickness: 1.4,
    color: GREEN,
  })
}

function drawCostHeader(page, fonts) {
  drawText(page, fonts.bold, 'DESCRIÇÃO DOS CUSTOS, TAXAS E RATEIOS CONDOMINIAIS', 22, 511, 11, GREEN)
  drawText(page, fonts.bold, 'VALORES', 496, 511, 11, GREEN)
}

function drawBreakdownRow(page, fonts, row, y) {
  page.drawLine({
    start: { x: MARGIN_X, y },
    end: { x: PAGE_WIDTH - MARGIN_X, y },
    thickness: 0.8,
    color: LINE,
  })

  drawWrappedText(page, fonts.bold, row.leftTitle, 25, y - 21, 11, GREEN, 85, 13, 2)
  drawWrappedText(page, fonts.regular, row.middleTitle, 122, y - 21, 11, TEXT, 348, 14, 3)
  drawText(page, fonts.regular, formatCurrency(row.value), 501, y - 21, 11, TEXT)
}

function drawCornerFrame(page, x, y, size) {
  const corner = 48
  const thickness = 7
  const top = y + size
  const right = x + size

  page.drawLine({ start: { x, y: top }, end: { x: x + corner, y: top }, thickness, color: GREEN })
  page.drawLine({ start: { x, y: top }, end: { x, y: top - corner }, thickness, color: GREEN })
  page.drawLine({ start: { x: right - corner, y: top }, end: { x: right, y: top }, thickness, color: GREEN })
  page.drawLine({ start: { x: right, y: top }, end: { x: right, y: top - corner }, thickness, color: GREEN })
  page.drawLine({ start: { x, y }, end: { x: x + corner, y }, thickness, color: GREEN })
  page.drawLine({ start: { x, y }, end: { x, y: y + corner }, thickness, color: GREEN })
  page.drawLine({ start: { x: right - corner, y }, end: { x: right, y }, thickness, color: GREEN })
  page.drawLine({ start: { x: right, y }, end: { x: right, y: y + corner }, thickness, color: GREEN })
}

function drawPhoneBankIcon(page, fonts, x, y) {
  page.drawRectangle({
    x,
    y,
    width: 62,
    height: 86,
    borderColor: rgb(0, 0, 0),
    borderWidth: 2.4,
  })
  page.drawRectangle({
    x: x + 8,
    y: y + 13,
    width: 46,
    height: 59,
    borderColor: rgb(0, 0, 0),
    borderWidth: 2,
  })
  drawCenteredText(page, fonts.bold, 'BANCO', x + 8, y + 49, 46, 8, rgb(0, 0, 0))
  drawCenteredText(page, fonts.bold, '$', x + 8, y + 27, 46, 16, rgb(0, 0, 0))
}

async function drawPayment(page, fonts, pdfDoc, charge, settings, paymentY) {
  page.drawRectangle({
    x: 19,
    y: paymentY,
    width: 215,
    height: 31,
    color: GREEN,
  })
  drawCenteredText(page, fonts.bold, 'FORMAS DE PAGAMENTO', 19, paymentY + 9, 215, 16, WHITE)
  page.drawLine({
    start: { x: 234, y: paymentY },
    end: { x: PAGE_WIDTH - MARGIN_X, y: paymentY },
    thickness: 1.2,
    color: GREEN,
  })

  const qrX = 28
  const qrY = paymentY - 153
  const qrSize = 132
  drawCornerFrame(page, qrX, qrY, qrSize)

  if (charge.qrCodeDataUrl) {
    try {
      const qrImage = await pdfDoc.embedPng(charge.qrCodeDataUrl)
      page.drawImage(qrImage, {
        x: qrX + 23,
        y: qrY + 23,
        width: 86,
        height: 86,
      })
    } catch {
      drawCenteredText(page, fonts.bold, 'PIX', qrX, qrY + 61, qrSize, 18, GREEN)
    }
  } else {
    drawCenteredText(page, fonts.bold, 'PIX', qrX, qrY + 61, qrSize, 18, GREEN)
  }

  drawPhoneBankIcon(page, fonts, 224, paymentY - 107)
  drawText(page, fonts.bold, 'Chave Pix :', 295, paymentY - 61, 24, GREEN)
  drawWrappedText(page, fonts.regular, settings.pixKey || 'Não configurada', 295, paymentY - 84, 10, TEXT, 244, 12, 3)

  drawWrappedText(
    page,
    fonts.regular,
    'Instruções para atraso: Após a data de vencimento o pagamento fica disponível no próximo mês',
    214,
    paymentY - 151,
    12,
    TEXT,
    346,
    17,
    3,
  )
}

function drawFooter(page, fonts, settings) {
  page.drawLine({
    start: { x: MARGIN_X, y: 45 },
    end: { x: PAGE_WIDTH - MARGIN_X, y: 45 },
    thickness: 1.2,
    color: GREEN,
  })
  drawCenteredText(page, fonts.regular, settings.address || 'LOCALIZAÇÃO CADASTRADA DO CONDOMÍNIO', 25, 26, 545, 12, TEXT)
}

async function embedWebcondLogo(pdfDoc) {
  if (typeof fetch !== 'function') return null

  try {
    const response = await fetch('/logo.png')
    if (!response.ok) return null
    return await pdfDoc.embedPng(await response.arrayBuffer())
  } catch {
    return null
  }
}

function resolveSettings(condominium) {
  const resolved = resolveCondominiumSettings(condominium)

  return {
    ...resolved,
    name: condominium?.name || resolved.name,
    address: condominium?.address || resolved.address,
    pixKey: condominium?.pixKey || resolved.pixKey,
    whatsappLabel: condominium?.whatsappLabel || resolved.whatsappLabel,
  }
}

export async function generateChargesPdf({ charges, condominium }) {
  const pdfDoc = await PDFDocument.create()
  const regular = await pdfDoc.embedFont(StandardFonts.Helvetica)
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold)
  const fonts = { regular, bold }
  const settings = resolveSettings(condominium)
  const logoImage = await embedWebcondLogo(pdfDoc)

  for (const charge of charges) {
    const page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT])

    page.drawRectangle({
      x: 0,
      y: 0,
      width: PAGE_WIDTH,
      height: PAGE_HEIGHT,
      color: WHITE,
    })

    drawHeader(page, fonts, settings, logoImage)
    drawSummary(page, fonts, charge)
    drawCostHeader(page, fonts)

    let rowY = 494
    for (const row of charge.breakdown) {
      drawBreakdownRow(page, fonts, row, rowY)
      rowY -= 46
    }

    page.drawLine({
      start: { x: MARGIN_X, y: rowY + 10 },
      end: { x: PAGE_WIDTH - MARGIN_X, y: rowY + 10 },
      thickness: 0.8,
      color: LINE,
    })

    await drawPayment(page, fonts, pdfDoc, charge, settings, Math.min(rowY - 28, 236))
    drawFooter(page, fonts, settings)
  }

  return pdfDoc.save()
}

