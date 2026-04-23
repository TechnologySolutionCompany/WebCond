export function getProfileCondominiumId(profile) {
  return profile?.condominium_id || profile?.condominio_id || null
}

export function buildTenantOrFilter(condominiumId) {
  if (!condominiumId) return ''
  return `condominium_id.eq.${condominiumId},condominio_id.eq.${condominiumId}`
}

export function applyTenantFilter(query, condominiumId) {
  if (!condominiumId) return query
  return query.or(buildTenantOrFilter(condominiumId))
}

export function withTenantFields(payload, condominiumId) {
  if (!condominiumId) return payload

  return {
    ...payload,
    condominium_id: condominiumId,
    condominio_id: condominiumId,
  }
}
