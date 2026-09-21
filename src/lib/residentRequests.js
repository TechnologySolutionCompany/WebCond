const PAYMENT_REQUEST_PREFIX = 'PAGAMENTO_CONFIRMADO|'
const PROFILE_REQUEST_PREFIX = 'ALTERACAO_CADASTRAL|'

export function buildPaymentConfirmationTitle(chargeId) {
  return `${PAYMENT_REQUEST_PREFIX}${chargeId}`
}

export function buildProfileUpdateTitle(profileId) {
  return `${PROFILE_REQUEST_PREFIX}${profileId}`
}

export function parseResidentRequest(item = {}) {
  const title = String(item.titulo || '').trim()

  if (title.startsWith(PAYMENT_REQUEST_PREFIX)) {
    return {
      kind: 'payment_confirmation',
      chargeId: title.slice(PAYMENT_REQUEST_PREFIX.length),
      residentId: item.created_by || '',
      status: item.status || 'aberto',
    }
  }

  if (title.startsWith(PROFILE_REQUEST_PREFIX)) {
    return {
      kind: 'profile_change',
      profileId: title.slice(PROFILE_REQUEST_PREFIX.length),
      residentId: item.created_by || '',
      status: item.status || 'aberto',
    }
  }

  return {
    kind: 'incident',
    residentId: item.created_by || '',
    status: item.status || 'aberto',
  }
}

export function isResidentPaymentConfirmation(item) {
  return parseResidentRequest(item).kind === 'payment_confirmation'
}

export function isResidentRequestPending(item) {
  return String(item?.status || '').toLowerCase() !== 'resolvido'
}

/**
 * O que o sindico ve na caixa de notificacoes. Tira tres coisas:
 *  - o que ele mesmo criou: aviso enviado e para quem recebe, nao volta para quem mandou;
 *  - confirmacao de pagamento de cobranca que nao existe mais (cobranca excluida);
 *  - o que ja foi resolvido.
 * `chargeIds` e o conjunto de cobrancas vivas; sem ele, nada e descartado por esse motivo.
 */
export function filterSyndicNotifications(items = [], { chargeIds = null, viewerId = '' } = {}) {
  return items.filter((item) => {
    if (!isResidentRequestPending(item)) return false
    if (viewerId && item.created_by === viewerId) return false

    const parsed = parseResidentRequest(item)
    if (parsed.kind === 'payment_confirmation' && chargeIds && !chargeIds.has(parsed.chargeId)) return false

    return true
  })
}

export function buildResidentRequestSummary(item = {}) {
  const parsed = parseResidentRequest(item)

  if (parsed.kind === 'payment_confirmation') {
    return {
      title: 'Pagamento confirmado pelo morador',
      detail: item.descricao || 'O morador informou que realizou o pagamento e aguarda validacao do sindico.',
    }
  }

  if (parsed.kind === 'profile_change') {
    return {
      title: 'Solicitacao de alteracao cadastral',
      detail: item.descricao || 'O morador pediu revisao dos dados cadastrais.',
    }
  }

  return {
    title: item.titulo || 'Ocorrencia',
    detail: item.descricao || '',
  }
}
