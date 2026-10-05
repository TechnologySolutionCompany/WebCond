// Asaas: cobranca da assinatura dos planos ONE / PRO / MAX (v2.10A1).
// Quem paga e o condominio (cliente = CPF/CNPJ do condominio); quem recebe e a TSCBr.
// A chave de API fica so no servidor (ASAAS_API_KEY). Ambiente: ASAAS_AMBIENTE = sandbox | producao.
// Referencia: https://docs.asaas.com (clientes, assinaturas, webhooks).
const BASES = {
  producao: 'https://api.asaas.com/v3',
  sandbox: 'https://api-sandbox.asaas.com/v3',
}
const TIMEOUT_MS = 12000

export function asaasConfigurado(env = process.env) {
  return Boolean(env.ASAAS_API_KEY && env.ASAAS_WEBHOOK_TOKEN)
}

function base(env = process.env) {
  return BASES[String(env.ASAAS_AMBIENTE || '').toLowerCase() === 'producao' ? 'producao' : 'sandbox']
}

async function chamar(metodo, caminho, corpo) {
  const response = await fetch(`${base()}${caminho}`, {
    method: metodo,
    headers: {
      access_token: process.env.ASAAS_API_KEY,
      'Content-Type': 'application/json',
      // O Asaas exige User-Agent nas chamadas da API.
      'User-Agent': 'WebCond/2.10 (TSCBr)',
    },
    body: corpo ? JSON.stringify(corpo) : undefined,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    // So a descricao do Asaas (ex.: "CPF/CNPJ invalido"). Nunca a chave nem a resposta crua.
    const descricao = Array.isArray(data?.errors) ? data.errors.map((item) => item.description).filter(Boolean).join(' ') : ''
    const error = new Error(descricao || `Asaas respondeu ${response.status}.`)
    error.status = response.status
    throw error
  }
  return data
}

export async function criarClienteAsaas({ nome, cpfCnpj, email, telefone, referencia }) {
  const data = await chamar('POST', '/customers', {
    name: String(nome || 'Condominio').slice(0, 120),
    cpfCnpj: String(cpfCnpj || '').replace(/\D/g, ''),
    ...(email ? { email } : {}),
    ...(telefone ? { mobilePhone: String(telefone).replace(/\D/g, '').replace(/^55(?=\d{10,11}$)/, '') } : {}),
    externalReference: referencia,
    notificationDisabled: false,
  })
  return data.id
}

// billingType UNDEFINED: o condominio escolhe Pix, boleto ou cartao na pagina do Asaas.
export async function criarAssinaturaAsaas({ cliente, valorCentavos, descricao, referencia, primeiroVencimento }) {
  const data = await chamar('POST', '/subscriptions', {
    customer: cliente,
    billingType: 'UNDEFINED',
    value: Number((valorCentavos / 100).toFixed(2)),
    nextDueDate: primeiroVencimento,
    cycle: 'MONTHLY',
    description: String(descricao || 'Assinatura WebCond').slice(0, 500),
    externalReference: referencia,
  })
  return { id: data.id }
}

// Cobranca em aberto da assinatura (a primeira, logo depois de criar): e o link que o sindico abre.
export async function cobrancaEmAbertoAsaas(assinaturaId) {
  const data = await chamar('GET', `/subscriptions/${encodeURIComponent(assinaturaId)}/payments`)
  const lista = Array.isArray(data?.data) ? data.data : []
  const aberta = lista.find((item) => ['PENDING', 'OVERDUE'].includes(String(item.status || '').toUpperCase()))
  return aberta ? { id: aberta.id, url: aberta.invoiceUrl, vencimento: aberta.dueDate } : null
}

export async function removerAssinaturaAsaas(assinaturaId) {
  await chamar('DELETE', `/subscriptions/${encodeURIComponent(assinaturaId)}`)
}

// Evento do webhook do Asaas -> evento do WebCond (src/lib/assinatura.js, EVENTOS_ASSINATURA).
// O que nao muda o plano fica gravado com o nome original, so para auditoria.
const EVENTOS = {
  PAYMENT_CONFIRMED: 'pagamento.aprovado',
  PAYMENT_RECEIVED: 'pagamento.aprovado',
  PAYMENT_REFUNDED: 'pagamento.estornado',
  PAYMENT_CHARGEBACK_REQUESTED: 'pagamento.estornado',
  PAYMENT_REPROVED_BY_RISK_ANALYSIS: 'pagamento.recusado',
  PAYMENT_CREDIT_CARD_CAPTURE_REFUSED: 'pagamento.recusado',
  SUBSCRIPTION_DELETED: 'assinatura.cancelada',
  SUBSCRIPTION_INACTIVATED: 'assinatura.cancelada',
}

export function traduzirEventoAsaas(evento) {
  const nome = String(evento || '').trim().toUpperCase()
  return EVENTOS[nome] || `asaas.${nome.toLowerCase()}`.slice(0, 80)
}

// O que vai para assinatura_eventos.payload: so o necessario para conferir depois.
// Nada de dados de cartao (o Asaas manda token e final do cartao no pagamento por cartao).
export function resumoSeguroDoEvento(body) {
  const pagamento = body?.payment || {}
  const assinatura = body?.subscription || {}
  return {
    id: String(body?.id || ''),
    event: String(body?.event || ''),
    dateCreated: String(body?.dateCreated || ''),
    payment: pagamento.id ? {
      id: String(pagamento.id),
      subscription: String(pagamento.subscription || ''),
      status: String(pagamento.status || ''),
      value: Number(pagamento.value || 0),
      billingType: String(pagamento.billingType || ''),
      dueDate: String(pagamento.dueDate || ''),
      paymentDate: String(pagamento.paymentDate || pagamento.clientPaymentDate || ''),
      externalReference: String(pagamento.externalReference || ''),
    } : undefined,
    subscription: assinatura.id ? {
      id: String(assinatura.id),
      status: String(assinatura.status || ''),
      externalReference: String(assinatura.externalReference || ''),
    } : undefined,
  }
}
