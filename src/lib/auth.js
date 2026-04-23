const ROLE_ALIASES = {
  admin: 'admin',
  admin_condominium: 'admin',
  administrador_condominio: 'admin',
  morador: 'morador',
  resident: 'morador',
  contador: 'contador',
  platform_admin: 'platform_admin',
}

export function normalizeRole(role) {
  if (role == null) return null

  const normalizedKey = String(role).trim().toLowerCase()
  if (!normalizedKey) return null

  return ROLE_ALIASES[normalizedKey] || String(role).trim()
}

export function isAdminRole(role) {
  const normalizedRole = normalizeRole(role)
  return normalizedRole === 'admin' || normalizedRole === 'platform_admin' || normalizedRole === 'contador'
}

export function isResidentRole(role) {
  return normalizeRole(role) === 'morador'
}

export function getHomePathForRole(role) {
  const normalizedRole = normalizeRole(role)

  if (normalizedRole === 'platform_admin') return '/platform'
  if (normalizedRole === 'admin' || normalizedRole === 'contador') return '/admin'
  return '/morador'
}

export function hasRequiredRole(resolvedRole, requiredRole) {
  if (!requiredRole) return true

  const normalizedResolvedRole = normalizeRole(resolvedRole)

  if (Array.isArray(requiredRole)) {
    return requiredRole.some((role) => normalizeRole(role) === normalizedResolvedRole)
  }

  return normalizeRole(requiredRole) === normalizedResolvedRole
}

export function getUserRoleLabel(role, apartment) {
  const normalizedRole = normalizeRole(role)

  if (normalizedRole === 'platform_admin') return 'Administrador da plataforma'
  if (normalizedRole === 'admin') return 'Sindico'
  if (normalizedRole === 'contador') return 'Contador'

  return `Apt. ${apartment || '--'}`
}
