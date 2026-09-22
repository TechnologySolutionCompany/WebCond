import { json, requirePlatformAdmin, supabaseAdmin } from '../../_lib/supabaseAdmin.js'
import { getCondominiumAccessState } from '../../../src/lib/condominiumPlan.js'
import { resolveAddressDetails } from '../../../src/lib/address.js'

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
    address_details: resolveAddressDetails(base),
    sub_syndic: base.metadata?.sub_syndic || { name: '', whatsapp: '' },
    platform_note: base.metadata?.platform_note || '',
    apartments_count: details.unitsCount ?? (details.apartments ? details.apartments.size : 0),
    documents_count: details.documentsCount || 0,
    document_limit: accessState.documentLimit,
    plan_attention: accessState.planAttention,
    plan_locked: accessState.planLocked,
    plan_expiring_soon: accessState.planExpiringSoon,
    plan_days_left: accessState.planDaysLeft,
    plan_ends_at: accessState.planEndsAt,
    plan_expires_at: accessState.planExpiresAt,
    total_users: details.totalUsers || 0,
    active_users: details.activeUsers || 0,
    residents_count: details.residentsCount || 0,
    syndic: details.syndic || null,
    plan_name: accessState.planName,
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

  const [{ data: condominiums, error: condominiumError }, { data: profiles, error: profileError }, { data: documents }, unitsResult] = await Promise.all([
    supabaseAdmin
      .from('condominiums')
      .select('id, name, nome, cnpj, address, endereco, zip_code, whatsapp, unit_count, status, created_at, updated_at, metadata')
      .order('created_at', { ascending: false }),
    supabaseAdmin
      .from('profiles')
      .select('id, nome, email, whatsapp, role, ativo, apartamento, condominium_id, condominio_id')
      .order('created_at', { ascending: true }),
    supabaseAdmin.from('documentos').select('condominium_id, condominio_id'),
    supabaseAdmin.from('unidades').select('condominium_id'),
  ])
  // Sem a tabela de unidades (SQL pendente), a contagem cai para os apartamentos dos moradores.
  const unitCounts = unitsResult.error ? null : (unitsResult.data || []).reduce((acc, unit) => acc.set(unit.condominium_id, (acc.get(unit.condominium_id) || 0) + 1), new Map())

  if (condominiumError) {
    return json({ error: condominiumError.message || 'Nao foi possivel listar os condominios.' }, 500)
  }

  if (profileError) {
    return json({ error: profileError.message || 'Nao foi possivel carregar as metricas da plataforma.' }, 500)
  }

  // Presenca do sindico em consulta separada: sem o SQL 09-25 aplicado, a lista continua funcionando.
  const presenceResult = await supabaseAdmin.from('profiles').select('id, ultimo_acesso_em, saiu_em')
  const presenceById = new Map((presenceResult.error ? [] : presenceResult.data || []).map((row) => [row.id, row]))

  const detailsByCondominium = new Map()
  const ensureDetails = (condominiumId) => {
    if (!detailsByCondominium.has(condominiumId)) {
      detailsByCondominium.set(condominiumId, { totalUsers: 0, activeUsers: 0, residentsCount: 0, syndic: null, apartments: new Set(), documentsCount: 0 })
    }
    return detailsByCondominium.get(condominiumId)
  }

  for (const document of documents || []) {
    const condominiumId = document.condominium_id || document.condominio_id
    if (condominiumId) ensureDetails(condominiumId).documentsCount += 1
  }

  for (const profile of profiles || []) {
    const condominiumId = profile.condominium_id || profile.condominio_id
    if (!condominiumId) continue

    const current = ensureDetails(condominiumId)
    current.totalUsers += 1
    if (profile.ativo !== false) current.activeUsers += 1

    const normalizedRole = String(profile.role || '').trim().toLowerCase()
    if (normalizedRole === 'morador' || normalizedRole === 'resident') {
      current.residentsCount += 1
      const apartment = String(profile.apartamento || '').trim().toLowerCase()
      if (apartment && profile.ativo !== false) current.apartments.add(apartment)
    }

    if (!current.syndic && (normalizedRole === 'admin' || normalizedRole === 'admin_condominium')) {
      current.syndic = {
        id: profile.id,
        nome: profile.nome || '',
        email: profile.email || '',
        whatsapp: profile.whatsapp || '',
        ultimo_acesso_em: presenceById.get(profile.id)?.ultimo_acesso_em || null,
        saiu_em: presenceById.get(profile.id)?.saiu_em || null,
      }
    }
  }

  const items = (condominiums || []).map((condominium) => {
    const details = detailsByCondominium.get(condominium.id) || {}
    return normalizeCondominium(condominium, unitCounts ? { ...details, unitsCount: unitCounts.get(condominium.id) || 0 } : details)
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
