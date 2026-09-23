import { formatCurrency, formatDateLabel, formatReferenceLabel } from './billingShared.js'

const GREEN = '#1f6b16'
const TEXT = '#123f43'

// Simbolo da marca WebCond (mesmo tracado do kit em logos/): telhado azul e visto verde.
const WEBCOND_LOGO_FALLBACK = `
  <svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 64 64">
    <g transform="translate(0 1.5)">
      <path d="M9 32 L32 12 L55 32" fill="none" stroke="#2160C4" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M21 41 L29 49 L44 34" fill="none" stroke="#3DAE4A" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>
    </g>
  </svg>
`

const PIX_QR_FALLBACK = `
  <svg xmlns="http://www.w3.org/2000/svg" width="300" height="300" viewBox="0 0 300 300">
    <rect width="300" height="300" fill="#ffffff" />
    <path d="M30 88V30h58M212 30h58v58M270 212v58h-58M88 270H30v-58" fill="none" stroke="${GREEN}" stroke-width="14" stroke-linecap="square"/>
    <text x="150" y="156" text-anchor="middle" font-family="Arial, sans-serif" font-size="24" font-weight="800" fill="${GREEN}">PIX</text>
  </svg>
`

const BANK_PHONE_ICON = `
  <svg xmlns="http://www.w3.org/2000/svg" width="118" height="156" viewBox="0 0 118 156">
    <rect x="16" y="4" width="86" height="148" rx="10" fill="#fff" stroke="#111" stroke-width="5"/>
    <path d="M50 16h18" stroke="#111" stroke-width="5" stroke-linecap="round"/>
    <path d="M50 140h18" stroke="#111" stroke-width="5" stroke-linecap="round"/>
    <rect x="27" y="28" width="64" height="94" fill="#fff" stroke="#111" stroke-width="5"/>
    <path d="M35 68 59 47l25 21H35Z" fill="#fff" stroke="#111" stroke-width="5" stroke-linejoin="round"/>
    <path d="M42 68v26h34V68" fill="#fff" stroke="#111" stroke-width="5"/>
    <circle cx="59" cy="111" r="16" fill="#fff" stroke="#111" stroke-width="5"/>
    <path d="M59 101v20M53 107c0-5 12-5 12 0 0 6-12 3-12 9 0 5 12 5 12 0" stroke="#111" stroke-width="4" stroke-linecap="round"/>
  </svg>
`

