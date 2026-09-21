import { json, parseJsonBody, rejectForeignOrigin, requireCondominiumAdmin } from '../../_lib/supabaseAdmin.js'
import { describeInvite, getActiveInvite, revokeInvite, rotateInvite } from '../../_lib/signupLink.js'

// Link de auto-cadastro do condominio. Quem chama e sempre o sindico autenticado, e o
// condominio vem do proprio perfil dele: nao ha parametro de condominio nesta rota.
export async function GET(req) {
  const auth = await requireCondominiumAdmin(req)
  if (auth.error) return auth.error

  try {
    const invite = await getActiveInvite(auth.profile.condominium_id)
    return json({ convite: describeInvite(invite) })
  } catch (error) {
    return json({ error: error.message || 'Nao foi possivel consultar o link de cadastro.' }, 500)
  }
}

export async function POST(req) {
  const originError = rejectForeignOrigin(req)
  if (originError) return originError

  const auth = await requireCondominiumAdmin(req)
  if (auth.error) return auth.error

  const body = await parseJsonBody(req)
  const action = String(body?.action || 'gerar').trim().toLowerCase()

  try {
    if (action === 'desativar') {
      await revokeInvite(auth.profile.condominium_id)
      return json({ convite: null })
    }

    if (action !== 'gerar') {
      return json({ error: 'Acao invalida para o link de cadastro.' }, 400)
    }

    const invite = await rotateInvite(auth.profile.condominium_id, auth.profile.id)
    return json({ convite: describeInvite(invite) })
  } catch (error) {
    return json({ error: error.message || 'Nao foi possivel gerar o link de cadastro.' }, 500)
  }
}
