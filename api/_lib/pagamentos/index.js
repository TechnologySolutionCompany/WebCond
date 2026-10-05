// Recebimento das cobrancas por condominio (v1.09A5). As rotas so chamam estas duas funcoes:
//   gerarLinksDePagamento  -> depois que o sindico lanca a cobranca
//   confirmarPagamento     -> webhook do banco ou retorno do navegador
// Novo banco com API = novo arquivo ao lado de infinitepay.js e um "case" aqui.
import { supabaseAdmin } from '../supabaseAdmin.js'
import { lerRecebimento, provedorEfetivo } from '../../../src/lib/recebimento.js'
import { condominiumHasResource } from '../../../src/lib/condominiumPlan.js'
import { consultarPagamentoInfinitePay, criarLinkInfinitePay } from './infinitepay.js'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
// Colunas do SQL 2026-10-03. Antes de aplicar o SQL, gravamos sem elas (o link continua funcionando).
const COLUNAS_NOVAS = ['pagamento_provedor', 'pagamento_ref', 'pagamento_metodo']

export function appUrl() {
  return String(process.env.APP_URL || 'https://webcond.vercel.app').replace(/\/+$/, '')
}

function centavos(valor) {
  return Math.round(Number(valor || 0) * 100)
}

async function atualizarCobranca(id, patch) {
  let { error } = await supabaseAdmin.from('cobrancas').update(patch).eq('id', id)
  if (error && (error.code === 'PGRST204' || error.code === '42703')) {
    const semNovas = Object.fromEntries(Object.entries(patch).filter(([chave]) => !COLUNAS_NOVAS.includes(chave)))
    ;({ error } = await supabaseAdmin.from('cobrancas').update(semNovas).eq('id', id))
  }
  return error
}

async function carregarCondominio(condominiumId) {
  const { data } = await supabaseAdmin
    .from('condominiums')
    .select('id, name, nome, status, metadata, created_at, updated_at')
    .eq('id', condominiumId)
    .maybeSingle()
  return data
}

// O link do recibo chega no corpo do webhook (publico): so vale se for de um dominio da
// InfinitePay/CloudWalk. Assim ninguem grava na cobranca um link para um site qualquer.
const DOMINIOS_RECIBO = ['infinitepay.io', 'cloudwalk.io']
export function reciboDaInfinitePay(valor = '') {
  try {
    const url = new URL(String(valor || ''))
    if (url.protocol !== 'https:' || url.username || url.password) return ''
    const host = url.hostname.toLowerCase()
    return DOMINIOS_RECIBO.some((dominio) => host === dominio || host.endsWith(`.${dominio}`)) ? url.href.slice(0, 500) : ''
  } catch {
    return ''
  }
}

function estaPaga(cobranca) {
  return cobranca?.pago === true || String(cobranca?.payment_status || '').toUpperCase() === 'PAID'
}

