import { supabase } from './supabase'

const SIGNED_URL_TTL_SECONDS = 60 * 60

function sanitizePath(path = '') {
  return String(path).trim().replace(/^\/+/, '')
}

// Caminho sempre dentro da pasta do condominio: o Storage so libera arquivos da propria pasta.
export function buildStorageFileName(fileName = '', condominiumId = '') {
  if (!condominiumId) throw new Error('Condominio nao identificado para salvar o arquivo.')
  const normalized = String(fileName)
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')

  const safeName = normalized || 'documento'
  return `${condominiumId}/${Date.now()}-${safeName}`
}

export function extractStoragePathFromUrl(url = '') {
  if (!url) return ''

  try {
    const parsed = new URL(url)
    const match = parsed.pathname.match(/\/storage\/v1\/object\/(?:public|sign)\/documentos\/(.+)$/)
    return match?.[1] ? decodeURIComponent(match[1]) : ''
  } catch {
    return ''
  }
}

export async function createDocumentDownloadUrl(documento) {
  const arquivoPath = sanitizePath(documento?.arquivo_path || extractStoragePathFromUrl(documento?.arquivo_url))
  if (!arquivoPath) {
    return documento?.arquivo_url || ''
  }

  const { data, error } = await supabase
    .storage
    .from('documentos')
    .createSignedUrl(arquivoPath, SIGNED_URL_TTL_SECONDS)

  if (error) {
    return documento?.arquivo_url || ''
  }

  return data?.signedUrl || documento?.arquivo_url || ''
}

export async function enrichDocumentsWithDownloadUrl(documentos = []) {
  return Promise.all(
    (documentos || []).map(async (documento) => ({
      ...documento,
      arquivo_path: sanitizePath(documento?.arquivo_path || extractStoragePathFromUrl(documento?.arquivo_url)),
      download_url: await createDocumentDownloadUrl(documento),
    })),
  )
}
