import { json, parseJsonBody, rejectForeignOrigin, requireAdmin } from '../../_lib/supabaseAdmin.js'
import { trocarPropriaSenha } from '../../_lib/contaPropria.js'

// Troca da propria senha do sindico (ou contador). A regra fica em api/_lib/contaPropria.js,
// a mesma usada pelo morador: senha atual primeiro, depois a recusa de senha vazada.
export async function POST(req) {
  const originError = rejectForeignOrigin(req)
  if (originError) return originError

  const auth = await requireAdmin(req, { allowPlatformAdmin: false, allowAccountant: true, allowLockedPlan: true })
  if (auth.error) return auth.error

  const body = await parseJsonBody(req)
  if (!body) return json({ error: 'Corpo da requisicao invalido.' }, 400)

  return trocarPropriaSenha(auth.user, body)
}
