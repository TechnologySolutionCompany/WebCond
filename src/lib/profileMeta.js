const DEFAULT_STATUS = 'morando'

function safeParse(value) {
  if (!value) return {}

  try {
    return JSON.parse(value)
  } catch {
    return {}
  }
}

export function getMoradiaMeta(profile) {
  const meta = safeParse(profile?.observacao)

  return {
    status_moradia: profile?.status_moradia || meta.status_moradia || DEFAULT_STATUS,
    inquilino_nome: meta.inquilino_nome || '',
    inquilino_telefone: meta.inquilino_telefone || '',
  }
}

export function getMoradiaStatus(profile) {
  return getMoradiaMeta(profile).status_moradia
}

export function buildProfileObservation(profile = {}, nextStatus = DEFAULT_STATUS, extra = {}) {
  const meta = safeParse(profile.observacao)
  const status = String(nextStatus || DEFAULT_STATUS).trim() || DEFAULT_STATUS
  const inquilinoNome = status === 'alugado'
    ? String(extra.inquilino_nome || '').trim()
    : ''
  const inquilinoTelefone = status === 'alugado'
    ? String(extra.inquilino_telefone || '').replace(/\D/g, '')
    : ''

  return JSON.stringify({
    ...meta,
    status_moradia: status,
    inquilino_nome: inquilinoNome,
    inquilino_telefone: inquilinoTelefone,
  })
}
