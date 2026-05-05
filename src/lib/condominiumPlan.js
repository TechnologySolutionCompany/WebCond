export const STANDARD_PLAN_NAME = 'Plano Padrao'
export const STANDARD_PLAN_PRICE_CENTS = 7990
export const STANDARD_PLAN_PRICE_LABEL = 'R$ 79,90'
export const TRIAL_PERIOD_DAYS = 30

function parseDate(value) {
  if (!value) return null

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return date
}

function addDays(date, days) {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

function startOfDay(date) {
  const next = new Date(date)
  next.setHours(0, 0, 0, 0)
  return next
}

function normalizeMetadata(metadata = {}) {
  const safeMetadata = metadata && typeof metadata === 'object' ? metadata : {}

  return {
    raw: safeMetadata,
    planName: String(safeMetadata.plan_name || safeMetadata.planName || STANDARD_PLAN_NAME).trim() || STANDARD_PLAN_NAME,
    planPriceCents: Number(safeMetadata.plan_price_cents || safeMetadata.planPriceCents || STANDARD_PLAN_PRICE_CENTS) || STANDARD_PLAN_PRICE_CENTS,
    subscriptionStatus: String(safeMetadata.subscription_status || safeMetadata.subscriptionStatus || 'trial').trim().toLowerCase() || 'trial',
    approvedAt: parseDate(safeMetadata.approved_at || safeMetadata.approvedAt),
    trialStartedAt: parseDate(safeMetadata.trial_started_at || safeMetadata.trialStartedAt),
    trialEndsAt: parseDate(safeMetadata.trial_ends_at || safeMetadata.trialEndsAt),
    subscriptionActivatedAt: parseDate(safeMetadata.subscription_activated_at || safeMetadata.subscriptionActivatedAt),
  }
}

export function buildTrialMetadata(metadata = {}, baseDate = new Date()) {
  const current = normalizeMetadata(metadata)
  const trialBaseDate = current.trialStartedAt || current.approvedAt || parseDate(baseDate) || new Date()
  const trialEndDate = current.trialEndsAt || addDays(trialBaseDate, TRIAL_PERIOD_DAYS)

  return {
    ...current.raw,
    plan_name: current.planName || STANDARD_PLAN_NAME,
    plan_price_cents: current.planPriceCents || STANDARD_PLAN_PRICE_CENTS,
    subscription_status: current.subscriptionStatus === 'active' ? 'active' : 'trial',
    approved_at: (current.approvedAt || parseDate(baseDate) || new Date()).toISOString(),
    trial_started_at: trialBaseDate.toISOString(),
    trial_ends_at: trialEndDate.toISOString(),
  }
}

export function activatePlanMetadata(metadata = {}, activatedAt = new Date()) {
  const current = normalizeMetadata(metadata)
  const normalizedActivatedAt = parseDate(activatedAt) || new Date()

  return {
    ...buildTrialMetadata(current.raw, current.approvedAt || normalizedActivatedAt),
    subscription_status: 'active',
    subscription_activated_at: normalizedActivatedAt.toISOString(),
  }
}

export function getCondominiumAccessState(condominium = {}, now = new Date()) {
  const metadata = normalizeMetadata(condominium?.metadata)
  const rawStatus = String(condominium?.status || 'pending').trim().toLowerCase() || 'pending'
  const currentDate = startOfDay(now)
  const trialBaseDate = metadata.trialStartedAt || metadata.approvedAt || parseDate(condominium?.updated_at) || parseDate(condominium?.created_at)
  const trialEndDate = metadata.trialEndsAt || (trialBaseDate ? addDays(trialBaseDate, TRIAL_PERIOD_DAYS) : null)
  const subscriptionActive = metadata.subscriptionStatus === 'active'
  const isTrialExpired = rawStatus === 'active' && !subscriptionActive && trialEndDate && currentDate >= startOfDay(trialEndDate)
  const effectiveStatus = isTrialExpired ? 'blocked' : rawStatus
  const blockReason = rawStatus === 'blocked'
    ? 'manual_block'
    : isTrialExpired
      ? 'trial_expired'
      : null

  return {
    rawStatus,
    effectiveStatus,
    blockReason,
    shouldBlockAccess: effectiveStatus === 'blocked' || effectiveStatus === 'rejected' || effectiveStatus === 'pending',
    isTrialExpired: Boolean(isTrialExpired),
    planName: metadata.planName || STANDARD_PLAN_NAME,
    planPriceCents: metadata.planPriceCents || STANDARD_PLAN_PRICE_CENTS,
    planPriceLabel: STANDARD_PLAN_PRICE_LABEL,
    subscriptionStatus: subscriptionActive ? 'active' : 'trial',
    approvedAt: metadata.approvedAt ? metadata.approvedAt.toISOString() : null,
    trialStartedAt: trialBaseDate ? trialBaseDate.toISOString() : null,
    trialEndsAt: trialEndDate ? trialEndDate.toISOString() : null,
    subscriptionActivatedAt: metadata.subscriptionActivatedAt ? metadata.subscriptionActivatedAt.toISOString() : null,
  }
}
