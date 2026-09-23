import { ensureServiceRoleConfig, json, parseJsonBody, rejectForeignOrigin, requireAuthenticatedProfile, supabaseAdmin } from '../../_lib/supabaseAdmin.js'

// Desliga as notificacoes de um aparelho da propria pessoa (tambem chamado ao clicar em Sair).
// Sem endpoint e com { todos: true }, desliga todos os aparelhos da pessoa.
export async function POST(req) {
  const originError = rejectForeignOrigin(req)
  if (originError) return originError

  const auth = await requireAuthenticatedProfile(req)
  if (auth.error) return auth.error

  const serviceError = ensureServiceRoleConfig()
  if (serviceError) return json({ error: serviceError }, 503)

  const body = await parseJsonBody(req)
  const endpoint = String(body?.endpoint || '')
  if (!endpoint && body?.todos !== true) return json({ error: 'Informe o aparelho.' }, 400)

  let query = supabaseAdmin.from('push_inscricoes').delete().eq('profile_id', auth.profile.id)
  if (endpoint) query = query.eq('endpoint', endpoint)
  const { error } = await query
  if (error) return json({ error: 'Nao foi possivel desligar as notificacoes.' }, 500)

  return json({ success: true })
}
