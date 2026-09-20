import { json, parseJsonBody, rejectForeignOrigin, requirePlatformAdmin, supabaseAdmin } from '../../_lib/supabaseAdmin.js'
import { activatePlanMetadata, buildTrialMetadata, PLANS, TRIAL_PERIOD_DAYS } from '../../../src/lib/condominiumPlan.js'
import { composeAddress, sanitizeAddress } from '../../../src/lib/address.js'
import { loadUnitUsage } from '../../_lib/unitLimit.js'

const ALLOWED_STATUSES = new Set(['pending', 'active', 'rejected', 'blocked'])
const ACTION_STATUS = { approve: 'active', reject: 'rejected', block: 'blocked', unblock: 'active' }

function getCpfCnpjType(value = '') {
  const digits = String(value || '').replace(/\D/g, '')
  if (digits.length === 11) return 'cpf'
  if (digits.length === 14) return 'cnpj'
  return ''
}

function addDays(date, days) {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

function isCondominiumAdminRole(role = '') {
  const normalized = String(role || '').trim().toLowerCase()
  return normalized === 'admin' || normalized === 'admin_condominium'
}

// Aprovacao (primeira vez que fica ativo): o teste de 30 dias comeca agora.
function applyApproval(metadata, now) {
  if (metadata.approved_at) return metadata
  return {
    ...metadata,
    approved_at: now.toISOString(),
    trial_started_at: now.toISOString(),
    trial_ends_at: addDays(now, TRIAL_PERIOD_DAYS).toISOString(),
  }
}

// plan: 'trial' = Teste de 30 dias no plano ONE; 'ONE' = plano contratado, valido ate expiresAt.
function applyPlan(metadata, plan, now, expiresAt) {
  if (plan === 'trial') {
    return buildTrialMetadata({ ...metadata, plan_name: 'ONE', subscription_status: 'trial' }, now)
  }

  return activatePlanMetadata({ ...metadata, plan_name: plan, plan_price_cents: PLANS[plan].priceCents }, now, expiresAt)
}

// "AAAA-MM-DD" do formulario -> fim do dia no horario de Brasilia.
function parseExpiryDate(value) {
  const text = String(value || '').trim()
  if (!text) return { date: null }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return { error: 'Data de validade do plano invalida.' }
  const date = new Date(`${text}T23:59:59-03:00`)
  return Number.isNaN(date.getTime()) ? { error: 'Data de validade do plano invalida.' } : { date }
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

async function updateSyndicProfile(condominiumId, { name, whatsapp, email }) {
  const { data: profiles, error } = await supabaseAdmin
    .from('profiles')
    .select('id, role, email')
    .or(`condominium_id.eq.${condominiumId},condominio_id.eq.${condominiumId}`)
    .order('created_at', { ascending: true })

  if (error) return error.message
  const syndic = (profiles || []).find((profile) => isCondominiumAdminRole(profile.role))
  if (!syndic) return null

  const patch = { updated_at: new Date().toISOString() }

  // E-mail de acesso: troca no Auth primeiro (login por CNPJ usa este e-mail) e depois no perfil.
  if (email && email !== String(syndic.email || '').toLowerCase()) {
    const { data: taken } = await supabaseAdmin.from('profiles').select('id').eq('email', email).neq('id', syndic.id).limit(1)
    if (taken?.length) return 'Este e-mail ja esta em uso por outro acesso.'

    const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(syndic.id, { email, email_confirm: true })
    if (authError) return authError.message || 'Nao foi possivel alterar o e-mail de acesso.'
    patch.email = email
  }
  if (name) patch.nome = name
  if (whatsapp) patch.whatsapp = whatsapp

  const { error: updateError } = await supabaseAdmin.from('profiles').update(patch).eq('id', syndic.id)
  return updateError?.message || null
}

export async function POST(req) {
  const originError = rejectForeignOrigin(req)
  if (originError) return originError

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

  const requestedStatus = String(body.status || '').trim().toLowerCase()
  const nextStatus = ACTION_STATUS[action] || (ALLOWED_STATUSES.has(requestedStatus) ? requestedStatus : current.status)
  if (!ALLOWED_STATUSES.has(nextStatus)) {
    return json({ error: 'Status invalido para o condominio.' }, 400)
  }

  const plan = body.plan ? String(body.plan).trim() : ''
  if (plan && plan !== 'trial' && !PLANS[plan.toUpperCase()]) {
    return json({ error: 'Plano invalido.' }, 400)
  }
  const normalizedPlan = plan === 'trial' ? 'trial' : plan.toUpperCase()
  if (normalizedPlan && normalizedPlan !== 'trial' && !PLANS[normalizedPlan].available) {
    return json({ error: `O plano ${normalizedPlan} ainda esta em desenvolvimento.` }, 400)
  }

  const expiry = parseExpiryDate(body.plan_expires_at)
  if (expiry.error) {
    return json({ error: expiry.error }, 400)
  }

  const now = new Date()
  let metadata = current.metadata && typeof current.metadata === 'object' ? { ...current.metadata } : {}

  if (nextStatus === 'active') {
    metadata = applyApproval(metadata, now)
  }
  if (normalizedPlan && nextStatus === 'active') {
    metadata = applyPlan(metadata, normalizedPlan, now, expiry.date)
  } else if (normalizedPlan) {
    // Ainda nao aprovado: guarda a escolha sem iniciar datas de teste/assinatura.
    metadata.plan_name = normalizedPlan === 'trial' ? 'ONE' : normalizedPlan
    metadata.subscription_status = normalizedPlan === 'trial' ? 'trial' : 'active'
    if (normalizedPlan !== 'trial' && expiry.date) metadata.plan_expires_at = expiry.date.toISOString()
  }

  metadata.reviewed_by_platform_admin = auth.user?.id || null
  metadata.reviewed_at = now.toISOString()

  const updatePayload = {
    status: nextStatus,
    updated_at: now.toISOString(),
  }

  if (action === 'save') {
    const name = String(body.name || '').trim()
    const cnpj = String(body.cnpj || '').replace(/\D/g, '')
    const documentType = getCpfCnpjType(cnpj)

    if (!name) {
      return json({ error: 'Informe o nome do condominio.' }, 400)
    }
    if (!documentType) {
      return json({ error: 'Informe um CPF ou CNPJ valido para o condominio.' }, 400)
    }

    const syndicEmail = String(body.syndic_email || '').trim().toLowerCase()
    if (syndicEmail && !EMAIL_PATTERN.test(syndicEmail)) {
      return json({ error: 'Informe um e-mail valido para o sindico.' }, 400)
    }

    // Somente o administrador da plataforma altera a quantidade de unidades (o sindico so tem leitura via RLS).
    const unitCount = Number(body.unit_count)
    if (!Number.isInteger(unitCount) || unitCount < 1) {
      return json({ error: 'Informe uma quantidade de unidades valida (minimo 1).' }, 400)
    }

    let occupiedUnits = 0
    try {
      occupiedUnits = (await loadUnitUsage(condominiumId)).apartments.size
    } catch (unitError) {
      return json({ error: unitError.message }, 500)
    }
    if (unitCount < occupiedUnits) {
      return json({ error: `O condominio ja tem ${occupiedUnits} unidades ocupadas. A quantidade nao pode ficar abaixo disso.` }, 400)
    }

    const addressDetails = sanitizeAddress(body.address_details)
    const address = composeAddress(addressDetails)

    Object.assign(updatePayload, {
      unit_count: unitCount,
      name,
      nome: name,
      cnpj,
      address,
      endereco: address,
      zip_code: addressDetails.zip_code,
      whatsapp: String(body.whatsapp || '').replace(/\D/g, ''),
    })

    metadata = {
      ...metadata,
      condominium_document_type: documentType,
      address_details: addressDetails,
      sub_syndic: {
        name: String(body.sub_syndic?.name || '').trim(),
        whatsapp: String(body.sub_syndic?.whatsapp || '').replace(/\D/g, ''),
      },
      platform_note: String(body.platform_note || '').trim(),
    }
  }

  updatePayload.metadata = metadata

  const { data, error } = await supabaseAdmin
    .from('condominiums')
    .update(updatePayload)
    .eq('id', condominiumId)
    .select('id, status, updated_at')
    .maybeSingle()

  if (error) {
    return json({ error: error.message || 'Nao foi possivel atualizar o condominio.' }, 500)
  }

  if (action === 'save') {
    const syndicError = await updateSyndicProfile(condominiumId, {
      name: String(body.syndic_name || '').trim(),
      whatsapp: updatePayload.whatsapp,
      email: String(body.syndic_email || '').trim().toLowerCase(),
    })
    if (syndicError) {
      return json({ error: `Condominio salvo, mas os dados do sindico falharam: ${syndicError}` }, 500)
    }
  }

  return json({ success: true, condominium: data })
}
