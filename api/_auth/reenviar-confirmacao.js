// POST /api/auth/reenviar-confirmacao (v1.09A5): novo e-mail de confirmacao do cadastro.
// Chamado da tela inicial, depois que o sindico entrou com e-mail e senha e viu "confirme seu
// e-mail". Exige a sessao dele: assim ninguem dispara e-mail para o endereco de outra pessoa.
import { checkRateLimit, createUserScopedServerClient, ensureServiceRoleConfig, getProfileCondominiumId, isCondominiumAdminRole, json, rejectForeignOrigin, supabaseAdmin } from '../_lib/supabaseAdmin.js'
import { aguardandoConfirmacao, emailConfigurado, enviarEmail, montarEmailBoasVindas, novoTokenDeConfirmacao } from '../_lib/confirmacaoCadastro.js'

export async function POST(req) {
  const originError = rejectForeignOrigin(req)
  if (originError) return originError

  const serviceRoleError = ensureServiceRoleConfig()
  if (serviceRoleError) return json({ error: serviceRoleError }, 503)
  if (!emailConfigurado()) return json({ error: 'O envio de e-mail ainda nao esta ligado. Fale com o suporte da TSCBr.' }, 503)

  // Aqui nao da para usar requireAuthenticatedProfile: ele recusa justamente condominio pendente.
  const authHeader = req.headers.get('authorization') || ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
  const client = token ? createUserScopedServerClient(token) : null
  const { data: userData } = client ? await client.auth.getUser(token) : { data: null }
  const userId = userData?.user?.id
  if (!userId) return json({ error: 'Entre com seu e-mail e senha para pedir um novo link.' }, 401)

  const rateLimitError = checkRateLimit(`reenviar-confirmacao:${userId}`, { limit: 3, windowMs: 60 * 60 * 1000 })
  if (rateLimitError) return rateLimitError

  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('id, nome, email, role, ativo, condominium_id, condominio_id')
    .eq('id', userId)
    .maybeSingle()
  if (!profile || profile.ativo === false || !isCondominiumAdminRole(profile.role)) {
    return json({ error: 'So o sindico(a) do cadastro pode pedir um novo link.' }, 403)
  }

  const { data: condominium } = await supabaseAdmin
    .from('condominiums')
    .select('id, name, nome, status, metadata')
    .eq('id', getProfileCondominiumId(profile))
    .maybeSingle()
  if (!aguardandoConfirmacao(condominium)) return json({ error: 'Este condominio nao esta esperando confirmacao por e-mail.' }, 409)

  const { token: novoToken, registro } = novoTokenDeConfirmacao()
  const { error } = await supabaseAdmin
    .from('condominiums')
    .update({ metadata: { ...condominium.metadata, confirmacao_email: registro } })
    .eq('id', condominium.id)
  if (error) return json({ error: 'Nao foi possivel gerar um novo link agora.' }, 500)

  const enviado = await enviarEmail({
    to: profile.email,
    ...montarEmailBoasVindas({ nomeSindico: profile.nome, nomeCondominio: condominium.name || condominium.nome, token: novoToken }),
  })
  if (!enviado) return json({ error: 'Nao foi possivel enviar o e-mail agora. Tente de novo em alguns minutos.' }, 502)
  return json({ success: true, email: profile.email })
}
