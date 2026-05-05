import { json, parseJsonBody, requirePlatformAdmin, supabaseAdmin } from '../../_lib/supabaseAdmin.js'
import {
  activatePlanMetadata,
  buildTrialMetadata,
  STANDARD_PLAN_NAME,
  STANDARD_PLAN_PRICE_CENTS,
  TRIAL_PERIOD_DAYS,
} from '../../../src/lib/condominiumPlan.js'

const ALLOWED_STATUSES = new Set(['pending', 'active', 'rejected', 'blocked'])

function getCpfCnpjType(value = '') {
  const digits = String(value || '').replace(/\D/g, '')
  if (digits.length === 11) return 'cpf'
  if (digits.length === 14) return 'cnpj'
  return ''
}

function parseDate(value = '') {
  if (!value) return null

  const normalized = String(value)
  const dateOnlyMatch = normalized.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  const date = dateOnlyMatch
    ? new Date(Number(dateOnlyMatch[1]), Number(dateOnlyMatch[2]) - 1, Number(dateOnlyMatch[3]))
    : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function addDays(date, days) {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

function sanitizePayload(body = {}) {
  const metadata = body.metadata && typeof body.metadata === 'object' ? body.metadata : {}

  return {
    name: String(body.name || '').trim(),
    cnpj: String(body.cnpj || '').replace(/\D/g, ''),
    address: String(body.address || '').trim(),
    zip_code: String(body.zip_code || '').trim(),
    whatsapp: String(body.whatsapp || '').replace(/\D/g, ''),
    unit_count: Number(body.unit_count || 0),
    status: String(body.status || '').trim().toLowerCase(),
    metadata: {
      ...metadata,
      subscription_status: String(metadata.subscription_status || metadata.subscriptionStatus || '').trim().toLowerCase(),
    },
  }
}

function resolveNextStatus(action, currentStatus, payloadStatus) {
  if (action === 'approve') return 'active'
  if (action === 'reject') return 'rejected'
  if (action === 'block') return 'blocked'
  if (action === 'unblock') return 'active'
  if (payloadStatus && ALLOWED_STATUSES.has(payloadStatus)) return payloadStatus
  return currentStatus
}

export async function POST(req) {
  const auth = await requirePlatformAdmin(req)
  if (auth.error) return auth.error

  const body = await parseJsonBody(req)
  if (!body) {
    return json({ error: 'Corpo da requisicao invalido.' }, 400)
  }

  const condominiumId = String(body.condominiumId || body.id || '').trim()
  const action = String(body.action || 'save').trim().toLowerCase()

  if (!condominiumId) {
    return json({ error: 'Condominio invalido.' }, 400)
  }

  const { data: current, error: currentError } = await supabaseAdmin
    .from('condominiums')
    .select('id, status, metadata, created_at')
    .eq('id', condominiumId)
    .maybeSingle()

  if (currentError) {
    return json({ error: currentError.message || 'Nao foi possivel carregar o condominio.' }, 500)
  }

  if (!current) {
    return json({ error: 'Condominio nao encontrado.' }, 404)
  }

  const payload = sanitizePayload(body)
  const documentType = getCpfCnpjType(payload.cnpj)

  if (action === 'save' && payload.cnpj && !documentType) {
    return json({ error: 'Informe um CPF ou CNPJ valido para o condominio.' }, 400)
  }

  const nextStatus = resolveNextStatus(action, current.status, payload.status)
  if (!ALLOWED_STATUSES.has(nextStatus)) {
    return json({ error: 'Status invalido para o condominio.' }, 400)
  }

  const currentMetadata = current.metadata && typeof current.metadata === 'object' ? current.metadata : {}
  const requestedTrialStart = parseDate(payload.metadata.trial_started_at || payload.metadata.trialStartedAt)
  let nextMetadata = {
    ...currentMetadata,
    ...payload.metadata,
    plan_name: payload.metadata.plan_name || currentMetadata.plan_name || STANDARD_PLAN_NAME,
    plan_price_cents: Number(payload.metadata.plan_price_cents || currentMetadata.plan_price_cents || STANDARD_PLAN_PRICE_CENTS) || STANDARD_PLAN_PRICE_CENTS,
    condominium_document_type: documentType || currentMetadata.condominium_document_type || '',
    reviewed_by_platform_admin: auth.user?.id || null,
    reviewed_at: new Date().toISOString(),
  }

  if (requestedTrialStart) {
    nextMetadata.trial_started_at = requestedTrialStart.toISOString()
    nextMetadata.trial_ends_at = addDays(requestedTrialStart, TRIAL_PERIOD_DAYS).toISOString()
  }

  if (action === 'approve' && nextStatus === 'active') {
    nextMetadata = buildTrialMetadata(nextMetadata, requestedTrialStart || new Date())
  }

  if (action === 'save' && nextStatus === 'active') {
    if (nextMetadata.subscription_status === 'active') {
      nextMetadata = activatePlanMetadata(nextMetadata, new Date())
    } else {
      if (requestedTrialStart) {
        delete nextMetadata.trial_ends_at
      }

      nextMetadata = buildTrialMetadata(nextMetadata, requestedTrialStart || currentMetadata.approved_at || current.created_at || new Date())
    }
  }

  const updatePayload = {
    status: nextStatus,
    metadata: nextMetadata,
    updated_at: new Date().toISOString(),
  }

  if (action === 'save') {
    updatePayload.name = payload.name
    updatePayload.nome = payload.name
    updatePayload.cnpj = payload.cnpj
    updatePayload.address = payload.address
    updatePayload.endereco = payload.address
    updatePayload.zip_code = payload.zip_code
    updatePayload.whatsapp = payload.whatsapp
    updatePayload.unit_count = Number.isFinite(payload.unit_count) ? Math.max(payload.unit_count, 0) : 0
  }

  const { data, error } = await supabaseAdmin
    .from('condominiums')
    .update(updatePayload)
    .eq('id', condominiumId)
    .select('id, status, updated_at')
    .maybeSingle()

  if (error) {
    return json({ error: error.message || 'Nao foi possivel atualizar o condominio.' }, 500)
  }

  return json({
    success: true,
    condominium: data,
  })
}
