import { json, parseJsonBody, rejectForeignOrigin, requirePlatformStaff, supabaseAdmin } from '../../_lib/supabaseAdmin.js'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Conversa de um chamado (sindico <-> suporte), para o painel da plataforma.
// A equipe de suporte nao le nem escreve na tabela direto: tudo passa por aqui.
export async function GET(req) {
  const auth = await requirePlatformStaff(req)
  if (auth.error) return auth.error

  const id = new URL(req.url, 'http://localhost').searchParams.get('id') || ''
  if (!UUID.test(id)) return json({ error: 'Chamado invalido.' }, 400)

  const { data, error } = await supabaseAdmin
    .from('suporte_mensagens')
    .select('id, autor_tipo, autor_nome, mensagem, anexos, created_at')
    .eq('chamado_id', id)
    .order('created_at', { ascending: true })
    .limit(200)
  if (error) {
    const missing = error.code === 'PGRST205' || error.code === '42P01'
    return json({ error: missing ? 'Tabela da conversa ausente: aplique o SQL 2026-09-27.' : 'Nao foi possivel carregar a conversa.' }, missing ? 503 : 500)
  }

  return json({ mensagens: data || [] })
}

// Resposta do suporte. So texto: anexo no chamado e coisa do sindico (pasta do condominio dele).
export async function POST(req) {
  const originError = rejectForeignOrigin(req)
  if (originError) return originError

  const auth = await requirePlatformStaff(req)
  if (auth.error) return auth.error

  const body = await parseJsonBody(req)
  const id = String(body?.id || '')
  const mensagem = String(body?.mensagem || '').trim()

  if (!UUID.test(id)) return json({ error: 'Chamado invalido.' }, 400)
  if (mensagem.length < 1 || mensagem.length > 4000) return json({ error: 'Escreva a resposta (ate 4000 caracteres).' }, 400)

  const { data: ticket, error: ticketError } = await supabaseAdmin
    .from('suporte_chamados')
    .select('id, status')
    .eq('id', id)
    .maybeSingle()
  if (ticketError) return json({ error: 'Nao foi possivel carregar o chamado.' }, 500)
  if (!ticket) return json({ error: 'Chamado nao encontrado.' }, 404)

  const { error } = await supabaseAdmin.from('suporte_mensagens').insert({
    chamado_id: id,
    autor_id: auth.profile.id,
    autor_tipo: 'suporte',
    autor_nome: auth.profile.nome || 'Suporte WebCond',
    mensagem,
  })
  if (error) return json({ error: 'Nao foi possivel enviar a resposta.' }, 500)

  // Chamado parado na fila entra em andamento assim que alguem responde.
  if (ticket.status === 'aberto') {
    await supabaseAdmin.from('suporte_chamados').update({ status: 'em_andamento' }).eq('id', id)
  }

  return json({ success: true, status: ticket.status === 'aberto' ? 'em_andamento' : ticket.status })
}
