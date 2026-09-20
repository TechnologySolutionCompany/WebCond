// Dados sensiveis ficam mascarados na tela. O valor completo so aparece quando a pessoa
// clica em "mostrar" (ou nas exportacoes, que sao arquivos controlados pelo sindico).
import { formatCpf } from './cpf.js'

// Padrao da Receita Federal: ***.456.789-**
export function maskCpf(value = '') {
  const digits = String(value || '').replace(/\D/g, '')
  if (digits.length !== 11) return digits ? '***' : '-'
  return `***.${digits.slice(3, 6)}.${digits.slice(6, 9)}-**`
}

// (81) 9****-3724
export function maskPhone(value = '') {
  const digits = String(value || '').replace(/\D/g, '')
  if (digits.length < 10) return digits ? '***' : '-'
  const local = digits.length > 11 ? digits.slice(-11) : digits
  const ddd = local.slice(0, 2)
  const last = local.slice(-4)
  const first = local.length === 11 ? local[2] : ''
  return `(${ddd}) ${first}****-${last}`
}

// jo***@gmail.com
export function maskEmail(value = '') {
  const email = String(value || '').trim()
  const at = email.indexOf('@')
  if (at < 1) return email ? '***' : '-'
  const name = email.slice(0, at)
  return `${name.slice(0, 2)}***${email.slice(at)}`
}

export function formatCpfValue(value = '') {
  const digits = String(value || '').replace(/\D/g, '')
  return digits ? formatCpf(digits) : '-'
}
