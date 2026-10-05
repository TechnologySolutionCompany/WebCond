// /api/platform/feedbacks (v1.09A5): caixa de feedback da administracao da plataforma.
// GET lista (com o nome do condominio); POST muda o status (novo -> lido -> arquivado).
// So o admin da plataforma: feedback pode falar de qualquer condominio e da propria equipe.
import { json, parseJsonBody, rejectForeignOrigin, requirePlatformAdmin, supabaseAdmin } from '../_lib/supabaseAdmin.js'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const STATUS = new Set(['novo', 'lido', 'arquivado'])

function sqlPendente(error) {
  return error?.code === '42P01' || error?.code === 'PGRST205'
}

export async function GET(req) {
  const auth = await requirePlatformAdmin(req)
  if (auth.error) return auth.error

  const filtro = new URL(req.url, 'http://localhost').searchParams.get('status') || 'ativos'
  let query = supabaseAdmin
    .from('feedbacks')
    .select('id, condominium_id, autor_nome, autor_papel, categoria, nota, mensagem, pagina, versao_app, status, created_at, lido_em')
    .order('created_at', { ascending: false })
    .limit(300)
  if (filtro === 'ativos') query = query.neq('status', 'arquivado')
  else if (STATUS.has(filtro)) query = query.eq('status', filtro)

  const [{ data, error }, { count: novos }] = await Promise.all([
    query,
    supabaseAdmin.from('feedbacks').select('id', { count: 'exact', head: true }).eq('status', 'novo'),
  ])
  if (error) {
    return json({ error: sqlPendente(error) ? 'Tabela de feedback ausente: aplique o SQL 2026-10-03.' : 'Nao foi possivel carregar os feedbacks.', code: sqlPendente(error) ? 'SQL_PENDENTE' : undefined }, sqlPendente(error) ? 503 : 500)
  }

  const condoIds = [...new Set((data || []).map((item) => item.condominium_id).filter(Boolean))]
  const { data: condos } = condoIds.length
    ? await supabaseAdmin.from('condominiums').select('id, name, nome').in('id', condoIds)
    : { data: [] }
  const nomes = new Map((condos || []).map((condo) => [condo.id, condo.name || condo.nome || '']))

  return json({
    novos: novos || 0,
    feedbacks: (data || []).map((item) => ({ ...item, condominio_nome: nomes.get(item.condominium_id) || '' })),
  })
}

export async function POST(req) {
  const originError = rejectForeignOrigin(req)
  if (originError) return originError

  const auth = await requirePlatformAdmin(req)
  if (auth.error) return auth.error

  const body = await parseJsonBody(req)
  if (!body || !UUID.test(String(body.id || '')) || !STATUS.has(body.status)) {
    return json({ error: 'Informe o feedback e o novo status.' }, 400)
  }

  const { error } = await supabaseAdmin
    .from('feedbacks')
    .update({ status: body.status, lido_em: body.status === 'novo' ? null : new Date().toISOString() })
    .eq('id', body.id)
  if (error) return json({ error: 'Nao foi possivel atualizar o feedback.' }, 500)

  const { count: novos } = await supabaseAdmin.from('feedbacks').select('id', { count: 'exact', head: true }).eq('status', 'novo')
  return json({ success: true, novos: novos || 0 })
}
