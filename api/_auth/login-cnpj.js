import { checkRateLimit, ensureBackendConfig, ensureServiceRoleConfig, getClientIp, json, parseJsonBody, rejectForeignOrigin, supabaseAdmin, supabaseServer } from '../_lib/supabaseAdmin.js'

function invalidCredentials() {
  return json({ error: 'CNPJ ou senha incorretos.' }, 401)
}

function normalizeCnpj(value = '') {
  return String(value || '').replace(/\D/g, '')
}

function isCondominiumAdminRole(role = '') {
  const normalized = String(role || '').trim().toLowerCase()
  return normalized === 'admin' || normalized === 'admin_condominium'
}

function isPlatformAdminRole(role = '') {
  const normalized = String(role || '').trim().toLowerCase()
  return normalized === 'platform_admin'
}

function buildSessionResponse(data, profile, condominiumId = null) {
  return json({
    user: {
      id: data.user.id,
      email: data.user.email,
      role: profile.role,
      condominium_id: condominiumId,
    },
    session: {
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
      expires_at: data.session.expires_at,
      expires_in: data.session.expires_in,
      token_type: data.session.token_type,
    },
  })
}

async function tryProfilePasswordLogin(profile, password, condominiumId = null) {
  if (!profile?.email) return null

  const { data, error } = await supabaseServer.auth.signInWithPassword({
    email: profile.email,
    password,
  })

  if (error || !data.session || !data.user) {
    return null
  }

  return buildSessionResponse(data, profile, condominiumId)
}

// Sindico entrando pelo documento do condominio. O documento pode ser CNPJ ou, em condominio
// pequeno, o CPF do responsavel: o login por CPF chama esta mesma funcao quando nao acha pessoa.
// Devolve a Response da sessao, null (credencial nao confere) ou { error } quando falha a consulta.
export async function loginCondominiumAdminByDocument(document, password) {
  const { data: condominium, error: condominiumError } = await supabaseAdmin
    .from('condominiums')
    .select('id, status')
    .eq('cnpj', document)
    .maybeSingle()

  if (condominiumError) return { error: json({ error: 'Nao foi possivel validar o documento informado.' }, 500) }
  if (!condominium) return null

  const { data: profiles, error: profilesError } = await supabaseAdmin
    .from('profiles')
    .select('id, email, role, ativo, condominium_id, condominio_id')
    .eq('ativo', true)
    .or(`condominium_id.eq.${condominium.id},condominio_id.eq.${condominium.id}`)
    .limit(20)

  if (profilesError) return { error: json({ error: 'Nao foi possivel validar o administrador do condominio.' }, 500) }

  for (const adminProfile of (profiles || []).filter((profile) => isCondominiumAdminRole(profile.role) && profile.email)) {
    const response = await tryProfilePasswordLogin(adminProfile, password, condominium.id)
    if (response) return response
  }

  return null
}

export async function POST(req) {
  const originError = rejectForeignOrigin(req)
  if (originError) return originError

  const ipRateLimitError = checkRateLimit(`login:ip:${getClientIp(req)}`, { limit: 20, windowMs: 15 * 60 * 1000 })
  if (ipRateLimitError) return ipRateLimitError

  const backendError = ensureBackendConfig()
  if (backendError) {
    return json({ error: backendError }, 503)
  }

  const serviceRoleError = ensureServiceRoleConfig()
  if (serviceRoleError) {
    return json({ error: 'O login por CNPJ depende da configuracao completa do backend do Supabase.' }, 503)
  }

  const body = await parseJsonBody(req)
  if (!body) {
    return json({ error: 'Corpo da requisicao invalido.' }, 400)
  }

  const cnpj = normalizeCnpj(body.cnpj || body.document || body.condominiumDocument)
  const password = String(body.password || '')

  if (cnpj.length !== 14 || !password) {
    return json({ error: 'Informe CNPJ e senha validos.' }, 400)
  }

  const documentRateLimitError = checkRateLimit(`login:doc:${cnpj}`, { limit: 10, windowMs: 15 * 60 * 1000 })
  if (documentRateLimitError) return documentRateLimitError

  const { data: platformProfiles, error: platformProfileError } = await supabaseAdmin
    .from('profiles')
    .select('id, email, role, ativo')
    .eq('cpf', cnpj)
    .eq('ativo', true)
    .limit(5)

  if (platformProfileError) {
    return json({ error: 'Nao foi possivel validar o CNPJ informado.' }, 500)
  }

  const platformAdminProfiles = (platformProfiles || []).filter((profile) => isPlatformAdminRole(profile.role) && profile.email)
  for (const platformProfile of platformAdminProfiles) {
    const response = await tryProfilePasswordLogin(platformProfile, password)
    if (response) return response
  }

  const result = await loginCondominiumAdminByDocument(cnpj, password)
  if (result?.error) return result.error
  return result || invalidCredentials()
}
