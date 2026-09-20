export const UNIT_STATUSES = [
  { value: 'ocupada', label: 'Ocupada', badge: 'badge-green' },
  { value: 'alugada', label: 'Alugada', badge: 'badge-blue' },
  { value: 'desocupada', label: 'Desocupada', badge: 'badge-yellow' },
  { value: 'interditada', label: 'Interditada', badge: 'badge-red' },
]

export const UNIT_STATUS_VALUES = UNIT_STATUSES.map((item) => item.value)

// "Unidades ativas" no painel: unidades com gente morando (dono ou inquilino).
export const ACTIVE_UNIT_STATUSES = ['ocupada', 'alugada']

export function getUnitStatusMeta(value) {
  return UNIT_STATUSES.find((item) => item.value === value) || UNIT_STATUSES[2]
}

// Numero livre (001, 101, 01B, A...): apenas remove espacos extras e padroniza maiusculas.
export function normalizeUnitNumber(value = '') {
  return String(value || '').trim().replace(/\s+/g, ' ').toUpperCase().slice(0, 20)
}

// Ordena 001, 002, 101, 01B, A de forma natural.
export function compareUnitNumbers(first = '', second = '') {
  return String(first).localeCompare(String(second), 'pt-BR', { numeric: true, sensitivity: 'base' })
}

// Aviso direcionado a uma das unidades da pessoa (proprietario pode ter varias).
export function isNoticeForProfile(aviso, profile) {
  if (aviso?.destinatario === 'todos') return true
  if (aviso?.destinatario !== 'apartamento') return false
  const units = profile?.unit_numbers?.length ? profile.unit_numbers : [profile?.apartamento]
  return units.map(normalizeUnitNumber).includes(normalizeUnitNumber(aviso.apartamento_destino))
}

// Tipo de acesso do morador: proprietario em alguma unidade prevalece; senao, inquilino.
export function describeResidentAccess(profile) {
  const links = profile?.unit_links || []
  const isOwner = profile?.is_owner !== false
  const numbers = (links.length ? links.map((link) => link.numero) : [profile?.apartamento])
    .filter(Boolean)
    .sort(compareUnitNumbers)
  return {
    isOwner,
    label: isOwner ? 'Proprietario' : 'Inquilino',
    units: numbers.join(', '),
    unitsLabel: numbers.length > 1 ? `Unidades ${numbers.join(', ')}` : `Unidade ${numbers[0] || '-'}`,
  }
}
