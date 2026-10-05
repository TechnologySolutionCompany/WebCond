// POST /api/tenant/feedback e /api/admin/feedback (v1.09A5): qualquer pessoa logada (morador,
// sindico, contador) manda feedback direto para a administracao da plataforma.
// Grava pelo servidor: a tabela feedbacks nao tem policy nenhuma (ver SQL 2026-10-03).
import { checkRateLimit, ensureServiceRoleConfig, json, parseJsonBody, rejectForeignOrigin, requireAuthenticatedProfile, supabaseAdmin } from './supabaseAdmin.js'
import { CATEGORIAS_FEEDBACK } from '../../src/lib/feedback.js'

export async function POST(req) {
  const originError = rejectForeignOrigin(req)
  if (originError) return originError

  const auth = await requireAuthenticatedProfile(req)
  if (auth.error) return auth.error

  const serviceRoleError = ensureServiceRoleConfig()
  if (serviceRoleError) return json({ error: serviceRoleError }, 503)

  const rateLimitError = checkRateLimit(`feedback:${auth.profile.id}`, { limit: 5, windowMs: 10 * 60 * 1000 })
  if (rateLimitError) return rateLimitError

  const body = await parseJsonBody(req)
  if (!body) return json({ error: 'Corpo da requisicao invalido.' }, 400)

  const mensagem = String(body.mensagem || '').trim()
  const categoria = CATEGORIAS_FEEDBACK.some((item) => item.key === body.categoria) ? body.categoria : 'sugestao'
  const notaNumero = Number(body.nota)
  const nota = Number.isInteger(notaNumero) && notaNumero >= 1 && notaNumero <= 5 ? notaNumero : null

  if (mensagem.length < 5) return json({ error: 'Escreva pelo menos uma frase.' }, 400)
  if (mensagem.length > 2000) return json({ error: 'O feedback pode ter no maximo 2000 caracteres.' }, 400)

  const { error } = await supabaseAdmin.from('feedbacks').insert({
    condominium_id: auth.profile.condominium_id || null,
    profile_id: auth.profile.id,
    autor_nome: String(auth.profile.nome || '').slice(0, 120),
    autor_papel: String(auth.profile.role || '').slice(0, 40),
    categoria,
    nota,
    mensagem,
    pagina: String(body.pagina || '').replace(/[^a-z0-9_-]/gi, '').slice(0, 40),
    versao_app: String(body.versao || '').replace(/[^a-z0-9.]/gi, '').slice(0, 20),
  })

  if (error) {
    const pendente = error.code === '42P01' || error.code === 'PGRST205'
    return json({ error: pendente ? 'O feedback ainda nao esta ativo no banco (SQL 2026-10-03 pendente).' : 'Nao foi possivel enviar o feedback agora.' }, pendente ? 503 : 500)
  }

  return json({ success: true })
}
