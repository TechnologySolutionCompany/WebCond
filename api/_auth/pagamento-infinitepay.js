// Webhook da InfinitePay (v1.09A5): POST /api/auth/pagamento-infinitepay
// Publico por natureza (quem chama e a InfinitePay). O corpo NAO e prova de pagamento: so diz
// qual pedido conferir. A baixa so acontece depois da consulta oficial (payment_check).
// Resposta 200 = recebido; 400 = a InfinitePay tenta de novo mais tarde.
import { checkRateLimit, ensureServiceRoleConfig, getClientIp, json, parseJsonBody } from '../_lib/supabaseAdmin.js'
import { confirmarPagamento } from '../_lib/pagamentos/index.js'

export async function POST(req) {
  const rateLimitError = checkRateLimit(`webhook-infinitepay:${getClientIp(req)}`, { limit: 120, windowMs: 60 * 1000 })
  if (rateLimitError) return rateLimitError

  const serviceRoleError = ensureServiceRoleConfig()
  if (serviceRoleError) return json({ error: 'Indisponivel.' }, 400)

  const body = await parseJsonBody(req)
  if (!body?.order_nsu) return json({ ok: true })

  try {
    const result = await confirmarPagamento({
      orderNsu: String(body.order_nsu),
      transactionNsu: String(body.transaction_nsu || ''),
      slug: String(body.invoice_slug || body.slug || ''),
      receiptUrl: String(body.receipt_url || ''),
    })
    // Pedido que nao e do WebCond: 200 para nao ficar recebendo de novo.
    if (!result.encontrada) return json({ ok: true })
    // O banco ainda nao confirmou: pede para tentar de novo.
    if (!result.paga) return json({ ok: false }, 400)
    return json({ ok: true })
  } catch {
    return json({ ok: false }, 400)
  }
}
