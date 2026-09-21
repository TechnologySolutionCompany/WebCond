// Validacao de dados pessoais compartilhada pelo servidor: importacao por planilha
// e auto-cadastro por link usam exatamente as mesmas regras.

export const BRAZIL_DDDS = new Set([
  '11', '12', '13', '14', '15', '16', '17', '18', '19',
  '21', '22', '24', '27', '28', '31', '32', '33', '34', '35', '37', '38',
  '41', '42', '43', '44', '45', '46', '47', '48', '49', '51', '53', '54', '55',
  '61', '62', '63', '64', '65', '66', '67', '68', '69',
  '71', '73', '74', '75', '77', '79', '81', '82', '83', '84', '85', '86', '87', '88', '89',
  '91', '92', '93', '94', '95', '96', '97', '98', '99',
])

export function normalizeCpfDigits(value) {
  return String(value ?? '').trim().replace(/\D/g, '')
}

export function isCpfValid(original) {
  if (!/^[\d.\-\s]+$/.test(String(original ?? ''))) return false
  const cpf = normalizeCpfDigits(original)
  if (!/^\d{11}$/.test(cpf) || /^(\d)\1{10}$/.test(cpf)) return false
  for (const length of [9, 10]) {
    let sum = 0
    for (let index = 0; index < length; index += 1) sum += Number(cpf[index]) * (length + 1 - index)
    const remainder = sum % 11
    if (Number(cpf[length]) !== (remainder < 2 ? 0 : 11 - remainder)) return false
  }
  return true
}

export function normalizeWhatsapp(value) {
  let digits = String(value ?? '').trim().replace(/\D/g, '')
  if (digits.length === 13 && digits.startsWith('55')) digits = digits.slice(2)
  return digits
}

export function isWhatsappValid(original, normalized) {
  // O sistema tem um contato por pessoa. Nao junta silenciosamente contatos separados.
  const raw = String(original ?? '')
  if (!/^\+?[\d\s().-]+$/.test(raw)) return false
  if (raw.startsWith('+') && !/^\+55(?:\D|\d)/.test(raw)) return false
  return /^\d{2}9\d{8}$/.test(normalized) && BRAZIL_DDDS.has(normalized.slice(0, 2))
}

export function isEmailValid(email) {
  const value = String(email ?? '')
  return value.length <= 254 && /^[^\s@;]+@[^\s@;]+\.[^\s@;.]+$/.test(value)
}
