export const emptyAddress = {
  zip_code: '',
  street: '',
  number: '',
  complement: '',
  district: '',
  city: '',
  state: '',
}

export function normalizeZipCode(value = '') {
  return String(value || '').replace(/\D/g, '').slice(0, 8)
}

export function formatZipCode(value = '') {
  const digits = normalizeZipCode(value)
  return digits.length > 5 ? `${digits.slice(0, 5)}-${digits.slice(5)}` : digits
}

export function sanitizeAddress(details = {}) {
  const source = details && typeof details === 'object' ? details : {}
  return {
    zip_code: normalizeZipCode(source.zip_code),
    street: String(source.street || '').trim(),
    number: String(source.number || '').trim(),
    complement: String(source.complement || '').trim(),
    district: String(source.district || '').trim(),
    city: String(source.city || '').trim(),
    state: String(source.state || '').trim().toUpperCase().slice(0, 2),
  }
}

// Texto unico usado nas listagens: "Rua X, 100 - Apto 2 - Bairro - Cidade/UF"
export function composeAddress(details = {}) {
  const address = sanitizeAddress(details)
  const streetLine = [address.street, address.number].filter(Boolean).join(', ')
  const cityLine = [address.city, address.state].filter(Boolean).join('/')
  return [streetLine, address.complement, address.district, cityLine].filter(Boolean).join(' - ')
}

// Enderecos antigos so tinham o texto livre: ele vira o logradouro para nao perder a informacao.
export function resolveAddressDetails(condominium = {}) {
  const stored = condominium?.metadata?.address_details
  if (stored && typeof stored === 'object') {
    return { ...emptyAddress, ...sanitizeAddress(stored) }
  }

  return {
    ...emptyAddress,
    zip_code: normalizeZipCode(condominium?.zip_code),
    street: String(condominium?.address || condominium?.endereco || '').trim(),
  }
}

export async function lookupZipCode(zipCode) {
  const digits = normalizeZipCode(zipCode)
  if (digits.length !== 8) return null

  const response = await fetch(`https://viacep.com.br/ws/${digits}/json/`)
  if (!response.ok) throw new Error('Nao foi possivel consultar o CEP agora.')

  const data = await response.json()
  if (data.erro) return null

  return {
    street: data.logradouro || '',
    district: data.bairro || '',
    city: data.localidade || '',
    state: data.uf || '',
  }
}
