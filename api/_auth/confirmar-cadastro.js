// POST /api/auth/confirmar-cadastro (v1.09A5): o sindico tocou em "Confirmar cadastro" no e-mail.
// Publico (o sindico ainda nao entra no sistema). O token chega pelo corpo, nunca pela URL.
// Confirmado: o condominio vira "active" e o teste gratis comeca agora.
import { checkRateLimit, ensureServiceRoleConfig, getClientIp, json, parseJsonBody, rejectForeignOrigin, supabaseAdmin } from '../_lib/supabaseAdmin.js'
import { hashToken } from '../_lib/confirmacaoCadastro.js'
import { buildTrialMetadata } from '../../src/lib/condominiumPlan.js'

const LINK_INVALIDO = 'Este link de confirmacao nao e valido ou ja foi usado. Se voce ja confirmou, e so entrar com seu e-mail e senha.'

export async function POST(req) {
  const originError = rejectForeignOrigin(req)
  if (originError) return originError

  const rateLimitError = checkRateLimit(`confirmar-cadastro:${getClientIp(req)}`, { limit: 20, windowMs: 60 * 60 * 1000 })
  if (rateLimitError) return rateLimitError

  const serviceRoleError = ensureServiceRoleConfig()
  if (serviceRoleError) return json({ error: serviceRoleError }, 503)

  const body = await parseJsonBody(req)
  const token = String(body?.token || '')
  if (!/^[A-Za-z0-9_-]{40,60}$/.test(token)) return json({ error: LINK_INVALIDO }, 400)

  const { data: condominium, error } = await supabaseAdmin
    .from('condominiums')
    .select('id, name, nome, status, metadata')
    .eq('metadata->confirmacao_email->>hash', hashToken(token))
    .maybeSingle()

  if (error) return json({ error: 'Nao foi possivel confirmar agora. Tente de novo em instantes.' }, 500)
  if (!condominium) return json({ error: LINK_INVALIDO }, 404)

  const metadata = condominium.metadata && typeof condominium.metadata === 'object' ? condominium.metadata : {}
  const registro = metadata.confirmacao_email || {}
  const nome = condominium.name || condominium.nome || 'Condominio'

  if (condominium.status !== 'pending') {
    // Bloqueado ou recusado pela plataforma: o link do e-mail nao passa por cima dessa decisao.
    if (condominium.status !== 'active') return json({ error: 'Este cadastro nao pode ser liberado pelo link. Fale com o suporte da TSCBr.' }, 409)
    return json({ success: true, alreadyConfirmed: true, condominiumName: nome })
  }

  if (!registro.expira_em || new Date(registro.expira_em).getTime() < Date.now()) {
    return json({ error: 'Este link expirou (vale 48 horas). Entre com seu e-mail e senha na tela inicial e peca um novo.', code: 'EXPIRADO' }, 410)
  }

  const agora = new Date()
  const { hash: _usado, ...semHash } = registro
  const nextMetadata = {
    ...buildTrialMetadata({ ...metadata, approved_at: agora.toISOString() }, agora),
    confirmacao_email: { ...semHash, confirmado_em: agora.toISOString() },
    approved_via: 'email',
  }

  // "status = pending" no filtro: duas confirmacoes ao mesmo tempo nao passam as duas.
  const { data: updated, error: updateError } = await supabaseAdmin
    .from('condominiums')
    .update({ status: 'active', metadata: nextMetadata, updated_at: agora.toISOString() })
    .eq('id', condominium.id)
    .eq('status', 'pending')
    .select('id')

  if (updateError) return json({ error: 'Nao foi possivel confirmar agora. Tente de novo em instantes.' }, 500)
  if (!updated?.length) return json({ success: true, alreadyConfirmed: true, condominiumName: nome })

  return json({ success: true, condominiumName: nome })
}
