import { supabaseAdmin } from './supabaseAdmin.js'
import { normalizeUnitNumber } from '../../src/lib/units.js'

const RESIDENT_ROLES = new Set(['morador', 'resident'])

export function normalizeApartment(value = '') {
  return normalizeUnitNumber(value)
}

// Tabela "unidades" ainda nao criada (SQL pendente): PostgREST responde PGRST205 / Postgres 42P01.
export function isMissingTableError(error) {
  return error?.code === 'PGRST205' || error?.code === '42P01'
}

async function loadResidentApartments(condominiumId, excludeProfileId) {
  const { data: profiles, error } = await supabaseAdmin
    .from('profiles')
    .select('id, role, ativo, apartamento')
    .or(`condominium_id.eq.${condominiumId},condominio_id.eq.${condominiumId}`)

  if (error) throw new Error('Nao foi possivel validar o limite de unidades do condominio.')

  const apartments = new Set()
  for (const profile of profiles || []) {
    if (profile.id === excludeProfileId || profile.ativo === false) continue
    if (!RESIDENT_ROLES.has(String(profile.role || '').trim().toLowerCase())) continue
    const apartment = normalizeApartment(profile.apartamento)
    if (apartment) apartments.add(apartment)
  }
  return apartments
}

// Unidades cadastradas e o limite definido pela plataforma.
export async function loadUnitUsage(condominiumId, { excludeProfileId = null } = {}) {
  const [{ data: condominium, error: condominiumError }, unitsResult] = await Promise.all([
    supabaseAdmin.from('condominiums').select('unit_count').eq('id', condominiumId).maybeSingle(),
    supabaseAdmin.from('unidades').select('numero').eq('condominium_id', condominiumId),
  ])

  if (condominiumError) {
    throw new Error('Nao foi possivel validar o limite de unidades do condominio.')
  }

  let apartments
  if (unitsResult.error && isMissingTableError(unitsResult.error)) {
    apartments = await loadResidentApartments(condominiumId, excludeProfileId)
  } else if (unitsResult.error) {
    throw new Error('Nao foi possivel validar o limite de unidades do condominio.')
  } else {
    apartments = new Set((unitsResult.data || []).map((unit) => normalizeApartment(unit.numero)))
  }

  return { unitLimit: Number(condominium?.unit_count || 0), apartments }
}

// Retorna mensagem de erro se a unidade nova ultrapassar o limite; null se estiver liberado.
export function checkUnitAvailability({ unitLimit, apartments }, apartment) {
  const normalized = normalizeApartment(apartment)
  if (!unitLimit || !normalized || apartments.has(normalized)) return null
  if (apartments.size < unitLimit) return null
  return `Limite de ${unitLimit} unidades do condominio atingido. Para ampliar, solicite a administracao da plataforma WebCond.`
}
