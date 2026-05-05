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

export function isResidentProfileChangeRequest(item) {
  return parseResidentRequest(item).kind === 'profile_change'
}

export function isResidentRequestPending(item) {
  return String(item?.status || '').toLowerCase() !== 'resolvido'
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