function escapeHtml(value = '') {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function toDataUri(svg) {
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`
}

function resolveLogoUrl(value = '') {
  const trimmed = String(value || '').trim()
  if (trimmed) return trimmed
  return toDataUri(WEBCOND_LOGO_FALLBACK)
}

function resolveQrCodeUrl(value = '') {
  const trimmed = String(value || '').trim()
  if (trimmed) return trimmed
  return toDataUri(PIX_QR_FALLBACK)
}

function normalizeItems(items = []) {
  return (items || [])
    .filter((item) => item && Number(item.valor || 0) > 0)
    .map((item) => ({
      nome: String(item.nome || '').trim() || 'Item',
      descricao: String(item.descricao || '').trim() || '-',
      valor: Number(item.valor || 0),
    }))
}

function normalizeOtherItems(otherItems = []) {
  if (Array.isArray(otherItems)) {
    return otherItems.map((item) => String(item || '').trim()).filter(Boolean)
  }

  if (!otherItems) return []

  return String(otherItems)
    .split(/\r?\n/)
    .map((item) => item.replace(/^[-•]\s*/, '').trim())
    .filter(Boolean)
}

function buildItemsRows(items, otherItems) {
  const rows = items.map((item) => `
    <tr class="cost-row">
      <td class="cost-name">${escapeHtml(item.nome)}</td>
      <td class="cost-description">${escapeHtml(item.descricao)}</td>
      <td class="cost-value">${escapeHtml(formatCurrency(item.valor))}</td>
    </tr>
  `)

  if (otherItems.length) {
    rows.push(`
      <tr class="cost-row">
        <td class="cost-name">OUTROS</td>
        <td class="cost-description">
          ${otherItems.map((item) => `<div>${escapeHtml(item)}</div>`).join('')}
        </td>
        <td class="cost-value">-</td>
      </tr>
    `)
  }

  return rows.join('')
}

function splitCondominiumName(value = '') {
  const normalized = String(value || '').trim()
  if (!normalized) {
    return {
      main: 'CONDOMÍNIO',
      detail: 'WEBCOND',
    }
  }

  return {
    main: 'CONDOMÍNIO',
    detail: normalized.toUpperCase(),
  }
}

export function buildChargePdfHtml(data) {
  const items = normalizeItems(data.itens)
  const otherItems = normalizeOtherItems(data.outrosItens || data.outros_itens)
  const total = Number(data.valorTotal || 0)
  const condominiumName = String(data.nomeCondominio || '').trim() || 'Condominio'
  const title = splitCondominiumName(condominiumName)
  const logoUrl = resolveLogoUrl(data.logoCondominioUrl || data.logoUrl)
  const qrCodeUrl = resolveQrCodeUrl(data.qrCodePix || data.qrcode_pix)
  const dueDateLabel = formatDateLabel(data.dataVencimento)
  const referenceLabel = data.mesReferencia?.includes('/')
    ? String(data.mesReferencia)
    : formatReferenceLabel(data.mesReferencia)
  const pixKey = String(data.pixChave || data.pixKey || data.pixEmail || 'N/A').trim()
  const pixCopyPaste = String(data.pixCopiaCola || '').trim()

  return `
  <!DOCTYPE html>
  <html lang="pt-BR">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <style>
        @page {
          size: A4;
          margin: 0;
        }

        * {
          box-sizing: border-box;
        }

        html,
        body {
          margin: 0;
          padding: 0;
          width: 210mm;
          min-height: 297mm;
          background: #ffffff;
          color: ${TEXT};
          font-family: Arial, Helvetica, sans-serif;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }

        .page {
          width: 210mm;
          min-height: 297mm;
          padding: 6mm 9mm 5mm;
          background: #ffffff;
        }

        .header {
          display: grid;
          grid-template-columns: 39mm 1fr;
          gap: 24mm;
          align-items: start;
          border-bottom: 1.2mm solid ${GREEN};
          padding-bottom: 3mm;
        }

        .logo-frame {
          width: 34mm;
          height: 34mm;
          border-radius: 999px;
          overflow: hidden;
          display: flex;
          align-items: center;
          justify-content: center;
          background: #ffffff;
        }

        .logo-frame img {
          width: 100%;
          height: 100%;
          object-fit: contain;
        }

        .title-area {
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          padding-top: 2mm;
        }

        .condo-main {
          color: ${GREEN};
          font-size: 15mm;
          line-height: .88;
          font-weight: 900;
          letter-spacing: -0.03em;
          text-transform: uppercase;
          white-space: nowrap;
        }

        .condo-detail {
          margin-top: 1.1mm;
          min-width: 72mm;
          max-width: 100%;
          background: ${GREEN};
          color: #ffffff;
          font-size: 7mm;
          line-height: 1;
          padding: 1.8mm 4.6mm 2mm;
          letter-spacing: .14em;
          text-transform: uppercase;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .tax-pill {
          margin-top: 4mm;
          background: ${GREEN};
          color: #ffffff;
          font-size: 6mm;
          line-height: 1;
          font-weight: 900;
          letter-spacing: .04em;
          text-transform: uppercase;
          border-radius: 8mm 8mm 0 0;
          padding: 2.3mm 7mm 2.2mm;
        }

        .summary {
          display: grid;
          grid-template-columns: 1fr 65mm;
          min-height: 42mm;
          border-bottom: .8mm solid ${GREEN};
          padding: 5mm 0 4mm;
        }

        .resident-info {
          display: grid;
          gap: 2.7mm;
          align-content: start;
        }

        .field {
          display: grid;
          grid-template-columns: 30mm 1fr;
          gap: 2mm;
          align-items: baseline;
        }

        .field-label {
          color: ${GREEN};
          font-size: 4.4mm;
          font-weight: 900;
        }

        .field-value {
          color: ${TEXT};
          font-size: 3.8mm;
          font-weight: 500;
          line-height: 1.25;
          word-break: break-word;
        }

        .financial-info {
          display: grid;
          grid-template-columns: 16mm 1fr;
          gap: 3.2mm 4mm;
          align-items: center;
          align-content: center;
        }

        .icon-circle {
          width: 9mm;
          height: 9mm;
          border: 1.3mm solid ${GREEN};
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          color: ${GREEN};
          font-size: 6.8mm;
          font-weight: 900;
        }

        .calendar-icon {
          width: 10.5mm;
          height: 10.5mm;
          border: .8mm solid ${GREEN};
          border-radius: 1.8mm;
          position: relative;
        }

        .calendar-icon:before {
          content: '';
          position: absolute;
          left: 0;
          right: 0;
          top: 2.6mm;
          border-top: .7mm solid ${GREEN};
        }

        .calendar-dots {
          position: absolute;
          inset: 4.1mm 1.7mm 1.7mm;
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 1.1mm;
        }

        .calendar-dots span {
          border: .55mm solid ${GREEN};
          border-radius: .7mm;
        }

        .financial-label {
          color: ${GREEN};
          font-size: 4.8mm;
          font-weight: 900;
          line-height: 1.15;
        }

        .total-value {
          color: ${GREEN};
          font-size: 7.2mm;
          line-height: 1.1;
          margin-top: 2mm;
          font-weight: 500;
        }

        .due-box {
          grid-column: 1 / -1;
          justify-self: end;
          min-width: 62mm;
          background: ${GREEN};
          color: #ffffff;
          border-radius: 7mm 7mm 0 0;
          padding: 2.7mm 4.8mm 2.5mm;
          display: flex;
          align-items: baseline;
          justify-content: space-between;
          gap: 4mm;
        }

        .due-box strong {
          font-size: 5mm;
          line-height: 1;
        }

        .due-box span {
          font-size: 6.8mm;
          line-height: 1;
        }

        .costs {
          padding-top: 4mm;
        }

        .cost-header {
          display: grid;
          grid-template-columns: 1fr 34mm;
          align-items: end;
          color: ${GREEN};
          font-size: 4.1mm;
          font-weight: 900;
          letter-spacing: .06em;
          text-transform: uppercase;
          margin-bottom: 3mm;
        }

        .cost-header .right {
          text-align: center;
        }

        table {
          width: 100%;
          border-collapse: collapse;
        }

        .cost-row {
          border-top: .35mm solid #315f64;
        }

        .cost-row:last-child {
          border-bottom: .35mm solid #315f64;
        }

        .cost-row td {
          padding: 2.7mm 1mm;
          vertical-align: middle;
        }

        .cost-name {
          width: 34mm;
          color: ${GREEN};
          font-size: 4mm;
          line-height: 1.25;
          font-weight: 900;
        }

        .cost-description {
          color: ${TEXT};
          font-size: 3.9mm;
          line-height: 1.45;
        }

        .cost-value {
          width: 34mm;
          text-align: center;
          color: ${TEXT};
          font-size: 4mm;
          line-height: 1;
          white-space: nowrap;
        }

        .payment {
          margin-top: 7mm;
        }

        .payment-title-row {
          display: flex;
          align-items: flex-end;
        }

        .payment-title {
          background: ${GREEN};
          color: #ffffff;
          border-radius: 5mm 5mm 0 0;
          font-size: 5.6mm;
          line-height: 1;
          font-weight: 900;
          letter-spacing: .05em;
          text-transform: uppercase;
          padding: 2.6mm 4mm 2.5mm;
        }

        .payment-line {
          flex: 1;
          border-bottom: .75mm solid ${GREEN};
        }

        .payment-body {
          display: grid;
          grid-template-columns: 50mm 1fr;
          gap: 9mm;
          padding: 5mm 1mm 0;
          align-items: start;
        }

        .qr-frame {
          width: 45mm;
          height: 45mm;
          padding: 4mm;
          position: relative;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .qr-frame:before,
        .qr-frame:after,
        .qr-corners:before,
        .qr-corners:after {
          content: '';
          position: absolute;
          width: 14mm;
          height: 14mm;
          border-color: ${GREEN};
          border-style: solid;
        }

        .qr-frame:before {
          left: 0;
          top: 0;
          border-width: 2.4mm 0 0 2.4mm;
        }

        .qr-frame:after {
          right: 0;
          top: 0;
          border-width: 2.4mm 2.4mm 0 0;
        }

        .qr-corners:before {
          left: 0;
          bottom: 0;
          border-width: 0 0 2.4mm 2.4mm;
        }

        .qr-corners:after {
          right: 0;
          bottom: 0;
          border-width: 0 2.4mm 2.4mm 0;
        }

        .qr-frame img {
          width: 35mm;
          height: 35mm;
          object-fit: contain;
        }

        .pix-area {
          display: grid;
          grid-template-columns: 22mm 1fr;
          gap: 6mm;
          align-items: center;
          padding-top: 3mm;
        }

        .bank-icon img {
          width: 20mm;
          height: auto;
        }

        .pix-title {
          color: ${GREEN};
          font-size: 7mm;
          line-height: 1;
          font-weight: 900;
        }

        .pix-key {
          margin-top: 2mm;
          color: ${TEXT};
          font-size: 3.3mm;
          line-height: 1.35;
          word-break: break-word;
        }

        .instruction {
          grid-column: 1 / -1;
          color: ${TEXT};
          font-size: 3.8mm;
          line-height: 1.45;
          margin-top: 5mm;
        }

        .instruction strong {
          font-weight: 900;
        }

        .footer {
          margin-top: 4mm;
          border-top: .75mm solid ${GREEN};
          padding-top: 3.2mm;
          color: ${TEXT};
          text-align: center;
          font-size: 3.6mm;
          letter-spacing: .06em;
          text-transform: uppercase;
        }

        .copy-paste {
          margin-top: 1mm;
          color: ${TEXT};
          font-size: 2.6mm;
          line-height: 1.3;
          word-break: break-all;
        }
      </style>
    </head>
    <body>
      <main class="page">
        <section class="header">
          <div class="logo-frame">
            <img src="${escapeHtml(logoUrl)}" alt="Logo WebCond" />
          </div>

          <div class="title-area">
            <div class="condo-main">${escapeHtml(title.main)}</div>
            <div class="condo-detail">${escapeHtml(title.detail)}</div>
            <div class="tax-pill">Taxas Condominiais</div>
          </div>
        </section>

        <section class="summary">
          <div class="resident-info">
            <div class="field">
              <div class="field-label">Morador(a):</div>
              <div class="field-value">${escapeHtml(data.nomeMorador || '-')}</div>
            </div>
            <div class="field">
              <div class="field-label">APTO:</div>
              <div class="field-value">${escapeHtml(data.apartamento || '-')}</div>
            </div>
            <div class="field">
              <div class="field-label">Nº:</div>
              <div class="field-value">${escapeHtml(data.numero || data.telefone || '-')}</div>
            </div>
            <div class="field">
              <div class="field-label">OBS:</div>
              <div class="field-value">${escapeHtml(data.observacoes || 'N/A')}</div>
            </div>
          </div>

          <div class="financial-info">
            <div class="icon-circle">$</div>
            <div>
              <div class="financial-label">Total a pagar:</div>
              <div class="total-value">${escapeHtml(formatCurrency(total))}</div>
            </div>

            <div class="calendar-icon">
              <div class="calendar-dots">
                <span></span><span></span><span></span><span></span>
                <span></span><span></span><span></span><span></span>
                <span></span><span></span><span></span><span></span>
              </div>
            </div>
            <div>
              <div class="financial-label">Referente a:</div>
              <div class="field-value" style="margin-top:2mm;">${escapeHtml(referenceLabel || '-')}</div>
            </div>

            <div class="due-box">
              <strong>Vencimento</strong>
              <span>${escapeHtml(dueDateLabel)}</span>
            </div>
          </div>
        </section>

        <section class="costs">
          <div class="cost-header">
            <div>Descrição dos custos, taxas e rateios condominiais</div>
            <div class="right">Valores</div>
          </div>

          <table>
            <tbody>
              ${buildItemsRows(items, otherItems)}
            </tbody>
          </table>
        </section>

        <section class="payment">
          <div class="payment-title-row">
            <div class="payment-title">Formas de pagamento</div>
            <div class="payment-line"></div>
          </div>

          <div class="payment-body">
            <div class="qr-frame">
              <div class="qr-corners"></div>
              <img src="${escapeHtml(qrCodeUrl)}" alt="QRCode Pix" />
            </div>

            <div>
              <div class="pix-area">
                <div class="bank-icon">
                  <img src="${escapeHtml(toDataUri(BANK_PHONE_ICON))}" alt="" />
                </div>
                <div>
                  <div class="pix-title">Chave Pix :</div>
                  <div class="pix-key">${escapeHtml(pixKey)}</div>
                </div>
                <div class="instruction">
                  <strong>Instruções para atraso:</strong> Após a data de vencimento o pagamento fica disponível no próximo mês
                </div>
                ${pixCopyPaste ? `<div class="copy-paste">Pix copia e cola: ${escapeHtml(pixCopyPaste)}</div>` : ''}
              </div>
            </div>
          </div>
        </section>

        <footer class="footer">
          ${escapeHtml(data.enderecoCondominio || 'Localização cadastrada do condomínio')}
        </footer>
      </main>
    </body>
  </html>
  `
}
