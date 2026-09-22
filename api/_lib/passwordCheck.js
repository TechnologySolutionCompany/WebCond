import { checkRateLimit, json, supabaseServer } from './supabaseAdmin.js'

// Confere a senha de quem ja esta logado, entrando de novo com o e-mail de login dele.
// Usado antes de acoes sensiveis (trocar a propria senha, excluir condominio).
// Senha errada responde 422, e nao 401: a sessao continua valida, so a senha digitada nao confere.
// Devolve null quando confere, ou a Response de erro pronta para devolver.
export async function verifyOwnPassword(user, password, { scope }) {
  const limited = checkRateLimit(`senha:${scope}:${user?.id}`, { limit: 5, windowMs: 15 * 60 * 1000 })
  if (limited) return limited

  if (!user?.email || !password) return json({ code: 'SENHA_INCORRETA', error: 'Informe a sua senha.' }, 422)

  const { data, error } = await supabaseServer.auth.signInWithPassword({ email: user.email, password: String(password) })
  if (error || !data?.user || data.user.id !== user.id) {
    return json({ code: 'SENHA_INCORRETA', error: 'Senha incorreta.' }, 422)
  }

  return null
}
