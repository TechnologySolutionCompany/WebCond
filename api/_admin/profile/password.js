import { json, parseJsonBody, rejectForeignOrigin, requireAdmin, senhaRecusadaPeloAuth, supabaseAdmin, supabaseServer } from '../../_lib/supabaseAdmin.js'
import { verifyOwnPassword } from '../../_lib/passwordCheck.js'

// Troca da propria senha: exige a senha atual, mesmo com a sessao aberta, para que um
// computador esquecido logado nao vire troca de senha e perda da conta.
export async function POST(req) {
  const originError = rejectForeignOrigin(req)
  if (originError) return originError

  const auth = await requireAdmin(req, { allowPlatformAdmin: false, allowAccountant: true, allowLockedPlan: true })
  if (auth.error) return auth.error

  const body = await parseJsonBody(req)
  if (!body) return json({ error: 'Corpo da requisicao invalido.' }, 400)

  const novaSenha = String(body.novaSenha || '')
  if (novaSenha.length < 6) return json({ error: 'A nova senha precisa ter pelo menos 6 caracteres.' }, 400)
  if (novaSenha === String(body.senhaAtual || '')) return json({ error: 'A nova senha precisa ser diferente da atual.' }, 400)

  const wrong = await verifyOwnPassword(auth.user, body.senhaAtual, { scope: 'perfil' })
  if (wrong) return wrong

  const { error } = await supabaseAdmin.auth.admin.updateUserById(auth.profile.id, { password: novaSenha })
  if (error) {
    const senhaFraca = senhaRecusadaPeloAuth(error)
    return json({ error: senhaFraca || 'Nao foi possivel alterar a senha.' }, senhaFraca ? 400 : 500)
  }

  // O Supabase encerra todas as sessoes quando a senha muda (bom: outro aparelho logado sai).
  // Para quem acabou de trocar nao cair junto, devolve uma sessao nova ja com a senha nova.
  const { data } = await supabaseServer.auth.signInWithPassword({ email: auth.user.email, password: novaSenha })
  const session = data?.session
    ? { access_token: data.session.access_token, refresh_token: data.session.refresh_token }
    : null

  return json({ success: true, session })
}
