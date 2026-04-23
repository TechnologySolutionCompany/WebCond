import {
  ensureServiceRoleConfig,
  isManageableTenantRole,
  isSameCondominium,
  json,
  parseJsonBody,
  requireCondominiumAdmin,
  supabaseAdmin,
} from '../../_lib/supabaseAdmin.js'

export async function POST(req) {
  const auth = await requireCondominiumAdmin(req)
  if (auth.error) return auth.error

  const serviceRoleError = ensureServiceRoleConfig()
  if (serviceRoleError) {
    return json({ error: serviceRoleError }, 503)
  }

  const body = await parseJsonBody(req)
  if (!body) {
    return json({ error: 'Corpo da requisicao invalido.' }, 400)
  }

  const userId = String(body.userId || '').trim()
  const password = String(body.password || '')

  if (!userId || !password) {
    return json({ error: 'Usuario e senha sao obrigatorios.' }, 400)
  }

  if (password.length < 6) {
    return json({ error: 'A senha precisa ter pelo menos 6 caracteres.' }, 400)
  }

  const { data: targetProfile, error: targetProfileError } = await supabaseAdmin
    .from('profiles')
    .select('id, role, condominium_id, condominio_id')
    .eq('id', userId)
    .maybeSingle()

  if (targetProfileError) {
    return json({ error: 'Nao foi possivel validar o usuario informado.' }, 500)
  }

  if (!targetProfile) {
    return json({ error: 'Usuario nao encontrado.' }, 404)
  }

  if (!isManageableTenantRole(targetProfile.role)) {
    return json({ error: 'Esta acao esta disponivel apenas para moradores ou perfis operacionais do condominio.' }, 400)
  }

  if (!isSameCondominium(auth.profile, targetProfile)) {
    return json({ error: 'Este usuario pertence a outro condominio.' }, 403)
  }

  const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, { password })
  if (error) {
    return json({ error: error.message || 'Nao foi possivel atualizar a senha.' }, 500)
  }

  return json({ success: true })
}
