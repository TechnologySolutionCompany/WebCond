import { json, requirePlatformAdmin, supabaseAdmin } from '../../_lib/supabaseAdmin.js'
import { getCondominiumAccessState } from '../../../src/lib/condominiumPlan.js'

function normalizeCondominium(base = {}, details = {}) {
  const accessState = getCondominiumAccessState(base)

  return {
    id: base.id,
    name: base.name || base.nome || '',
    cnpj: base.cnpj || '',
    address: base.address || base.endereco || '',
    zip_code: base.zip_code || '',
    whatsapp: base.whatsapp || '',
    unit_count: Number(base.unit_count || 0),
    raw_status: base.status || 'pending',
    status: accessState.effectiveStatus,
    created_at: base.created_at || null,
    updated_at: base.updated_at || null,
    metadata: base.metadata && typeof base.metadata === 'object' ? base.metadata : {},
    total_users: details.totalUsers || 0,
    active_users: details.activeUsers || 0,
    residents_count: details.residentsCount || 0,
    syndic: details.syndic || null,
    plan_name: accessState.planName || details.planName || 'Padrao',
    subscription_status: accessState.subscriptionStatus,
    approved_at: accessState.approvedAt,
    trial_started_at: accessState.trialStartedAt,
    trial_ends_at: accessState.trialEndsAt,
    subscription_activated_at: accessState.subscriptionActivatedAt,
    trial_expired: accessState.isTrialExpired,
    plan_price_label: accessState.planPriceLabel,
  }
}

export async function GET(req) {
  const auth = await requirePlatformAdmin(req)
  if (auth.error) return auth.error

  const [{ data: condominiums, error: condominiumError }, { data: profiles, error: profileError }] = await Promise.all([
    supabaseAdmin
      .from('condominiums')
      .select('id, name, nome, cnpj, address, endereco, zip_code, whatsapp, unit_count, status, created_at, updated_at, metadata')
      .order('created_at', { ascending: false }),
    supabaseAdmin
      .from('profiles')
      .select('id, nome, email, whatsapp, role, ativo, condominium_id, condominio_id')
      .order('created_at', { ascending: true }),
  ])

  if (condominiumError) {
    return json({ error: condominiumError.message || 'Nao foi possivel listar os condominios.' }, 500)
  }

  if (profileError) {
    return json({ error: profileError.message || 'Nao foi possivel carregar as metricas da plataforma.' }, 500)
  }

  const detailsByCondominium = new Map()

  for (const profile of profiles || []) {
    const condominiumId = profile.condominium_id || profile.condominio_id
    if (!condominiumId) continue

    if (!detailsByCondominium.has(condominiumId)) {
      detailsByCondominium.set(condominiumId, {
        totalUsers: 0,
        activeUsers: 0,
        residentsCount: 0,
        syndic: null,
        planName: 'Padrao',
      })
    }

    const current = detailsByCondominium.get(condominiumId)
    current.totalUsers += 1
    if (profile.ativo !== false) current.activeUsers += 1

    const normalizedRole = String(profile.role || '').trim().toLowerCase()
    if (normalizedRole === 'morador' || normalizedRole === 'resident') {
      current.residentsCount += 1
    }

    if (!current.syndic && (normalizedRole === 'admin' || normalizedRole === 'admin_condominium')) {
      current.syndic = {
        id: profile.id,
        nome: profile.nome || '',
        email: profile.email || '',
        whatsapp: profile.whatsapp || '',
      }
    }
  }

  const items = (condominiums || []).map((condominium) => {
    const details = detailsByCondominium.get(condominium.id) || {}
    const metadata = condominium.metadata && typeof condominium.metadata === 'object' ? condominium.metadata : {}
    details.planName = metadata.plan_name || metadata.planName || details.planName || 'FREE'
    return normalizeCondominium(condominium, details)
  })

  const metrics = items.reduce((acc, condominium) => {
    acc.total_condominiums += 1
    acc.total_users += condominium.total_users
    acc[`${condominium.status}_count`] += 1
    return acc
  }, {
    total_condominiums: 0,
    total_users: 0,
    active_count: 0,
    pending_count: 0,
    rejected_count: 0,
    blocked_count: 0,
  })

  return json({
    metrics,
    condominiums: items,
  })
}
