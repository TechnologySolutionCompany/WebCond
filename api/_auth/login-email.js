import { checkRateLimit, ensureBackendConfig, ensureServiceRoleConfig, getClientIp, json, parseJsonBody, rejectForeignOrigin, supabaseAdmin, supabaseServer } from '../_lib/supabaseAdmin.js'
import { buildSessionResponse } from './login-cnpj.js'
import { isInternalLoginEmail, isValidLoginEmail, normalizeLoginEmail } from '../../src/lib/loginEmail.js'

// Mesma resposta para "e-mail nao existe", "senha errada", "conta desativada" e "identificador
// interno": a tela de login nao pode virar um jeito de descobrir quem tem conta no WebCond.
function invalidCredentials() {
  return json({ error: 'E-mail ou senha incorretos.' }, 401)
}

export async function POST(req) {
  const originError = rejectForeignOrigin(req)
  if (originError) return originError

  // Mesmo balde por IP do login por CPF e CNPJ: trocar de jeito de entrar nao da mais tentativas.
  const ipRateLimitError = checkRateLimit(`login:ip:${getClientIp(req)}`, { limit: 20, windowMs: 15 * 60 * 1000 })
  if (ipRateLimitError) return ipRateLimitError

  const backendError = ensureBackendConfig()
  if (backendError) return json({ error: backendError }, 503)
  if (ensureServiceRoleConfig()) return json({ error: 'O login por e-mail depende da configuracao completa do backend do Supabase.' }, 503)

  const body = await parseJsonBody(req)
  if (!body) return json({ error: 'Corpo da requisicao invalido.' }, 400)

  const email = normalizeLoginEmail(body.email)
  const password = String(body.password || '')
  if (!email || !password) return json({ error: 'Informe e-mail e senha.' }, 400)

  const emailRateLimitError = checkRateLimit(`login:email:${email}`, { limit: 10, windowMs: 15 * 60 * 1000 })
  if (emailRateLimitError) return emailRateLimitError

  // O identificador interno (morador-<cpf>-...@login.webcond.local) nao e e-mail de ninguem:
  // quem nao tem e-mail entra pelo CPF. Responde igual a senha errada.
  if (isInternalLoginEmail(email)) return invalidCredentials()
  if (!isValidLoginEmail(email)) return json({ error: 'Informe um e-mail valido.' }, 400)

  const { data, error } = await supabaseServer.auth.signInWithPassword({ email, password })
  if (error || !data?.session || !data?.user) return invalidCredentials()

  // Conta desativada ja e banida no Auth (residentAccounts.deactivatePeople). A conferencia do
  // perfil e a segunda trava: se um dia o banimento falhar, o perfil inativo ainda barra.
  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('id, role, ativo')
    .eq('id', data.user.id)
    .maybeSingle()

  if (!profile || profile.ativo === false) {
    // So a sessao que acabou de nascer ('local'). O padrao do Supabase e 'global', que derrubaria
    // tambem as outras sessoes da pessoa so porque alguem tentou entrar na conta dela.
    await supabaseAdmin.auth.admin.signOut(data.session.access_token, 'local').catch(() => {})
    return invalidCredentials()
  }

  return buildSessionResponse(data, profile)
}
