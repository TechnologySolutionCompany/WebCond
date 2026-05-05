import { formatReferenceLabel } from './billingShared'

function safeDate(value) {
  if (!value) return null
  const date = new Date(`${value}T12:00:00`)
  return Number.isNaN(date.getTime()) ? null : date
}

function todayStart() {
  const date = new Date()
  date.setHours(0, 0, 0, 0)
  return date
}

function normalizeReference(reference = '') {
  const match = String(reference || '').trim().match(/^(\d{4})-(\d{1,2})$/)
  if (!match) return ''

  const year = Number(match[1])
  const month = Number(match[2])
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    return ''
  }

  return `${year}-${String(month).padStart(2, '0')}`
}

function referenceFromDates(charge) {
  const dueDate = safeDate(charge?.vencimento)
  if (dueDate) return `${dueDate.getFullYear()}-${String(dueDate.getMonth() + 1).padStart(2, '0')}`

  const createdAt = charge?.created_at ? new Date(charge.created_at) : null
  if (createdAt && !Number.isNaN(createdAt.getTime())) {
    return `${createdAt.getFullYear()}-${String(createdAt.getMonth() + 1).padStart(2, '0')}`
  }

  return ''
}

function referenceSortKey(reference = '') {
  const normalized = normalizeReference(reference)
  if (!normalized) return Number.MAX_SAFE_INTEGER

  const [year, month] = normalized.split('-').map(Number)
  return (year * 100) + month
}

export function normalizeChargePaymentStatus(status) {
  const normalized = String(status || '').trim().toUpperCase()
  const allowed = new Set(['PENDING', 'PAID', 'OVERDUE', 'UNDER_REVIEW', 'CANCELLED'])
  return allowed.has(normalized) ? normalized : ''
}

function resolveLegacyPaymentStatus(charge, baseDate = new Date()) {
  if (charge?.pago) return 'PAID'

  const dueDate = safeDate(charge?.vencimento)
  if (!dueDate) return 'PENDING'

  const compareDate = new Date(baseDate)
  compareDate.setHours(0, 0, 0, 0)
  return dueDate < compareDate ? 'OVERDUE' : 'PENDING'
}

export function getChargePaymentStatus(charge, baseDate = new Date()) {
  const normalized = normalizeChargePaymentStatus(charge?.payment_status)
  if (normalized === 'PAID') return 'PAID'
  if (normalized === 'UNDER_REVIEW') return 'UNDER_REVIEW'
  if (normalized === 'CANCELLED') return 'CANCELLED'
  if (normalized === 'OVERDUE') return 'OVERDUE'
  if (normalized === 'PENDING') {
    return resolveLegacyPaymentStatus({ ...charge, pago: false }, baseDate)
  }

  return resolveLegacyPaymentStatus(charge, baseDate)
}

export function isChargePaid(charge) {
  return getChargePaymentStatus(charge) === 'PAID'
}

export function getChargePaymentStatusMeta(charge, baseDate = new Date()) {
  const status = getChargePaymentStatus(charge, baseDate)

  if (status === 'PAID') {
    return { key: 'paid', label: 'Pago', badgeClass: 'badge-green' }
  }

  if (status === 'UNDER_REVIEW') {
    return { key: 'under_review', label: 'Em analise', badgeClass: 'badge-blue' }
  }

  if (status === 'CANCELLED') {
    return { key: 'cancelled', label: 'Cancelada', badgeClass: 'badge-purple' }
  }

  if (status === 'OVERDUE') {
    return { key: 'overdue', label: 'Atrasado', badgeClass: 'badge-red' }
  }

  return { key: 'pending', label: 'Pendente', badgeClass: 'badge-orange' }
}

export function getChargeStatus(charge, baseDate = new Date()) {
  const paymentStatus = getChargePaymentStatus(charge, baseDate)
  if (paymentStatus === 'PAID') return 'pago'
  if (paymentStatus === 'OVERDUE') return 'inadimplente'
  return 'em_aberto'
}

export function countChargeStatuses(charges = [], baseDate = new Date()) {
  return (charges || []).reduce((acc, charge) => {
    const status = getChargeStatus(charge, baseDate)
    acc[status] += 1
    return acc
  }, { em_aberto: 0, pago: 0, inadimplente: 0 })
}

export function buildChargeStatusChartData(charges = [], maxPoints = 6, baseDate = new Date()) {
  const groups = new Map()
  const fallbackTodayRef = referenceFromDates({ vencimento: todayStart().toISOString().slice(0, 10) }) || 'Atual'

  for (const charge of charges || []) {
    const normalizedRef = normalizeReference(charge?.mes_referencia) || referenceFromDates(charge) || fallbackTodayRef
    const key = normalizedRef
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        competencia: normalizeReference(normalizedRef) ? formatReferenceLabel(normalizedRef) : 'Atual',
        sortKey: referenceSortKey(normalizedRef),
        em_aberto: 0,
        pago: 0,
        inadimplente: 0,
      })
    }

    const current = groups.get(key)
    const status = getChargeStatus(charge, baseDate)
    current[status] += 1
  }

  const result = Array.from(groups.values())
    .sort((a, b) => a.sortKey - b.sortKey)
    .slice(-maxPoints)
    .map(({ key, sortKey, ...data }) => data)

  return result.length > 0
    ? result
    : [{ competencia: 'Atual', em_aberto: 0, pago: 0, inadimplente: 0 }]
}
