import { json, parseJsonBody, rejectForeignOrigin, requirePlatformAdmin, supabaseAdmin } from '../../_lib/supabaseAdmin.js'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MAX_BYTES = 2 * 1024 * 1024
const TYPES = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' }
const BUCKET = 'condominios'

// Logo do condominio: aparece no perfil dele no painel da plataforma e, nos planos que permitem,
// no boleto. So a administracao da plataforma cadastra ou remove (o sindico nao envia imagem).
export async function POST(req) {
  const originError = rejectForeignOrigin(req)
  if (originError) return originError

  const auth = await requirePlatformAdmin(req)
  if (auth.error) return auth.error

  const body = await parseJsonBody(req)
  const condominiumId = String(body?.condominiumId || '')
  if (!UUID.test(condominiumId)) return json({ error: 'Condominio invalido.' }, 400)

  const { data: condominium, error: condominiumError } = await supabaseAdmin
    .from('condominiums')
    .select('id, metadata')
    .eq('id', condominiumId)
    .maybeSingle()
  if (condominiumError) return json({ error: 'Nao foi possivel carregar o condominio.' }, 500)
  if (!condominium) return json({ error: 'Condominio nao encontrado.' }, 404)

  const metadata = condominium.metadata && typeof condominium.metadata === 'object' ? condominium.metadata : {}
  const previousPath = String(metadata.logo_path || '')

  async function saveMetadata(logoPath) {
    const next = { ...metadata }
    if (logoPath) next.logo_path = logoPath
    else delete next.logo_path
    const { error } = await supabaseAdmin
      .from('condominiums')
      .update({ metadata: next, updated_at: new Date().toISOString() })
      .eq('id', condominiumId)
    return error
  }

  if (body?.remover === true) {
    if (previousPath) await supabaseAdmin.storage.from(BUCKET).remove([previousPath])
    const error = await saveMetadata('')
    if (error) return json({ error: 'Nao foi possivel remover a logo.' }, 500)
    return json({ success: true, logo_path: '' })
  }

  // Imagem chega como data URL do navegador: "data:image/png;base64,...."
  const match = String(body?.arquivo || '').match(/^data:([a-z/+-]+);base64,([A-Za-z0-9+/=]+)$/i)
  if (!match) return json({ error: 'Envie uma imagem PNG, JPG ou WEBP.' }, 400)

  const extension = TYPES[match[1].toLowerCase()]
  if (!extension) return json({ error: 'Formato nao aceito. Use PNG, JPG ou WEBP.' }, 400)

  const bytes = Buffer.from(match[2], 'base64')
  if (!bytes.length || bytes.length > MAX_BYTES) return json({ error: 'A imagem precisa ter ate 2 MB.' }, 400)

  const path = `${condominiumId}/logo-${Date.now()}.${extension}`
  const { error: uploadError } = await supabaseAdmin.storage.from(BUCKET).upload(path, bytes, { contentType: match[1].toLowerCase(), upsert: false })
  if (uploadError) {
    const missing = /bucket/i.test(uploadError.message || '')
    return json({ error: missing ? 'Bucket "condominios" ausente: aplique o SQL 2026-09-27.' : 'Nao foi possivel enviar a imagem.' }, missing ? 503 : 500)
  }

  const error = await saveMetadata(path)
  if (error) {
    await supabaseAdmin.storage.from(BUCKET).remove([path])
    return json({ error: 'Nao foi possivel salvar a logo.' }, 500)
  }

  if (previousPath && previousPath !== path) await supabaseAdmin.storage.from(BUCKET).remove([previousPath])

  return json({ success: true, logo_path: path })
}
