// Historico das verificacoes do Status da plataforma, guardado no navegador do admin.
// Sair do painel (ou ser desconectado) e voltar mantem as ultimas 24 h de verificacoes.
export const STATUS_REFRESH_MS = 15000
export const STATUS_HISTORY_MAX_AGE_MS = 24 * 60 * 60 * 1000
export const STATUS_HISTORY_MAX_ITEMS = 1000
const KEY = 'webcond:status-historico'

function storage() {
  try {
    return typeof window === 'undefined' ? null : window.localStorage
  } catch {
    return null
  }
}

export function pruneHistory(items = [], now = Date.now()) {
  return items
    .filter((item) => item && item.at && now - new Date(item.at).getTime() <= STATUS_HISTORY_MAX_AGE_MS)
    .slice(-STATUS_HISTORY_MAX_ITEMS)
}

export function loadStatusHistory(store = storage(), now = Date.now()) {
  try {
    const parsed = JSON.parse(store?.getItem(KEY) || '[]')
    return pruneHistory(Array.isArray(parsed) ? parsed : [], now)
  } catch {
    return []
  }
}

export function saveStatusHistory(items, store = storage()) {
  try {
    store?.setItem(KEY, JSON.stringify(pruneHistory(items)))
  } catch {
    // Sem espaco ou sem armazenamento: o historico vale so para esta visita.
  }
}

export function clearStatusHistory(store = storage()) {
  try {
    store?.removeItem(KEY)
  } catch {
    // nada a fazer
  }
}
