// Checkout da InfinitePay (https://www.infinitepay.io/checkout-documentacao), v1.09A5.
// Nao usa chave de API: a conta e identificada pela InfiniteTag (handle) do condominio.
// Justamente por isso NADA que chega de fora e aceito como prova de pagamento: o webhook e o
// retorno do navegador so dizem "confira o pedido X"; quem confirma e a consulta payment_check,
// feita daqui direto na InfinitePay.
const API = 'https://api.checkout.infinitepay.io'
const TIMEOUT_MS = 10000

async function post(path, body) {
  const response = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    const error = new Error(`InfinitePay respondeu ${response.status}.`)
    error.status = response.status
    throw error
  }
  return data
}

// Telefone no formato que a InfinitePay pede (+55DDDNUMERO). Invalido = nao envia.
function telefoneInfinitePay(valor) {
  const digitos = String(valor || '').replace(/\D/g, '')
  if (digitos.length === 10 || digitos.length === 11) return `+55${digitos}`
  if ((digitos.length === 12 || digitos.length === 13) && digitos.startsWith('55')) return `+${digitos}`
  return ''
}

// Cria o link "Pagar agora". orderNsu = id da cobranca no WebCond (volta no webhook e no retorno).
export async function criarLinkInfinitePay({ tag, orderNsu, valorCentavos, descricao, cliente = {}, redirectUrl, webhookUrl }) {
  const customer = {}
  if (cliente.nome) customer.name = String(cliente.nome).slice(0, 120)
  if (cliente.email && !String(cliente.email).endsWith('@login.webcond.local')) customer.email = String(cliente.email)
  const phone = telefoneInfinitePay(cliente.telefone)
  if (phone) customer.phone_number = phone

  const data = await post('/links', {
    handle: tag,
    order_nsu: orderNsu,
    redirect_url: redirectUrl,
    webhook_url: webhookUrl,
    items: [{ quantity: 1, price: valorCentavos, description: String(descricao || 'Cobranca do condominio').slice(0, 120) }],
    ...(Object.keys(customer).length ? { customer } : {}),
  })

  // A documentacao nao fixa o nome do campo; aceitamos os nomes usados pela API e por integracoes.
  const url = data?.url || data?.link || data?.checkout_url || data?.payment_url || ''
  if (!/^https:\/\//.test(String(url))) throw new Error('A InfinitePay nao devolveu o link de pagamento.')
  return { url }
}

// Consulta oficial: e a unica fonte que o WebCond aceita para dar baixa.
export async function consultarPagamentoInfinitePay({ tag, orderNsu, transactionNsu, slug }) {
  const data = await post('/payment_check', {
    handle: tag,
    order_nsu: orderNsu,
    ...(transactionNsu ? { transaction_nsu: transactionNsu } : {}),
    ...(slug ? { slug } : {}),
  })
  return {
    sucesso: data?.success !== false,
    pago: data?.paid === true,
    valorCentavos: Number(data?.amount || 0),
    valorPagoCentavos: Number(data?.paid_amount || 0),
    metodo: String(data?.capture_method || ''),
  }
}
