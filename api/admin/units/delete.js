import {
  ensureServiceRoleConfig,
  getProfileCondominiumId,
  json,
  parseJsonBody,
  rejectForeignOrigin,
  requireCondominiumAdmin,
  supabaseAdmin,
} from '../../_lib/supabaseAdmin.js'
import { releasePerson } from '../../_lib/residentAccounts.js'

// Exclui a unidade. Quem so tinha esta unidade perde o acesso; quem tem outras continua.
// Cadastros e cobrancas ficam no historico.
export async function POST(req) {
  const originError = rejectForeignOrigin(req)
  if (originError) return originError

  const auth = await requireCondominiumAdmin(req)
  if (auth.error) return auth.error

  const serviceRoleError = ensureServiceRoleConfig()
  if (serviceRoleError) return json({ error: serviceRoleError }, 503)

  const body = await parseJsonBody(req)
  const unitId = String(body?.unitId || '').trim()
  if (!unitId) return json({ error: 'Unidade invalida.' }, 400)

  const condominiumId = getProfileCondominiumId(auth.profile)
  const { data: unit, error: unitError } = await supabaseAdmin.from('unidades').select('id, condominium_id').eq('id', unitId).maybeSingle()
  if (unitError) return json({ error: 'Nao foi possivel carregar a unidade.' }, 500)
  if (!unit || unit.condominium_id !== condominiumId) return json({ error: 'Unidade nao encontrada.' }, 404)

  const { data: links, error: linksError } = await supabaseAdmin.from('unidade_vinculos').select('profile_id').eq('unidade_id', unit.id)
  if (linksError) return json({ error: 'Nao foi possivel carregar os vinculos da unidade.' }, 500)

  const { error } = await supabaseAdmin.from('unidades').delete().eq('id', unit.id)
  if (error) return json({ error: 'Nao foi possivel excluir a unidade.' }, 500)

  const profileIds = [...new Set((links || []).map((link) => link.profile_id))]
  for (const profileId of profileIds) {
    const releaseError = await releasePerson(profileId)
    if (releaseError) return json({ error: `Unidade excluida, mas: ${releaseError}` }, 500)
  }

  return json({ success: true, released: profileIds.length })
}
