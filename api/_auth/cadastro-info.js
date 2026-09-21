import { checkRateLimit, ensureServiceRoleConfig, getClientIp, json } from '../_lib/supabaseAdmin.js'
import { getCondominiumAccessState } from '../../src/lib/condominiumPlan.js'
import { resolveInvite } from '../_lib/signupLink.js'
import { POLICY_VERSION } from '../../src/lib/politicas.js'

const MOTIVOS = {
  LINK_INVALIDO: 'Este link de cadastro nao esta mais valido. Peca um link novo ao sindico.',
  LINK_EXPIRADO: 'Este link de cadastro expirou. Peca um link novo ao sindico.',
  FALHA: 'Nao foi possivel validar o link agora. Tente novamente em alguns instantes.',
}

// Abre o formulario publico: diz apenas o nome do condominio do token.
// Nunca devolve id, lista de unidades ou qualquer dado de morador.
export async function GET(req) {
  const rateLimitError = checkRateLimit(`cadastro-info:${getClientIp(req)}`, { limit: 30, windowMs: 10 * 60 * 1000 })
  if (rateLimitError) return rateLimitError

  const serviceRoleError = ensureServiceRoleConfig()
  if (serviceRoleError) return json({ error: serviceRoleError }, 503)

  const { searchParams } = new URL(req.url, 'http://localhost')
  const resolved = await resolveInvite(searchParams.get('token'))

  if (resolved.error) {
    return json({ code: resolved.error, error: MOTIVOS[resolved.error] || MOTIVOS.FALHA }, resolved.error === 'FALHA' ? 503 : 404)
  }

  const access = getCondominiumAccessState(resolved.condominium)
  // Plano vencido deixa o painel so para leitura: o sindico nao consegue aprovar, entao nao recebe cadastro.
  if (access.shouldBlockAccess || access.planLocked) {
    return json({ code: 'CONDOMINIO_INDISPONIVEL', error: 'Este condominio ainda nao esta liberado na plataforma. Fale com o sindico.' }, 403)
  }

  return json({
    condominio: resolved.condominium.name || resolved.condominium.nome || 'Condominio',
    politicaVersao: POLICY_VERSION,
  })
}
