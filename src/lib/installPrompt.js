// "Adicionar o app a tela inicial" (v2.10A3).
//
// Android / Chrome / Edge: o navegador avisa que o app pode ser instalado (evento
// beforeinstallprompt). Guardamos o aviso e, quando a pessoa toca no nosso botao, abrimos a
// janela de instalacao do proprio navegador: um toque em "Instalar" e pronto.
// iPhone / iPad: o iOS nao tem esse evento; nenhum site consegue se instalar sozinho. Ali o botao
// mostra o passo a passo (Compartilhar > Adicionar a Tela de Inicio).
//
// O evento costuma chegar logo no carregamento, antes de qualquer tela montar: por isso este
// modulo e importado no main.jsx e comeca a escutar na hora.

const DISMISS_KEY = 'webcond:instalar-app-dispensado'
const DISMISS_DAYS = 30

let deferredPrompt = null
const listeners = new Set()

function notify() {
  for (const listener of listeners) listener()
}

export function startInstallPromptListener(target = typeof window === 'undefined' ? null : window) {
  if (!target || target.__webcondInstallListener) return
  target.__webcondInstallListener = true
  target.addEventListener('beforeinstallprompt', (event) => {
    // Sem o preventDefault o Chrome mostraria a barrinha dele; o convite fica com o nosso botao.
    event.preventDefault()
    deferredPrompt = event
    notify()
  })
  target.addEventListener('appinstalled', () => {
    deferredPrompt = null
    notify()
  })
}

export function subscribeInstallPrompt(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function canPromptInstall() {
  return Boolean(deferredPrompt)
}

// Ja esta aberto como app instalado (tela cheia, sem barra do navegador)?
export function isStandalone(win = typeof window === 'undefined' ? null : window) {
  if (!win) return false
  return Boolean(win.matchMedia?.('(display-mode: standalone)').matches || win.navigator?.standalone)
}

// iPhone, iPod ou iPad (o iPad novo se apresenta como Mac, mas tem tela de toque).
export function isIos(nav = typeof navigator === 'undefined' ? null : navigator) {
  if (!nav) return false
  const ua = String(nav.userAgent || '')
  return /iphone|ipad|ipod/i.test(ua) || (/macintosh/i.test(ua) && Number(nav.maxTouchPoints || 0) > 1)
}

// Abre a janela de instalacao do navegador. Devolve 'accepted', 'dismissed' ou 'unavailable'.
export async function promptInstall() {
  const event = deferredPrompt
  if (!event) return 'unavailable'
  // O aviso so pode ser usado uma vez.
  deferredPrompt = null
  notify()
  try {
    await event.prompt()
    const choice = await event.userChoice
    return choice?.outcome === 'accepted' ? 'accepted' : 'dismissed'
  } catch {
    return 'unavailable'
  }
}

function storage() {
  try {
    return typeof window === 'undefined' ? null : window.localStorage
  } catch {
    return null
  }
}

export function isInstallDismissed(now = Date.now(), store = storage()) {
  try {
    const at = Number(store?.getItem(DISMISS_KEY) || 0)
    return Boolean(at) && now - at < DISMISS_DAYS * 86400000
  } catch {
    return false
  }
}

export function dismissInstall(now = Date.now(), store = storage()) {
  try {
    store?.setItem(DISMISS_KEY, String(now))
  } catch {
    // Sem armazenamento: o convite so volta a aparecer na proxima visita.
  }
}
