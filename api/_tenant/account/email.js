import { json, parseJsonBody, rejectForeignOrigin, requireAuthenticatedProfile } from '../../_lib/supabaseAdmin.js'
import { trocarEmailDeLogin } from '../../_lib/contaPropria.js'

// Cadastrar ou trocar o proprio e-mail de acesso (morador; vale para qualquer pessoa logada).
// Exige a senha atual. A regra fica em api/_lib/contaPropria.js.
export async function POST(req) {
  const originError = rejectForeignOrigin(req)
  if (originError) return originError

  const auth = await requireAuthenticatedProfile(req)
  if (auth.error) return auth.error

  const body = await parseJsonBody(req)
  if (!body) return json({ error: 'Corpo da requisicao invalido.' }, 400)

  const troca = await trocarEmailDeLogin(auth.user, { email: body.email, senhaAtual: body.senhaAtual })
  if (troca.error) return troca.error
  return json({ success: true, emailAlterado: troca.alterado, email: troca.email })
}
