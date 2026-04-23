const DEFAULT_STATUS = 'morando'

function safeParse(value) {
  if (!value) return {}

  try {
    return JSON.parse(value)
  } catch {
    return {}
  }
}

export function getMoradiaStatus(profile) {
  if (!profile) return DEFAULT_STATUS

  if (profile.status_moradia) {
    return profile.status_moradia
  }

  const meta = safeParse(profile.observacao)
  return meta.status_moradia || DEFAULT_STATUS
}

export function buildProfileObservation(profile = {}, nextStatus = DEFAULT_STATUS) {
  const meta = safeParse(profile.observacao)
  return JSON.stringify({
    ...meta,
    status_moradia: nextStatus,
  })
}
