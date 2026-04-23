import { DEFAULT_CONDOMINIUM_SETTINGS } from './condoConfig'

function normalizeDigits(value = '') {
  return String(value || '').replace(/\D/g, '')
}

function formatWhatsappLabel(value = '') {
  const digits = normalizeDigits(value)

  if (!digits) return DEFAULT_CONDOMINIUM_SETTINGS.whatsappLabel

  if (digits.length === 13 && digits.startsWith('55')) {
    return `+55 ${digits.slice(2, 4)} ${digits.slice(4, 9)}-${digits.slice(9)}`
  }

  if (digits.length === 11) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`
  }

  return value
}

export function resolveCondominiumSettings(condominium = null) {
  const metadata = condominium?.metadata && typeof condominium.metadata === 'object'
    ? condominium.metadata
    : {}

  const whatsapp = normalizeDigits(
    condominium?.whatsapp
    || metadata.whatsapp
    || DEFAULT_CONDOMINIUM_SETTINGS.whatsapp,
  )

  const pixProvider = String(
    metadata.pix_provider
    || metadata.pixProvider
    || DEFAULT_CONDOMINIUM_SETTINGS.pixProvider,
  ).trim()

  const unitCountValue = Number(condominium?.unit_count)
  const unitCount = Number.isFinite(unitCountValue) && unitCountValue > 0
    ? unitCountValue
    : DEFAULT_CONDOMINIUM_SETTINGS.unitCount

  return {
    id: condominium?.id || null,
    name: String(condominium?.name || condominium?.nome || DEFAULT_CONDOMINIUM_SETTINGS.name).trim(),
    address: String(condominium?.address || condominium?.endereco || DEFAULT_CONDOMINIUM_SETTINGS.address).trim(),
    pixKey: String(condominium?.pix_key || condominium?.chave_pix || DEFAULT_CONDOMINIUM_SETTINGS.pixKey).trim(),
    pixProvider,
    whatsapp,
    whatsappLabel: formatWhatsappLabel(whatsapp),
    unitCount,
  }
}
