import {
  ensureServiceRoleConfig,
  getProfileCondominiumId,
  isManageableTenantRole,
  isSameCondominium,
  json,
  parseJsonBody,
  requireCondominiumAdmin,
  supabaseAdmin,
} from '../../_lib/supabaseAdmin.js'

function isUserMissing(message = '') {
  const normalized = String(message || '').toLowerCase()
  return normalized.includes('not found')
    || normalized.includes('user not found')
    || normalized.includes('no rows')
}

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
  if (!userId) {
    return json({ error: 'Usuario e obrigatorio.' }, 400)
  }

  if (auth.user?.id === userId) {
    return json({ error: 'Voce nao pode apagar seu proprio usuario por esta tela.' }, 400)
  }

  const { data: profile, error: profileError } = await supabaseAdmin
    .from('profiles')
    .select('id, email, role, nome, condominium_id, condominio_id')
    .eq('id', userId)
    .maybeSingle()

  if (profileError) {
    return json({ error: 'Nao foi possivel localizar o morador.' }, 500)
  }

  if (!profile) {
    return json({ error: 'Morador nao encontrado.' }, 404)
  }

  if (!isManageableTenantRole(profile.role)) {
    return json({ error: 'Esta acao esta disponivel apenas para moradores ou perfis operacionais do condominio.' }, 400)
  }

  if (!isSameCondominium(auth.profile, profile)) {
    return json({ error: 'Este usuario pertence a outro condominio.' }, 403)
  }

  const email = String(profile.email || '').trim().toLowerCase()
  const condominiumId = getProfileCondominiumId(profile)

  if (email) {
    let requestsQuery = supabaseAdmin
      .from('solicitacoes_cadastro')
      .delete()
      .eq('email', email)

    if (condominiumId) {
      requestsQuery = requestsQuery.or(`condominium_id.eq.${condominiumId},condominio_id.eq.${condominiumId}`)
    }

    const { error: requestsError } = await requestsQuery

    if (requestsError) {
      return json({ error: 'Nao foi possivel apagar o historico de solicitacoes do morador.' }, 500)
    }
  }

  const { error: authDeleteError } = await supabaseAdmin.auth.admin.deleteUser(userId)

  if (authDeleteError && !isUserMissing(authDeleteError.message)) {
    return json({ error: authDeleteError.message || 'Nao foi possivel apagar o usuario do Auth.' }, 500)
  }

  if (authDeleteError && isUserMissing(authDeleteError.message)) {
    const { error: profileDeleteError } = await supabaseAdmin
      .from('profiles')
      .delete()
      .eq('id', userId)

    if (profileDeleteError) {
      return json({ error: 'O usuario do Auth nao existe mais e o perfil nao pode ser apagado manualmente.' }, 500)
    }
  }

  return json({
    success: true,
    deletedUserId: userId,
    deletedEmail: email,
    deletedName: profile.nome || '',
  })
}
