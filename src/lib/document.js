import { formatCnpj } from './cnpj'
import { formatCpf } from './cpf'

export function normalizeCpfCnpj(value = '') {
  return String(value || '').replace(/\D/g, '').slice(0, 14)
}

export function getCpfCnpjType(value = '') {
  const digits = normalizeCpfCnpj(value)
  if (digits.length === 11) return 'cpf'
  if (digits.length === 14) return 'cnpj'
  return ''
}

export function formatCpfCnpj(value = '') {
  const digits = normalizeCpfCnpj(value)
  if (digits.length <= 11) return formatCpf(digits)
  return formatCnpj(digits)
}

export function getCpfCnpjLabel(value = '') {
  const type = getCpfCnpjType(value)
  if (type === 'cpf') return 'CPF'
  if (type === 'cnpj') return 'CNPJ'
  return 'CPF ou CNPJ'
}
