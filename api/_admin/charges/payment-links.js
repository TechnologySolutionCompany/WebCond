// POST /api/admin/charges-payment-links (v1.09A5): depois de lancar as cobrancas, o sindico pede
// os links "Pagar agora" do banco do condominio. Pix direto: responde sem fazer nada.
import { json, parseJsonBody, rejectForeignOrigin, requireCondominiumAdmin, ensureServiceRoleConfig } from '../../_lib/supabaseAdmin.js'
import { gerarLinksDePagamento } from '../../_lib/pagamentos/index.js'

export async function POST(req) {
  const originError = rejectForeignOrigin(req)
  if (originError) return originError

  const auth = await requireCondominiumAdmin(req)
  if (auth.error) return auth.error

  const serviceRoleError = ensureServiceRoleConfig()
  if (serviceRoleError) return json({ error: serviceRoleError }, 503)

  const body = await parseJsonBody(req)
  if (!body || !Array.isArray(body.chargeIds)) return json({ error: 'Informe as cobrancas.' }, 400)

  try {
    return json(await gerarLinksDePagamento({ condominiumId: auth.profile.condominium_id, chargeIds: body.chargeIds }))
  } catch (error) {
    return json({ error: error.message || 'Nao foi possivel gerar os links de pagamento.' }, 500)
  }
}
