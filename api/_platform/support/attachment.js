import { json, parseJsonBody, rejectForeignOrigin, requirePlatformStaff, supabaseAdmin } from '../../_lib/supabaseAdmin.js'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Link temporario (2 minutos) para um anexo de chamado. So assina arquivo que esta na lista
// do proprio chamado e dentro da pasta do condominio dele.
export async function POST(req) {
  const originError = rejectForeignOrigin(req)
  if (originError) return originError

  const auth = await requirePlatformStaff(req)
  if (auth.error) return auth.error

  const body = await parseJsonBody(req)
  const id = String(body?.id || '')
  const path = String(body?.path || '')
  if (!UUID.test(id) || !path) return json({ error: 'Anexo invalido.' }, 400)

  const { data: ticket, error } = await supabaseAdmin
    .from('suporte_chamados')
    .select('condominium_id, anexos')
    .eq('id', id)
    .maybeSingle()
  if (error) return json({ error: 'Nao foi possivel abrir o anexo.' }, 500)

  const listed = (ticket?.anexos || []).some((anexo) => anexo.path === path)
  if (!ticket || !listed || !path.startsWith(`${ticket.condominium_id}/`) || path.includes('..')) {
    return json({ error: 'Anexo nao encontrado.' }, 404)
  }

  const { data, error: signError } = await supabaseAdmin.storage.from('suporte').createSignedUrl(path, 120)
  if (signError || !data?.signedUrl) return json({ error: 'Nao foi possivel abrir o anexo.' }, 500)

  return json({ url: data.signedUrl })
}
