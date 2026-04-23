import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import { resolveCondominiumSettings } from './condominium'
import { formatCurrency, formatDateLabel, formatReferenceLabel } from './billingShared'

const PAGE_WIDTH = 595.28
const PAGE_HEIGHT = 841.89
const MARGIN_X = 40

function drawText(page, font, text, x, y, size = 11, color = rgb(0.12, 0.15, 0.18)) {
  page.drawText(String(text || ''), {
    x,
    y,
    size,
    font,
    color,
  })
}

function drawLabelValue(page, { labelFont, valueFont }, label, value, x, y, size = 10) {
  drawText(page, labelFont, label, x, y, size, rgb(0.4, 0.45, 0.5))
  drawText(page, valueFont, value, x, y - 14, size + 2, rgb(0.12, 0.15, 0.18))
}

function drawSectionTitle(page, font, text, y) {
  page.drawRectangle({
    x: MARGIN_X,
    y: y - 8,
    width: PAGE_WIDTH - (MARGIN_X * 2),
    height: 26,
    color: rgb(0.93, 0.96, 0.98),
  })

  drawText(page, font, text, MARGIN_X + 12, y, 12, rgb(0.12, 0.2, 0.28))
}

function drawBreakdownRow(page, fonts, row, y) {
  drawText(page, fonts.regular, row.leftTitle, MARGIN_X + 8, y, 10)
  drawText(page, fonts.regular, row.middleTitle, MARGIN_X + 240, y, 10)
  drawText(page, fonts.bold, formatCurrency(row.value), PAGE_WIDTH - 130, y, 11)

  page.drawLine({
    start: { x: MARGIN_X, y: y - 12 },
    end: { x: PAGE_WIDTH - MARGIN_X, y: y - 12 },
    thickness: 0.7,
    color: rgb(0.88, 0.9, 0.92),
  })
}

export async function generateChargesPdf({ charges, condominium }) {
  const pdfDoc = await PDFDocument.create()
  const regular = await pdfDoc.embedFont(StandardFonts.Helvetica)
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold)
  const fonts = { regular, bold }
  const settings = resolveCondominiumSettings(condominium)

  for (const charge of charges) {
    const page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT])

    page.drawRectangle({
      x: 0,
      y: 0,
      width: PAGE_WIDTH,
      height: PAGE_HEIGHT,
      color: rgb(1, 1, 1),
    })

    page.drawRectangle({
      x: MARGIN_X,
      y: PAGE_HEIGHT - 110,
      width: PAGE_WIDTH - (MARGIN_X * 2),
      height: 82,
      color: rgb(0.95, 0.98, 0.97),
      borderColor: rgb(0.19, 0.55, 0.32),
      borderWidth: 1.2,
    })

    drawText(page, bold, 'TAXAS CONDOMINIAIS', MARGIN_X + 18, PAGE_HEIGHT - 58, 20, rgb(0.12, 0.2, 0.28))
    drawText(page, regular, 'DESCRICAO DOS CUSTOS, TAXAS E RATEIOS CONDOMINIAIS', MARGIN_X + 18, PAGE_HEIGHT - 78, 9, rgb(0.35, 0.41, 0.47))
    drawText(page, regular, 'Total a pagar:', PAGE_WIDTH - 180, PAGE_HEIGHT - 60, 10, rgb(0.35, 0.41, 0.47))
    drawText(page, bold, formatCurrency(charge.total), PAGE_WIDTH - 180, PAGE_HEIGHT - 82, 22, rgb(0.12, 0.2, 0.28))

    drawText(page, bold, `CONDOMINIO ${settings.name.toUpperCase()}`, MARGIN_X, PAGE_HEIGHT - 146, 13, rgb(0.12, 0.2, 0.28))

    drawLabelValue(page, { labelFont: regular, valueFont: bold }, 'Morador(a):', charge.nome, MARGIN_X, PAGE_HEIGHT - 180)
    drawLabelValue(page, { labelFont: regular, valueFont: bold }, 'APTO:', charge.apartamento, MARGIN_X + 250, PAGE_HEIGHT - 180)
    drawLabelValue(page, { labelFont: regular, valueFont: bold }, 'Nº:', charge.whatsapp || '-', MARGIN_X + 360, PAGE_HEIGHT - 180)
    drawLabelValue(page, { labelFont: regular, valueFont: bold }, 'OBS:', charge.observacao || 'N/A', MARGIN_X, PAGE_HEIGHT - 230)
    drawLabelValue(page, { labelFont: regular, valueFont: bold }, 'Referente a:', formatReferenceLabel(charge.reference), MARGIN_X + 250, PAGE_HEIGHT - 230)
    drawLabelValue(page, { labelFont: regular, valueFont: bold }, 'Vencimento:', formatDateLabel(charge.vencimento), MARGIN_X + 390, PAGE_HEIGHT - 230)

    drawSectionTitle(page, bold, 'DESCRICAO DOS CUSTOS, TAXAS E RATEIOS', PAGE_HEIGHT - 286)

    let rowY = PAGE_HEIGHT - 324
    for (const row of charge.breakdown) {
      drawBreakdownRow(page, fonts, row, rowY)
      rowY -= 42
    }

    drawSectionTitle(page, bold, 'FORMAS DE PAGAMENTO', rowY - 18)
    drawText(page, regular, `${settings.name} - ${settings.address}`, MARGIN_X + 12, rowY - 54, 10)
    drawText(page, regular, 'Link de Pagamento:', MARGIN_X + 12, rowY - 82, 10, rgb(0.35, 0.41, 0.47))
    drawText(page, bold, settings.pixProvider.toUpperCase(), MARGIN_X + 12, rowY - 100, 12)
    drawText(page, regular, 'Instrucoes para atraso: apos a data de vencimento, o pagamento fica disponivel no proximo mes.', MARGIN_X + 12, rowY - 130, 9, rgb(0.35, 0.41, 0.47))
    drawText(page, regular, `Chave Pix: ${settings.pixKey || 'Nao configurada'}`, MARGIN_X + 12, rowY - 156, 10)
    drawText(page, regular, `(Celular): ${settings.whatsappLabel}`, MARGIN_X + 12, rowY - 176, 10)

    if (charge.qrCodeDataUrl) {
      const qrImage = await pdfDoc.embedPng(charge.qrCodeDataUrl)
      page.drawImage(qrImage, {
        x: PAGE_WIDTH - 170,
        y: rowY - 194,
        width: 110,
        height: 110,
      })
    }
  }

  return pdfDoc.save()
}

export function downloadPdfBytes(pdfBytes, filename) {
  const blob = new Blob([pdfBytes], { type: 'application/pdf' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}
