import { createClient } from '@supabase/supabase-js'
import { getCondominiumAccessState, STANDARD_PLAN_PRICE_LABEL } from '../../src/lib/condominiumPlan.js'

function isMissing(value) {
  if (!value) return true

  const normalized = String(value).trim()
  if (!normalized) return true

  return normalized === 'COLE_AQUI_A_SERVICE_ROLE_REAL'
    || normalized.toLowerCase().includes('service_role_real')
    || normalized.toLowerCase().includes('cole_aqui')
}

const supabaseUrl =
  process.env.SUPABASE_URL
  || process.env.VITE_SUPABASE_URL
  || process.env.NEXT_PUBLIC_SUPABASE_URL

const supabaseAnonKey =
  process.env.SUPABASE_ANON_KEY
  || process.env.VITE_SUPABASE_ANON_KEY
  || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY

const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

const ROLE_ALIASES = {
  admin: 'admin',
  admin_condominium: 'admin',
  administrador_condominio: 'admin',
  morador: 'morador',
  resident: 'morador',
  contador: 'contador',
  platform_admin: 'platform_admin',
}

function createBackendClient(apiKey, accessToken) {
  return createClient(supabaseUrl, apiKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: accessToken
      ? {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      : undefined,
  })
}

async function resolveCondominiumAccessError(condominiumId) {
  if (!condominiumId || !supabaseAdmin) return null

  const { data: condominium, error } = await supabaseAdmin
    .from('condominiums')
    .select('id, status, metadata, created_at, updated_at')
    .eq('id', condominiumId)
    .maybeSingle()

  if (error || !condominium) {
    return json({ error: 'O condominio vinculado ao usuario autenticado nao foi encontrado.' }, 403)
  }

  const accessState = getCondominiumAccessState(condominium)

  if (accessState.effectiveStatus === 'pending') {
    return json({ error: 'O cadastro do condominio ainda aguarda aprovacao da plataforma.' }, 403)
  }

  if (accessState.blockReason === 'trial_expired') {
    return json({ error: `O periodo de teste do condominio terminou. Regularize o Plano Padrao de ${STANDARD_PLAN_PRICE_LABEL} para liberar o acesso.` }, 403)
  }

  if (accessState.effectiveStatus === 'blocked') {
    return json({ error: 'O acesso do condominio esta bloqueado no momento.' }, 403)
  }

  if (accessState.effectiveStatus === 'rejected') {
    return json({ error: 'O cadastro do condominio foi rejeitado pela plataforma.' }, 403)
  }

  return null
}

export function normalizeRole(role) {
  if (role == null) return null

  const normalizedKey = String(role).trim().toLowerCase()
  if (!normalizedKey) return null

  return ROLE_ALIASES[normalizedKey] || String(role).trim()
}

export function getProfileCondominiumId(profile) {
  return profile?.condominium_id || profile?.condominio_id || null
}

export function isAdminRole(role) {
  const normalizedRole = normalizeRole(role)
  return normalizedRole === 'admin' || normalizedRole === 'platform_admin' || normalizedRole === 'contador'
}

export function isCondominiumAdminRole(role) {
  return normalizeRole(role) === 'admin'
}

export function isPlatformAdminRole(role) {
  return normalizeRole(role) === 'platform_admin'
}

export function isManageableTenantRole(role) {
  const normalizedRole = normalizeRole(role)
  return normalizedRole === 'morador' || normalizedRole === 'contador'
}

export function isSameCondominium(firstProfile, secondProfile) {
  const firstCondominiumId = getProfileCondominiumId(firstProfile)
  const secondCondominiumId = getProfileCondominiumId(secondProfile)

  return Boolean(firstCondominiumId) && firstCondominiumId === secondCondominiumId
}

function getBackendConfigError() {
  const missing = []

  if (isMissing(supabaseUrl)) missing.push('SUPABASE_URL')
  if (isMissing(supabaseAnonKey)) missing.push('SUPABASE_ANON_KEY')

  return missing.length > 0
    ? `As variaveis ${missing.join(', ')} precisam estar configuradas no backend.`
    : null
}

function getServiceRoleConfigError() {
  if (backendConfigError) return backendConfigError

  return isMissing(supabaseServiceRoleKey)
    ? 'A variavel SUPABASE_SERVICE_ROLE_KEY real precisa estar configurada no backend para alterar login, senha e usuarios do Auth.'
    : null
}

const backendConfigError = getBackendConfigError()
const serviceRoleConfigError = getServiceRoleConfigError()

export const supabaseServer = backendConfigError
  ? null
  : createBackendClient(supabaseAnonKey)

export const supabaseAdmin = backendConfigError || serviceRoleConfigError
  ? null
  : createBackendClient(supabaseServiceRoleKey)

export function json(response, status = 200) {
  return new Response(JSON.stringify(response), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  })
}

export function ensureBackendConfig() {
  return backendConfigError
}

