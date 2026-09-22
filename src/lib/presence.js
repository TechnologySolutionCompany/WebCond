// Presenca do sindico no painel da plataforma.
//   Online  (verde)    -> painel aberto: sinal recebido nos ultimos minutos
//   Ausente (laranja)  -> saiu ou fechou o painel, ha menos de 15 dias
//   Offline (vermelho) -> 15 dias seguidos ou mais sem acessar (ou nunca acessou)
// O painel do sindico manda um sinal por minuto; ate 3 minutos sem sinal ainda conta como online.
export const HEARTBEAT_MS = 60 * 1000
export const ONLINE_WINDOW_MS = 3 * 60 * 1000
export const OFFLINE_AFTER_DAYS = 15

const DAY_MS = 24 * 60 * 60 * 1000

function toTime(value) {
  const time = value ? new Date(value).getTime() : Number.NaN
  return Number.isFinite(time) ? time : null
}

export function formatElapsed(ms) {
  const seconds = Math.max(0, Math.round(ms / 1000))
  if (seconds < 60) return `${seconds} s`
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes} min`
  const hours = Math.round(minutes / 60)
  if (hours < 48) return `${hours} h`
  return `${Math.round(hours / 24)} dias`
}

export function getPresence({ lastSeenAt, leftAt } = {}, now = Date.now()) {
  const lastSeen = toTime(lastSeenAt)
  const left = toTime(leftAt)

  if (lastSeen === null) {
    return { key: 'offline', label: 'Offline', color: 'var(--red)', detail: 'Nunca acessou a plataforma.' }
  }

  const sinceSeen = now - lastSeen
  const signedOutAfterLastSignal = left !== null && left >= lastSeen

  if (!signedOutAfterLastSignal && sinceSeen <= ONLINE_WINDOW_MS) {
    return { key: 'online', label: 'Online', color: 'var(--green)', detail: `Logado agora. Ultimo sinal ha ${formatElapsed(sinceSeen)}.` }
  }

  if (sinceSeen >= OFFLINE_AFTER_DAYS * DAY_MS) {
    return { key: 'offline', label: 'Offline', color: 'var(--red)', detail: `Ha ${formatElapsed(sinceSeen)} sem acessar a plataforma (${OFFLINE_AFTER_DAYS} dias ou mais).` }
  }

  const since = now - (signedOutAfterLastSignal ? left : lastSeen)
  return { key: 'ausente', label: 'Ausente', color: 'var(--orange)', detail: `Saiu do sistema ha ${formatElapsed(since)}.` }
}

export const PRESENCE_LEGEND = [
  { key: 'online', label: 'Online', color: 'var(--green)', detail: 'Logado dentro dos ultimos 3 minutos.' },
  { key: 'ausente', label: 'Ausente', color: 'var(--orange)', detail: 'Saiu do sistema ha algum tempo (menos de 15 dias).' },
  { key: 'offline', label: 'Offline', color: 'var(--red)', detail: 'Mais de 15 dias seguidos sem acessar a plataforma.' },
]