// Cria o link "Pagar agora" das cobrancas em aberto do condominio. Pix direto: nada a fazer.
// Devolve { provedor, criados, falhas }. Uma falha nao derruba as outras cobrancas.
export async function gerarLinksDePagamento({ condominiumId, chargeIds }) {
  const resumo = { provedor: 'pix_direto', criados: 0, falhas: 0 }
  const ids = [...new Set((Array.isArray(chargeIds) ? chargeIds : []).filter((id) => UUID.test(String(id))))].slice(0, 500)
  if (!condominiumId || !ids.length) return resumo

  const condominio = await carregarCondominio(condominiumId)
  const config = lerRecebimento(condominio?.metadata)
  resumo.provedor = provedorEfetivo(config)
  if (resumo.provedor !== 'infinitepay') return resumo
  // Vinculo com o banco e baixa automatica: Plano Pro (v2.10A1). Plano vencido ou ONE nao gera link.
  if (!condominio || !condominiumHasResource(condominio, 'baixaAutomatica')) {
    resumo.provedor = 'pix_direto'
    resumo.foraDoPlano = true
    return resumo
  }

  const { data: cobrancas, error } = await supabaseAdmin
    .from('cobrancas')
    .select('id, valor, descricao, unidade_numero, mes_referencia, pago, payment_status, condominium_id, condominio_id, profiles:morador_id(nome, email, whatsapp)')
    .in('id', ids)
  if (error) throw new Error('Nao foi possivel carregar as cobrancas para gerar os links.')

  const nomeCondominio = condominio?.name || condominio?.nome || 'Condominio'
  for (const cobranca of cobrancas || []) {
    // Defesa em profundidade: so cobranca do proprio condominio, em aberto e com valor.
    if ((cobranca.condominium_id || cobranca.condominio_id) !== condominiumId || estaPaga(cobranca) || centavos(cobranca.valor) <= 0) continue
    try {
      const { url } = await criarLinkInfinitePay({
        tag: config.infinitepayTag,
        orderNsu: cobranca.id,
        valorCentavos: centavos(cobranca.valor),
        descricao: `${nomeCondominio} - ${cobranca.descricao || 'Cobranca'}${cobranca.unidade_numero ? ` - Unidade ${cobranca.unidade_numero}` : ''}`,
        cliente: { nome: cobranca.profiles?.nome, email: cobranca.profiles?.email, telefone: cobranca.profiles?.whatsapp },
        redirectUrl: `${appUrl()}/morador?pagina=cobrancas`,
        webhookUrl: `${appUrl()}/api/auth/pagamento-infinitepay`,
      })
      const erro = await atualizarCobranca(cobranca.id, { pagamento_link: url, pagamento_provedor: 'infinitepay' })
      if (erro) resumo.falhas += 1
      else resumo.criados += 1
    } catch {
      resumo.falhas += 1
    }
  }
  return resumo
}

// Confere com o banco e da baixa. condominiumIdEsperado: quando vem de uma sessao (retorno do
// navegador), a cobranca precisa ser do condominio da pessoa.
// Devolve { encontrada, paga, jaEstavaPaga }.
export async function confirmarPagamento({ orderNsu, transactionNsu = '', slug = '', receiptUrl = '', condominiumIdEsperado = null }) {
  if (!UUID.test(String(orderNsu || ''))) return { encontrada: false, paga: false }

  const { data: cobranca } = await supabaseAdmin
    .from('cobrancas')
    .select('id, valor, pago, payment_status, condominium_id, condominio_id')
    .eq('id', orderNsu)
    .maybeSingle()
  if (!cobranca) return { encontrada: false, paga: false }

  const condominiumId = cobranca.condominium_id || cobranca.condominio_id
  if (condominiumIdEsperado && condominiumId !== condominiumIdEsperado) return { encontrada: false, paga: false }
  if (estaPaga(cobranca)) return { encontrada: true, paga: true, jaEstavaPaga: true }

  const config = lerRecebimento((await carregarCondominio(condominiumId))?.metadata)
  if (provedorEfetivo(config) !== 'infinitepay') return { encontrada: true, paga: false }

  const consulta = await consultarPagamentoInfinitePay({
    tag: config.infinitepayTag,
    orderNsu: cobranca.id,
    transactionNsu: String(transactionNsu || '').slice(0, 120),
    slug: String(slug || '').slice(0, 120),
  })

  // Pago e no valor da cobranca (no cartao parcelado o valor pago pode ser maior, com juros).
  if (!consulta.pago || consulta.valorPagoCentavos < centavos(cobranca.valor)) return { encontrada: true, paga: false }

  const agora = new Date()
  const recibo = reciboDaInfinitePay(receiptUrl)
  const erro = await atualizarCobranca(cobranca.id, {
    pago: true,
    payment_status: 'PAID',
    paid_at: agora.toISOString(),
    data_pagamento: agora.toISOString().slice(0, 10),
    ...(recibo ? { receipt_url: recibo } : {}),
    pagamento_provedor: 'infinitepay',
    pagamento_ref: String(transactionNsu || slug || '').slice(0, 120),
    pagamento_metodo: consulta.metodo,
  })
  if (erro) throw new Error('Pagamento confirmado pelo banco, mas a baixa nao foi gravada.')
  return { encontrada: true, paga: true }
}
