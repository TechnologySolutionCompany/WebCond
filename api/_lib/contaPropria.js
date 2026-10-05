import { json, senhaRecusadaPeloAuth, supabaseAdmin, supabaseServer } from './supabaseAdmin.js'
import { verifyOwnPassword } from './passwordCheck.js'
import { recusaDeSenha } from './senhaVazada.js'
import { isValidLoginEmail, normalizeLoginEmail } from '../../src/lib/loginEmail.js'

// Alteracoes que a pessoa faz na propria conta. Valem para qualquer papel (sindico, contador,
// morador): as rotas so mudam quem pode chamar, a regra e esta.
//
// Senha e e-mail de acesso sao credenciais. Os dois exigem a senha atual, mesmo com a sessao
// aberta: um computador esquecido logado nao pode virar perda da conta.

// Troca da propria senha. A senha atual e conferida primeiro: so quem prova que e o dono da
// conta chega na parte de avaliar a senha nova (senao a rota viraria um teste gratuito de
// "esta senha aparece em vazamento?").
export async function trocarPropriaSenha(user, body) {
  const novaSenha = String(body?.novaSenha || '')
  if (novaSenha.length < 6) return json({ error: 'A nova senha precisa ter pelo menos 6 caracteres.' }, 400)
  if (novaSenha === String(body?.senhaAtual || '')) return json({ error: 'A nova senha precisa ser diferente da atual.' }, 400)

  const wrong = await verifyOwnPassword(user, body?.senhaAtual, { scope: 'perfil' })
  if (wrong) return wrong

  const senhaRecusada = await recusaDeSenha(novaSenha)
  if (senhaRecusada) return json({ error: senhaRecusada }, 400)

  const { error } = await supabaseAdmin.auth.admin.updateUserById(user.id, { password: novaSenha })
  if (error) {
    const senhaFraca = senhaRecusadaPeloAuth(error)
    return json({ error: senhaFraca || 'Nao foi possivel alterar a senha.' }, senhaFraca ? 400 : 500)
  }

  // O Supabase encerra todas as sessoes quando a senha muda (bom: outro aparelho logado sai).
  // Para quem acabou de trocar nao cair junto, devolve uma sessao nova ja com a senha nova.
  const { data } = await supabaseServer.auth.signInWithPassword({ email: user.email, password: novaSenha })
  const session = data?.session
    ? { access_token: data.session.access_token, refresh_token: data.session.refresh_token }
    : null

  return json({ success: true, session })
}

// Troca (ou primeiro cadastro) do e-mail de acesso. O e-mail muda no Auth e no perfil juntos:
// o login por CPF tambem depende dele, entao os dois nunca podem ficar diferentes.
// Devolve { alterado, email } quando deu certo, ou { error: Response }.
export async function trocarEmailDeLogin(user, { email, senhaAtual }) {
  const novo = normalizeLoginEmail(email)
  if (!isValidLoginEmail(novo)) return { error: json({ error: 'Informe um e-mail valido.' }, 400) }
  if (novo === normalizeLoginEmail(user.email)) return { alterado: false, email: novo }

  // Senha antes de qualquer consulta: a checagem de "e-mail ja em uso" so responde para o dono
  // da conta, e com limite de tentativas, para nao virar um jeito de descobrir quem usa o WebCond.
  const wrong = await verifyOwnPassword(user, senhaAtual, { scope: 'email' })
  if (wrong) return { error: wrong }

  const emUso = json({ error: 'Este e-mail ja esta em uso por outro acesso.' }, 409)

  // O Auth do Supabase responde e-mail repetido com um erro 500 generico: confere antes.
  const { data: taken, error: takenError } = await supabaseAdmin
    .from('profiles')
    .select('id')
    .ilike('email', novo)
    .neq('id', user.id)
    .limit(1)
  if (takenError) return { error: json({ error: 'Nao foi possivel validar o e-mail.' }, 500) }
  if (taken?.length) return { error: emUso }

  const anterior = user.email
  const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(user.id, { email: novo, email_confirm: true })
  if (authError) {
    return { error: /already|registered|exists/i.test(authError.message || '') ? emUso : json({ error: 'Nao foi possivel alterar o e-mail.' }, 500) }
  }

  const { error: profileError } = await supabaseAdmin
    .from('profiles')
    .update({ email: novo, updated_at: new Date().toISOString() })
    .eq('id', user.id)

  if (profileError) {
    // Desfaz no Auth: e-mail diferente entre Auth e perfil quebraria o login por CPF.
    await supabaseAdmin.auth.admin.updateUserById(user.id, { email: anterior, email_confirm: true })
    return { error: profileError.code === '23505' ? emUso : json({ error: 'Nao foi possivel salvar o e-mail.' }, 500) }
  }

  return { alterado: true, email: novo }
}
