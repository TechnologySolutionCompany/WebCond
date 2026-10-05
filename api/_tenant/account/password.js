import { json, parseJsonBody, rejectForeignOrigin, requireAuthenticatedProfile } from '../../_lib/supabaseAdmin.js'
import { trocarPropriaSenha } from '../../_lib/contaPropria.js'

// Troca da propria senha do morador. Antes era feita direto no Supabase pelo navegador, o que
// pulava a senha atual e a recusa de senha vazada. Agora segue a mesma regra do sindico.
export async function POST(req) {
  const originError = rejectForeignOrigin(req)
  if (originError) return originError

  const auth = await requireAuthenticatedProfile(req)
  if (auth.error) return auth.error

  const body = await parseJsonBody(req)
  if (!body) return json({ error: 'Corpo da requisicao invalido.' }, 400)

  return trocarPropriaSenha(auth.user, body)
}
