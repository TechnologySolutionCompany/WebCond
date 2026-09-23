import { json, parseJsonBody, rejectForeignOrigin, requirePlatformAdmin, senhaRecusadaPeloAuth, supabaseAdmin } from '../../_lib/supabaseAdmin.js'
import { recusaDeSenha } from '../../_lib/senhaVazada.js'

function isCondominiumAdminRole(role = '') {
  const normalized = String(role || '').trim().toLowerCase()
  return normalized === 'admin' || normalized === 'admin_condominium'
}

export async function POST(req) {
  const originError = rejectForeignOrigin(req)
  if (originError) return originError

  const auth = await requirePlatformAdmin(req)
  if (auth.error) return auth.error

  const body = await parseJsonBody(req)
  if (!body) {
    return json({ error: 'Corpo da requisicao invalido.' }, 400)
  }

  const condominiumId = String(body.condominiumId || body.id || '').trim()
  const password = String(body.password || '').trim()

  if (!condominiumId) {
    return json({ error: 'Condominio invalido.' }, 400)
  }

  if (password.length < 6) {
    return json({ error: 'A nova senha precisa ter pelo menos 6 caracteres.' }, 400)
  }

  const senhaRecusada = await recusaDeSenha(password)
  if (senhaRecusada) return json({ error: senhaRecusada }, 400)

  const { data: profiles, error: profileError } = await supabaseAdmin
    .from('profiles')
    .select('id, nome, email, role, ativo, condominium_id, condominio_id')
    .eq('ativo', true)
    .or(`condominium_id.eq.${condominiumId},condominio_id.eq.${condominiumId}`)
    .order('created_at', { ascending: true })
    .limit(20)

  if (profileError) {
    return json({ error: profileError.message || 'Nao foi possivel localizar o sindico.' }, 500)
  }

  const syndic = (profiles || []).find((profile) => isCondominiumAdminRole(profile.role))
  if (!syndic?.id) {
    return json({ error: 'Nenhum sindico ativo foi encontrado para este condominio.' }, 404)
  }

  const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(syndic.id, {
    password,
  })

  if (updateError) {
    const senhaFraca = senhaRecusadaPeloAuth(updateError)
    if (senhaFraca) return json({ error: senhaFraca }, 400)
    return json({ error: updateError.message || 'Nao foi possivel atualizar a senha do sindico.' }, 500)
  }

  return json({
    success: true,
    syndic: {
      id: syndic.id,
      nome: syndic.nome || '',
      email: syndic.email || '',
    },
  })
}
