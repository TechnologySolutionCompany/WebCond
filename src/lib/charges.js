import { supabase } from './supabase'

const SIGNED_URL_TTL_SECONDS = 60 * 60

function sanitizePath(path = '') {
  return String(path).trim().replace(/^\/+/, '')
}

function sanitizeFileName(fileName = '') {
  const normalized = String(fileName)
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')

  return normalized || 'arquivo'
}

export function buildChargeStorageFileName(fileName = '', folder = 'geral') {
  const safeFolder = sanitizeFileName(folder).toLowerCase()
  const safeName = sanitizeFileName(fileName)
  return `${safeFolder}/${Date.now()}-${safeName}`
}

export function extractChargeStoragePathFromUrl(url = '') {
  if (!url) return ''

  try {
    const parsed = new URL(url)
    const match = parsed.pathname.match(/\/storage\/v1\/object\/(?:public|sign)\/cobrancas\/(.+)$/)
    return match?.[1] ? decodeURIComponent(match[1]) : ''
  } catch {
    return ''
  }
}

async function createChargeSignedUrl(path = '', fallbackUrl = '') {
  const safePath = sanitizePath(path)
  if (!safePath) return fallbackUrl || ''

  const { data, error } = await supabase
    .storage
    .from('cobrancas')
    .createSignedUrl(safePath, SIGNED_URL_TTL_SECONDS)

  if (error) return fallbackUrl || ''
  return data?.signedUrl || fallbackUrl || ''
}

export function isChargeImageUrl(url = '') {
  if (!url) return false
  return /\.(png|jpe?g|webp|gif|bmp|svg)(\?|$)/i.test(String(url)) || String(url).startsWith('data:image/')
}

export async function enrichChargesWithPaymentUrls(charges = []) {
  return Promise.all(
    (charges || []).map(async (charge) => {
      const pagamentoAnexoPath = sanitizePath(charge?.pagamento_anexo_path || extractChargeStoragePathFromUrl(charge?.pagamento_anexo_url))
      const boletoPath = sanitizePath(charge?.boleto_path || extractChargeStoragePathFromUrl(charge?.boleto_url))

      const [pagamentoAnexoDownloadUrl, boletoDownloadUrl] = await Promise.all([
        createChargeSignedUrl(pagamentoAnexoPath, charge?.pagamento_anexo_url || ''),
        createChargeSignedUrl(boletoPath, charge?.boleto_url || ''),
      ])

      const pixQrPreview = charge?.pix_qr_code
        || charge?.pix_qrcode_url
        || (isChargeImageUrl(pagamentoAnexoDownloadUrl) ? pagamentoAnexoDownloadUrl : '')

      return {
        ...charge,
        pagamento_anexo_path: pagamentoAnexoPath,
        boleto_path: boletoPath,
        pagamento_anexo_download_url: pagamentoAnexoDownloadUrl,
        boleto_download_url: boletoDownloadUrl,
        pix_qr_preview: pixQrPreview,
      }
    }),
  )
}
