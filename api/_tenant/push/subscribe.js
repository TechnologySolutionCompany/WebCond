import { checkRateLimit, ensureServiceRoleConfig, json, parseJsonBody, rejectForeignOrigin, requireAuthenticatedProfile, supabaseAdmin } from '../../_lib/supabaseAdmin.js'
import { isAllowedPushEndpoint } from '../../../src/lib/notifications.js'

const MAX_DEVICES = 10

// Liga as notificacoes neste aparelho. O aparelho fica com quem entrou por ultimo nele:
// num computador compartilhado, a inscricao anterior (de outra pessoa) e substituida.
export async function POST(req) {
  const originError = rejectForeignOrigin(req)
  if (originError) return originError

  const auth = await requireAuthenticatedProfile(req)
  if (auth.error) return auth.error

  const serviceError = ensureServiceRoleConfig()
  if (serviceError) return json({ error: serviceError }, 503)

  const limited = checkRateLimit(`push:${auth.profile.id}`, { limit: 20, windowMs: 10 * 60 * 1000 })
  if (limited) return limited

  const body = await parseJsonBody(req)
  const subscription = body?.subscription || {}
  const endpoint = String(subscription.endpoint || '')
  const p256dh = String(subscription.keys?.p256dh || '')
  const authKey = String(subscription.keys?.auth || '')
  const dispositivo = String(body?.dispositivo || '').replace(/[^\p{L}\p{N} ._()/-]/gu, '').slice(0, 120)

  if (!isAllowedPushEndpoint(endpoint)) return json({ error: 'Servico de notificacao do navegador nao reconhecido.' }, 400)
  if (!/^[A-Za-z0-9_-]{20,200}$/.test(p256dh) || !/^[A-Za-z0-9_-]{8,100}$/.test(authKey)) {
    return json({ error: 'Chaves de notificacao invalidas.' }, 400)
  }

  const { error: releaseError } = await supabaseAdmin.from('push_inscricoes').delete().eq('endpoint', endpoint)
  if (releaseError) return json({ error: 'Nao foi possivel ativar as notificacoes.' }, 500)

  const { error } = await supabaseAdmin.from('push_inscricoes').insert({
    profile_id: auth.profile.id,
    endpoint,
    p256dh,
    auth: authKey,
    dispositivo,
  })
  if (error) return json({ error: 'Nao foi possivel ativar as notificacoes.' }, 500)

  // Limite de aparelhos por pessoa: os mais antigos saem.
  const { data: devices } = await supabaseAdmin
    .from('push_inscricoes')
    .select('id')
    .eq('profile_id', auth.profile.id)
    .order('created_at', { ascending: false })
  const extra = (devices || []).slice(MAX_DEVICES).map((device) => device.id)
  if (extra.length) await supabaseAdmin.from('push_inscricoes').delete().in('id', extra)

  return json({ success: true })
}
