// Ultima tela aberta (v1.09A5). No celular, o sistema costuma recarregar o app instalado quando a
// pessoa sai para outro aplicativo (abrir o boleto no navegador, pagar no app do banco) e volta.
// Sem isto o WebCond reabria no Painel; agora reabre na tela e na cobranca em que a pessoa estava.
//
// Fica so neste aparelho (localStorage), separado por pessoa: num computador compartilhado,
// quem entra depois nao herda a tela de outra pessoa. Vale por 12 horas; depois disso o app
// volta a abrir no Painel, que e o esperado de quem abre o sistema "do zero".
export const LAST_VIEW_TTL_MS = 12 * 60 * 60 * 1000
const PREFIX = 'webcond:ultima-tela'

function browserStorage() {
  try {
    return typeof window === 'undefined' ? null : window.localStorage
  } catch {
    return null
  }
}

function keyFor(scope, ownerId) {
  return `${PREFIX}:${scope}:${ownerId || 'anon'}`
}

export function readLastView(scope, ownerId, { now = Date.now(), storage = browserStorage() } = {}) {
  try {
    const raw = storage?.getItem(keyFor(scope, ownerId))
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || !Number.isFinite(parsed.at)) return null
    if (now - parsed.at > LAST_VIEW_TTL_MS) {
      storage.removeItem(keyFor(scope, ownerId))
      return null
    }
    return parsed.value ?? null
  } catch {
    return null
  }
}

export function saveLastView(scope, ownerId, value, { now = Date.now(), storage = browserStorage() } = {}) {
  try {
    if (value === null || value === undefined || value === '') {
      storage?.removeItem(keyFor(scope, ownerId))
      return
    }
    storage?.setItem(keyFor(scope, ownerId), JSON.stringify({ value, at: now }))
  } catch {
    // Sem armazenamento (aba anonima restrita): o app so nao lembra a tela.
  }
}

// Pagina inicial do painel: a ultima aberta, se ainda for uma pagina valida; senao, a padrao.
export function initialPage(scope, ownerId, validPages, fallback) {
  const saved = readLastView(scope, ownerId)
  return typeof saved === 'string' && validPages.includes(saved) ? saved : fallback
}
