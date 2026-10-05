// POST /api/platform/assinatura-webhook (v2.10A1): avisos do Asaas sobre a assinatura dos planos.
// Contrato em docs/plano-pro-v1.10.md, secao 2.4:
//   1. confere o token do webhook ANTES de qualquer coisa (header asaas-access-token);
//   2. grava em assinatura_eventos com chave de idempotencia (o Asaas entrega "pelo menos uma vez");
//   3. traduz o evento e aplica no condominio (activatePlanMetadata + buildAssinaturaMetadata);
//   4. responde 200 rapido. Erro de processamento devolve 500 para o Asaas tentar de novo.
import { timingSafeEqual } from 'node:crypto'
import { json, parseJsonBody, supabaseAdmin } from '../_lib/supabaseAdmin.js'
import { asaasConfigurado, resumoSeguroDoEvento, traduzirEventoAsaas } from '../_lib/assinatura/asaas.js'
import { buildAssinaturaMetadata, readAssinatura } from '../../src/lib/assinatura.js'
import { activatePlanMetadata, normalizePlanName, PLAN_PERIOD_DAYS, PLANS } from '../../src/lib/condominiumPlan.js'

const DIA_MS = 86400000

function tokenConfere(recebido) {
  const esperado = Buffer.from(String(process.env.ASAAS_WEBHOOK_TOKEN || ''))
  const veio = Buffer.from(String(recebido || ''))
  return esperado.length > 0 && esperado.length === veio.length && timingSafeEqual(esperado, veio)
}

async function acharCondominio(assinaturaId) {
  if (!assinaturaId) return null
  const { data } = await supabaseAdmin
    .from('condominiums')
    .select('id, status, metadata, created_at, updated_at')
    .eq('metadata->assinatura->>assinatura_externa_id', assinaturaId)
    .maybeSingle()
  return data
}

// Pagamento aprovado: plano ativo por mais um ciclo, a partir do vencimento atual se ainda nao
// venceu (quem paga adiantado nao perde dias) ou de hoje se ja venceu.
export function metadataAposPagamento(metadata, plano, agora = new Date()) {
  const nome = normalizePlanName(plano)
  const vencimentoAtual = metadata?.plan_expires_at ? new Date(metadata.plan_expires_at) : null
  const base = vencimentoAtual && vencimentoAtual > agora ? vencimentoAtual : agora
  const novoVencimento = new Date(base.getTime() + PLAN_PERIOD_DAYS * DIA_MS)
  const comPlano = { ...metadata, plan_name: nome, plan_price_cents: PLANS[nome].priceCents, plan_expires_at: null }
  return activatePlanMetadata(comPlano, agora, novoVencimento)
}

export async function POST(req) {
  if (!asaasConfigurado()) return json({ error: 'Webhook desligado.' }, 503)
  if (!tokenConfere(req.headers.get('asaas-access-token'))) return json({ error: 'Nao autorizado.' }, 401)

  const body = await parseJsonBody(req)
  if (!body?.id || !body?.event) return json({ ok: true })

  const resumo = resumoSeguroDoEvento(body)
  const assinaturaId = resumo.payment?.subscription || resumo.subscription?.id || ''
  const evento = traduzirEventoAsaas(body.event)
  const condominio = await acharCondominio(assinaturaId)
  const assinaturaAtual = readAssinatura(condominio?.metadata)
  // Plano: o gravado ao contratar; senao, o que foi na referencia ("<condominio>:<PLANO>").
  const referencia = resumo.payment?.externalReference || resumo.subscription?.externalReference || ''
  const plano = assinaturaAtual.plano || String(referencia.split(':')[1] || '').toUpperCase()

  const { data: registro, error: insertError } = await supabaseAdmin
    .from('assinatura_eventos')
    .insert({
      condominium_id: condominio?.id || null,
      provedor: 'asaas',
      assinatura_externa_id: assinaturaId.slice(0, 120),
      cobranca_externa_id: String(resumo.payment?.id || '').slice(0, 120),
      evento,
      plano: plano.slice(0, 40),
      valor_centavos: Math.round(Number(resumo.payment?.value || 0) * 100),
      payload: resumo,
      chave_idempotencia: String(body.id).slice(0, 200),
    })
    .select('id')
    .maybeSingle()

  // Mesmo evento de novo: ja foi tratado.
  if (insertError?.code === '23505') return json({ ok: true, repetido: true })
  if (insertError) return json({ error: 'Falha ao registrar o evento.' }, 500)

  // Assinatura que nao e (mais) de nenhum condominio, ou evento so informativo: fica so registrado.
  if (!condominio || !['pagamento.aprovado', 'pagamento.estornado', 'assinatura.cancelada'].includes(evento)) {
    return json({ ok: true })
  }

  const metadata = condominio.metadata && typeof condominio.metadata === 'object' ? condominio.metadata : {}
  let proximo = metadata
  if (evento === 'pagamento.aprovado') {
    proximo = buildAssinaturaMetadata(metadataAposPagamento(metadata, plano), {
      status: 'active',
      proximaCobrancaEm: null,
    })
  } else if (evento === 'pagamento.estornado') {
    // Dinheiro devolvido: o plano pago acaba agora (o painel fica so leitura ate pagar de novo).
    proximo = buildAssinaturaMetadata({ ...metadata, plan_expires_at: new Date().toISOString() }, { status: 'estornada' })
  } else if (evento === 'assinatura.cancelada') {
    // Cancelou: nada e cortado na hora; o plano vale ate o vencimento que ja foi pago.
    proximo = buildAssinaturaMetadata(metadata, { status: 'cancelada' })
  }

  const { error: updateError } = await supabaseAdmin.from('condominiums').update({ metadata: proximo }).eq('id', condominio.id)
  if (updateError) {
    // Desfaz o registro para a nova tentativa do Asaas nao ser barrada como repetida.
    await supabaseAdmin.from('assinatura_eventos').delete().eq('id', registro?.id)
    return json({ error: 'Falha ao aplicar o evento.' }, 500)
  }

  await supabaseAdmin.from('assinatura_eventos').update({ processado_em: new Date().toISOString() }).eq('id', registro?.id)
  return json({ ok: true })
}
