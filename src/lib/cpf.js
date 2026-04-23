export function normalizeCpf(value = '') {
  return String(value).replace(/\D/g, '')
}

export function formatCpf(value = '') {
  const digits = normalizeCpf(value)
  if (digits.length !== 11) return value
  return digits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')
}
