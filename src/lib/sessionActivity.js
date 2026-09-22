// Sessao encerrada depois de 5 minutos com o WebCond fechado.
// Enquanto qualquer aba do sistema esta aberta, ela carimba "ainda estou aqui" a cada 30 s.
// Ao abrir de novo, se o ultimo carimbo tem mais de 5 minutos, a sessao e encerrada antes de
// mostrar qualquer tela. A chave e compartilhada entre as abas: uma aba aberta mantem todas vivas.
export const AWAY_LOGOUT_MS = 5 * 60 * 1000
export const ACTIVITY_TICK_MS = 30 * 1000
const KEY = 'webcond:ultimo-sinal'

function browserStorage() {
  try {
    return typeof window === 'undefined' ? null : window.localStorage
  } catch {
    return null
  }
}

export function readLastActivity(storage = browserStorage()) {
  try {
    const value = Number(storage?.getItem(KEY))
    return Number.isFinite(value) && value > 0 ? value : null
  } catch {
    return null
  }
}

export function markActivity(now = Date.now(), storage = browserStorage()) {
  try {
    storage?.setItem(KEY, String(now))
  } catch {
    // Sem armazenamento local (aba anonima restrita): a sessao segue as regras normais do login.
  }
}

// Sem carimbo nenhum (primeiro acesso depois da atualizacao) nao conta como ausencia.
export function isAwayTooLong(lastActivity, now = Date.now(), limit = AWAY_LOGOUT_MS) {
  return lastActivity !== null && now - lastActivity > limit
}