export function ensureServiceRoleConfig() {
  return serviceRoleConfigError
}

export function createUserScopedServerClient(accessToken) {
  const configError = ensureBackendConfig()
  if (configError || !accessToken) {
    return null
  }

  return createBackendClient(supabaseAnonKey, accessToken)
}

export async function parseJsonBody(req) {
  try {
    return await req.json()
  } catch {
    return null
  }
}

export async function requireAdmin(req, options = {}) {
  const {
    allowPlatformAdmin = true,
    allowAccountant = true,
  } = options

  const configError = ensureBackendConfig()
  if (configError) {
    return { error: json({ error: configError }, 503) }
  }

  const authHeader = req.headers.get('authorization') || ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null

  if (!token) {
    return { error: json({ error: 'Sessao invalida.' }, 401) }
  }

  const requestClient = createUserScopedServerClient(token)
  if (!requestClient) {
    return { error: json({ error: 'Nao foi possivel inicializar a sessao do backend.' }, 500) }
  }

  const { data: userData, error: userError } = await requestClient.auth.getUser(token)
  if (userError || !userData.user) {
    return { error: json({ error: 'Nao foi possivel validar o usuario autenticado.' }, 401) }
  }

  const { data: profile, error: profileError } = await requestClient
    .from('profiles')
    .select('id, role, ativo, condominium_id, condominio_id')
    .eq('id', userData.user.id)
    .maybeSingle()

  if (profileError) {
    return { error: json({ error: 'Falha ao validar permissoes administrativas.' }, 500) }
  }

  if (!profile || profile.ativo === false) {
    return { error: json({ error: 'Acesso restrito ao administrador.' }, 403) }
  }

  const normalizedRole = normalizeRole(profile.role)
  const isAllowed = normalizedRole === 'admin'
    || (allowPlatformAdmin && normalizedRole === 'platform_admin')
    || (allowAccountant && normalizedRole === 'contador')

  if (!isAllowed) {
    return { error: json({ error: 'Acesso restrito ao administrador.' }, 403) }
  }

  const condominiumId = getProfileCondominiumId(profile)
  if (normalizedRole !== 'platform_admin' && !condominiumId) {
    return { error: json({ error: 'O administrador autenticado nao possui vinculo com um condominio valido.' }, 403) }
  }

  if (normalizedRole !== 'platform_admin') {
    const accessError = await resolveCondominiumAccessError(condominiumId)
    if (accessError) {
      return { error: accessError }
    }
  }

  return {
    user: userData.user,
    profile: {
      ...profile,
      role: normalizedRole,
      condominium_id: condominiumId,
      condominio_id: condominiumId,
    },
    client: requestClient,
    token,
  }
}

export async function requireCondominiumAdmin(req) {
  return requireAdmin(req, { allowPlatformAdmin: false, allowAccountant: false })
}

export async function requirePlatformAdmin(req) {
  const auth = await requireAdmin(req, { allowPlatformAdmin: true, allowAccountant: false })
  if (auth.error) return auth

  if (!isPlatformAdminRole(auth.profile?.role)) {
    return { error: json({ error: 'Acesso restrito ao administrador da plataforma.' }, 403) }
  }

  return auth
}

export async function requireAuthenticatedProfile(req) {
  const configError = ensureBackendConfig()
  if (configError) {
    return { error: json({ error: configError }, 503) }
  }

  const authHeader = req.headers.get('authorization') || ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null

  if (!token) {
    return { error: json({ error: 'Sessao invalida.' }, 401) }
  }

  const requestClient = createUserScopedServerClient(token)
  if (!requestClient) {
    return { error: json({ error: 'Nao foi possivel inicializar a sessao do backend.' }, 500) }
  }

  const { data: userData, error: userError } = await requestClient.auth.getUser(token)
  if (userError || !userData.user) {
    return { error: json({ error: 'Nao foi possivel validar o usuario autenticado.' }, 401) }
  }

  const { data: profile, error: profileError } = await requestClient
    .from('profiles')
    .select('id, nome, email, role, ativo, apartamento, condominium_id, condominio_id')
    .eq('id', userData.user.id)
    .maybeSingle()

  if (profileError) {
    return { error: json({ error: 'Falha ao validar o perfil autenticado.' }, 500) }
  }

  if (!profile || profile.ativo === false) {
    return { error: json({ error: 'Perfil de acesso indisponivel.' }, 403) }
  }

  const normalizedRole = normalizeRole(profile.role)
  const condominiumId = getProfileCondominiumId(profile)

  if (normalizedRole !== 'platform_admin') {
    const accessError = await resolveCondominiumAccessError(condominiumId)
    if (accessError) {
      return { error: accessError }
    }
  }

  return {
    user: userData.user,
    profile: {
      ...profile,
      role: normalizedRole,
      condominium_id: condominiumId,
      condominio_id: condominiumId,
    },
    client: requestClient,
    token,
  }
}
