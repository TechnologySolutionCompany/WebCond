// Espaco da assinatura: onde a conexao com o banco/provedor de pagamento vai entrar (v1.10).
//
// Hoje nada e cobrado dentro do sistema. O sindico escolhe o plano na tela "Planos e valores"
// e fala com a TSCBr pelo WhatsApp; quem ativa o plano e a administracao da plataforma.
//
// Quando a conta de recebimento estiver escolhida, nao e preciso mexer em tela nenhuma:
//   1. preencha VITE_ASSINATURA_PROVEDOR e VITE_ASSINATURA_CHECKOUT_URL (veja .env.example);
//   2. o botao "Quero o plano X" passa a abrir o checkout em vez do WhatsApp;
//   3. o webhook do provedor grava em public.assinatura_eventos (SQL 2026-09-28) e a rotina
//      de ativacao le dali.
// O contrato completo esta em docs/plano-pro-v1.10.md.

import { getPlan, normalizePlanName } from './condominiumPlan.js'

// Catalogo informativo: nada aqui liga sozinho, serve para o valor da variavel de ambiente
// ser escrito sempre igual.
export const PROVEDORES = {
  nenhum: { id: 'nenhum', label: 'Nenhum (contratacao pelo WhatsApp)' },
  mercadopago: { id: 'mercadopago', label: 'Mercado Pago' },
  asaas: { id: 'asaas', label: 'Asaas' },
  pagarme: { id: 'pagarme', label: 'Pagar.me' },
  stripe: { id: 'stripe', label: 'Stripe' },
}

// Eventos que o webhook vai receber. Mesma lista usada no comentario do SQL.
export const EVENTOS_ASSINATURA = [
  'assinatura.criada',
  'assinatura.renovada',
  'assinatura.cancelada',
  'pagamento.aprovado',
  'pagamento.recusado',
  'pagamento.estornado',
]

// Em Node (testes) import.meta.env nao existe: cai em objeto vazio sem quebrar.
function ambiente() {
  return import.meta.env || {}
}

export function getAssinaturaConfig(env = ambiente()) {
  const provedor = String(env.VITE_ASSINATURA_PROVEDOR || '').trim().toLowerCase()
  const checkoutUrl = String(env.VITE_ASSINATURA_CHECKOUT_URL || '').trim()
  const conhecido = Boolean(PROVEDORES[provedor]) && provedor !== 'nenhum'

  return {
    provedor: conhecido ? provedor : 'nenhum',
    label: PROVEDORES[conhecido ? provedor : 'nenhum'].label,
    checkoutUrl,
    // So esta ligado quando ha provedor conhecido E endereco de checkout.
    ativo: conhecido && checkoutUrl.startsWith('https://'),
  }
}

// Endereco de contratacao do plano. Devolve null enquanto nao houver provedor: quem chama
// mantem o caminho de hoje (WhatsApp da TSCBr), sem tela quebrada no meio.
export function buildCheckoutUrl({ plano, condominiumId = '', condominiumName = '' } = {}, env = ambiente()) {
  const config = getAssinaturaConfig(env)
  if (!config.ativo) return null

  const nome = normalizePlanName(plano)
  const url = new URL(config.checkoutUrl)
  url.searchParams.set('plano', nome)
  url.searchParams.set('valor_centavos', String(getPlan(nome).priceCents))
  if (condominiumId) url.searchParams.set('condominio', condominiumId)
  if (condominiumName) url.searchParams.set('referencia', condominiumName)
  return url.toString()
}

// Le o que o provedor ja gravou no condominio (condominiums.metadata.assinatura).
// Enquanto ninguem escreve nada, devolve tudo vazio.
export function readAssinatura(metadata = {}) {
  const raw = metadata && typeof metadata === 'object' ? (metadata.assinatura || {}) : {}

  return {
    provedor: String(raw.provedor || '').trim().toLowerCase(),
    assinaturaExternaId: String(raw.assinatura_externa_id || '').trim(),
    status: String(raw.status || '').trim().toLowerCase(),
    proximaCobrancaEm: raw.proxima_cobranca_em || null,
    atualizadoEm: raw.atualizado_em || null,
  }
}

// Grava o retorno do provedor dentro do metadata, sem apagar o que ja existe (plano, datas
// de teste, vencimento). Quem chama continua responsavel por salvar no banco.
export function buildAssinaturaMetadata(metadata = {}, patch = {}) {
  const atual = readAssinatura(metadata)
  const base = metadata && typeof metadata === 'object' ? metadata : {}

  return {
    ...base,
    assinatura: {
      provedor: patch.provedor ?? atual.provedor,
      assinatura_externa_id: patch.assinaturaExternaId ?? atual.assinaturaExternaId,
      status: patch.status ?? atual.status,
      proxima_cobranca_em: patch.proximaCobrancaEm ?? atual.proximaCobrancaEm,
      atualizado_em: new Date().toISOString(),
    },
  }
}

// Traducao do evento do provedor para o estado que o WebCond entende hoje
// (condominiums.metadata.subscription_status: 'active' ou 'trial').
export function statusDoEvento(evento) {
  const nome = String(evento || '').trim().toLowerCase()
  if (nome === 'assinatura.criada' || nome === 'assinatura.renovada' || nome === 'pagamento.aprovado') return 'active'
  if (nome === 'assinatura.cancelada' || nome === 'pagamento.estornado') return 'trial'
  // 'pagamento.recusado' nao derruba o plano na hora: o vencimento ja cuida disso.
  return ''
}

export function describeAssinatura(metadata = {}) {
  const assinatura = readAssinatura(metadata)
  if (!assinatura.provedor) return 'Contratacao pelo WhatsApp da TSCBr.'

  const label = PROVEDORES[assinatura.provedor]?.label || assinatura.provedor
  const situacao = assinatura.status === 'active' ? 'ativa' : (assinatura.status || 'sem situacao')
  return `Assinatura ${situacao} em ${label}.`
}
