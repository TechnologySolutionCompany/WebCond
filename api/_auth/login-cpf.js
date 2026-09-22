import { checkRateLimit, ensureBackendConfig, ensureServiceRoleConfig, getClientIp, json, parseJsonBody, rejectForeignOrigin, supabaseAdmin, supabaseServer } from '../_lib/supabaseAdmin.js'
import { loginCondominiumAdminByDocument } from './login-cnpj.js'

function invalidCredentials() {
  return json({ error: 'CPF ou senha incorretos.' }, 401)
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
    return json({ error: 'O login por CPF depende da configuração completa do backend do Supabase.' }, 503)
  }

  const body = await parseJsonBody(req)
  if (!body) {
    return json({ error: 'Corpo da requisição inválido.' }, 400)
  }

  const cpf = String(body.cpf || body.document || '').replace(/\D/g, '')
  const password = String(body.password || '')

  if (cpf.length !== 11 || !password) {
    return json({ error: 'Informe CPF e senha válidos.' }, 400)
  }

  const documentRateLimitError = checkRateLimit(`login:doc:${cpf}`, { limit: 10, windowMs: 15 * 60 * 1000 })
  if (documentRateLimitError) return documentRateLimitError

  const { data: profiles, error: profileError } = await supabaseAdmin
    .from('profiles')
    .select('id, email, role, ativo, condominium_id, condominio_id')
    .eq('cpf', cpf)
    .eq('ativo', true)
    .limit(2)

  if (profileError) {
    return json({ error: 'Não foi possível validar o CPF informado.' }, 500)
  }

  if (!profiles?.length) {
    // Condominio cadastrado com CPF como documento: o sindico entra por ele, como faria com o CNPJ.
    const condominiumLogin = await loginCondominiumAdminByDocument(cpf, password)
    if (condominiumLogin?.error) return condominiumLogin.error
    return condominiumLogin || invalidCredentials()
  }

  if (profiles.length > 1) {
    return json({ error: 'Existem múltiplos usuários com este CPF. Corrija o cadastro no painel administrativo.' }, 409)
  }

  const profile = profiles[0]

  if (!profile.email) {
    return json({ error: 'Este CPF está cadastrado, mas o login interno por e-mail ainda não foi configurado para este usuário.' }, 409)
  }

  const { data, error } = await supabaseServer.auth.signInWithPassword({
    email: profile.email,
    password,
  })

  if (error || !data.session || !data.user) {
    return invalidCredentials()
  }

  return json({
    user: {
      id: data.user.id,
      email: data.user.email,
      role: profile.role,
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
