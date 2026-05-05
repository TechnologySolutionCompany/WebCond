import { ensureBackendConfig, ensureServiceRoleConfig, json, parseJsonBody, supabaseAdmin, supabaseServer } from '../_lib/supabaseAdmin.js'

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

export async function POST(req) {
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

  const { data: condominium, error: condominiumError } = await supabaseAdmin
    .from('condominiums')
    .select('id, status')
    .eq('cnpj', cnpj)
    .maybeSingle()

  if (condominiumError) {
    return json({ error: 'Nao foi possivel validar o CNPJ informado.' }, 500)
  }

  if (!condominium) {
    return invalidCredentials()
  }

  const { data: profiles, error: profilesError } = await supabaseAdmin
    .from('profiles')
    .select('id, email, role, ativo, condominium_id, condominio_id')
    .eq('ativo', true)
    .or(`condominium_id.eq.${condominium.id},condominio_id.eq.${condominium.id}`)
    .limit(20)

  if (profilesError) {
    return json({ error: 'Nao foi possivel validar o administrador do condominio.' }, 500)
  }

  const adminProfiles = (profiles || []).filter((profile) => isCondominiumAdminRole(profile.role) && profile.email)
  if (!adminProfiles.length) {
    return invalidCredentials()
  }

  for (const adminProfile of adminProfiles) {
    const response = await tryProfilePasswordLogin(adminProfile, password, condominium.id)
    if (response) return response
  }

  return invalidCredentials()
}
