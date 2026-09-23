import { checkRateLimit, ensureServiceRoleConfig, json, parseJsonBody, rejectForeignOrigin, requireAdmin } from '../../_lib/supabaseAdmin.js'
import { dispatchAvisos, dispatchSupportTicket } from '../../_lib/notify.js'
import { NOTIFY_MAX_IDS } from '../../../src/lib/notifications.js'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Depois de publicar um aviso, lancar uma cobranca ou abrir um chamado, o painel pede o envio.
// So sai notificacao de registro do proprio condominio, criado nas ultimas 24 h e ainda nao enviado.
export async function POST(req) {
  const originError = rejectForeignOrigin(req)
  if (originError) return originError

  // Plano vencido: avisos nem chegam a ser gravados, mas o chamado de suporte continua liberado.
  const auth = await requireAdmin(req, { allowPlatformAdmin: false, allowAccountant: true, allowLockedPlan: true })
  if (auth.error) return auth.error

  const serviceError = ensureServiceRoleConfig()
  if (serviceError) return json({ error: serviceError }, 503)

  const limited = checkRateLimit(`notify:${auth.profile.id}`, { limit: 60, windowMs: 10 * 60 * 1000 })
  if (limited) return limited

  const body = await parseJsonBody(req)
  if (!body) return json({ error: 'Corpo da requisicao invalido.' }, 400)

  const condominiumId = auth.profile.condominium_id

  try {
    if (body.chamado) {
      if (!UUID.test(String(body.chamado))) return json({ error: 'Chamado invalido.' }, 400)
      return json(await dispatchSupportTicket({ condominiumId, ticketId: String(body.chamado) }))
    }

    const ids = [...new Set((Array.isArray(body.avisos) ? body.avisos : []).map(String))]
    if (!ids.length || ids.length > NOTIFY_MAX_IDS || !ids.every((id) => UUID.test(id))) {
      return json({ error: 'Lista de avisos invalida.' }, 400)
    }
    return json(await dispatchAvisos({ condominiumId, ids }))
  } catch {
    return json({ error: 'Nao foi possivel enviar as notificacoes agora.' }, 500)
  }
}
