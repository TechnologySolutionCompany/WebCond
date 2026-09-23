import { json, parseJsonBody, rejectForeignOrigin, requirePlatformStaff, supabaseAdmin } from '../../_lib/supabaseAdmin.js'
import { getCondominiumAccessState, getPlan } from '../../../src/lib/condominiumPlan.js'
import { isRealEmail } from '../../../src/lib/notifications.js'

const STATUS = new Set(['aberto', 'em_andamento', 'resolvido'])
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Chamados de suporte para a equipe da plataforma (admin e suporte). Devolve so o que o
// atendimento precisa: o chamado, o condominio (nome, plano, situacao) e o contato do sindico.
// Nada de CPF, cobrancas, moradores ou documentos do condominio.
export async function GET(req) {
  const auth = await requirePlatformStaff(req)
  if (auth.error) return auth.error

  // O quadro mostra as tres colunas de uma vez; "abertos" continua valendo para o contador do menu.
  const filtro = new URL(req.url, 'http://localhost').searchParams.get('filtro') || 'todos'

  let query = supabaseAdmin
    .from('suporte_chamados')
    .select('id, condominium_id, created_by, assunto, mensagem, anexos, status, resposta, respondido_por, respondido_em, created_at, updated_at, ultima_mensagem_em')
    .order('created_at', { ascending: false })
    .limit(300)
  if (filtro === 'abertos') query = query.neq('status', 'resolvido')
  else if (['aberto', 'em_andamento', 'resolvido'].includes(filtro)) query = query.eq('status', filtro)

  const [{ data: tickets, error }, { count: abertos }] = await Promise.all([
    query,
    supabaseAdmin.from('suporte_chamados').select('id', { count: 'exact', head: true }).neq('status', 'resolvido'),
  ])
  // Antes do SQL 09-27 a coluna ultima_mensagem_em ainda nao existe: a tela continua funcionando.
  let lista = tickets
  let listaErro = error
  if (error?.code === '42703') {
    const retry = await supabaseAdmin
      .from('suporte_chamados')
      .select('id, condominium_id, created_by, assunto, mensagem, anexos, status, resposta, respondido_por, respondido_em, created_at, updated_at')
      .order('created_at', { ascending: false })
      .limit(300)
    lista = retry.data
    listaErro = retry.error
  }
  if (listaErro) {
    const missing = listaErro.code === 'PGRST205' || listaErro.code === '42P01'
    return json({ error: missing ? 'Tabela de chamados ausente: aplique o SQL 2026-09-25.' : 'Nao foi possivel carregar os chamados.', code: missing ? 'SQL_PENDENTE' : undefined }, missing ? 503 : 500)
  }

  const condoIds = [...new Set((lista || []).map((ticket) => ticket.condominium_id))]
  const peopleIds = [...new Set((lista || []).flatMap((ticket) => [ticket.created_by, ticket.respondido_por]).filter(Boolean))]

  const [{ data: condos }, { data: people }] = await Promise.all([
    condoIds.length
      ? supabaseAdmin.from('condominiums').select('id, name, nome, status, metadata, created_at, updated_at').in('id', condoIds)
      : { data: [] },
    peopleIds.length
      ? supabaseAdmin.from('profiles').select('id, nome, email, whatsapp').in('id', peopleIds)
      : { data: [] },
  ])

  const condoById = new Map((condos || []).map((condo) => {
    const state = getCondominiumAccessState(condo)
    return [condo.id, {
      nome: condo.name || condo.nome || 'Condominio',
      plano: state.subscriptionStatus === 'active' ? getPlan(state.planName).label : 'Teste gratuito',
      situacao: state.planLocked ? 'Plano vencido' : state.effectiveStatus === 'active' ? 'Ativo' : state.effectiveStatus,
    }]
  }))
  const personById = new Map((people || []).map((person) => [person.id, person]))

  return json({
    abertos: abertos || 0,
    tickets: (lista || []).map((ticket) => {
      const author = personById.get(ticket.created_by)
      const lastAt = ticket.ultima_mensagem_em || ticket.created_at
      const answeredAt = ticket.respondido_em || ''
      return {
        id: ticket.id,
        assunto: ticket.assunto,
        mensagem: ticket.mensagem,
        anexos: (ticket.anexos || []).map((anexo) => ({ path: anexo.path, nome: anexo.nome, tipo: anexo.tipo, tamanho: anexo.tamanho })),
        status: ticket.status,
        resposta: ticket.resposta,
        respondido_em: ticket.respondido_em,
        respondido_por: personById.get(ticket.respondido_por)?.nome || '',
        created_at: ticket.created_at,
        ultima_mensagem_em: lastAt,
        // Ultima palavra foi do sindico: o chamado esta esperando a gente.
        aguardando_suporte: !answeredAt || new Date(lastAt).getTime() > new Date(answeredAt).getTime(),
        condominio: condoById.get(ticket.condominium_id) || { nome: 'Condominio', plano: '-', situacao: '-' },
        autor: author
          ? { nome: author.nome || 'Sindico', whatsapp: author.whatsapp || '', email: isRealEmail(author.email) ? author.email : '' }
          : { nome: 'Sindico', whatsapp: '', email: '' },
      }
    }),
  })
}

// Move o chamado entre as colunas (Aberto, Em andamento, Concluido). A resposta em si vai
// pela conversa, em /api/platform/support-messages. O chamado nunca e apagado por aqui.
export async function POST(req) {
  const originError = rejectForeignOrigin(req)
  if (originError) return originError

  const auth = await requirePlatformStaff(req)
  if (auth.error) return auth.error

  const body = await parseJsonBody(req)
  const id = String(body?.id || '')
  const status = String(body?.status || '')

  if (!UUID.test(id)) return json({ error: 'Chamado invalido.' }, 400)
  if (!STATUS.has(status)) return json({ error: 'Status invalido.' }, 400)

  const { data: current, error: currentError } = await supabaseAdmin
    .from('suporte_chamados')
    .select('id')
    .eq('id', id)
    .maybeSingle()
  if (currentError) return json({ error: 'Nao foi possivel carregar o chamado.' }, 500)
  if (!current) return json({ error: 'Chamado nao encontrado.' }, 404)

  const { error } = await supabaseAdmin.from('suporte_chamados').update({ status }).eq('id', id)
  if (error) return json({ error: 'Nao foi possivel mover o chamado.' }, 500)

  return json({ success: true })
}
