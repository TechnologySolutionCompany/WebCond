// POST /api/tenant/payment-check (v1.09A5): o morador voltou do "Pagar agora" da InfinitePay.
// Reserva do webhook: se o aviso do banco atrasar, a baixa acontece aqui, na volta para o app.
// So confere cobranca do condominio de quem esta logado, e sempre consultando o banco.
import { checkRateLimit, json, parseJsonBody, rejectForeignOrigin, requireAuthenticatedProfile } from '../_lib/supabaseAdmin.js'
import { confirmarPagamento } from '../_lib/pagamentos/index.js'

export async function POST(req) {
  const originError = rejectForeignOrigin(req)
  if (originError) return originError

  const auth = await requireAuthenticatedProfile(req)
  if (auth.error) return auth.error

  const rateLimitError = checkRateLimit(`payment-check:${auth.profile.id}`, { limit: 20, windowMs: 10 * 60 * 1000 })
  if (rateLimitError) return rateLimitError

  const body = await parseJsonBody(req)
  if (!body?.orderNsu) return json({ error: 'Pedido nao informado.' }, 400)

  try {
    const result = await confirmarPagamento({
      orderNsu: String(body.orderNsu),
      transactionNsu: String(body.transactionNsu || ''),
      slug: String(body.slug || ''),
      condominiumIdEsperado: auth.profile.condominium_id,
    })
    if (!result.encontrada) return json({ error: 'Cobranca nao encontrada.' }, 404)
    return json({ paid: result.paga })
  } catch {
    return json({ error: 'Nao foi possivel conferir o pagamento com o banco agora.' }, 502)
  }
}
