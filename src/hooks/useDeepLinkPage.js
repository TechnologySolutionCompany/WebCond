import { useEffect, useRef } from 'react'

function pageFromUrl(url) {
  try {
    return new URL(url, window.location.origin).searchParams.get('pagina') || ''
  } catch {
    return ''
  }
}

// Abre a pagina certa do painel quando a pessoa toca numa notificacao:
// - app fechado: a notificacao abre /morador?pagina=cobrancas e a pagina e lida aqui;
// - app aberto: o service worker manda { type: 'webcond:navigate', url } para a aba.
export function useDeepLinkPage(validPages, onNavigate) {
  const navigateRef = useRef(onNavigate)
  const pagesRef = useRef(validPages)

  useEffect(() => {
    navigateRef.current = onNavigate
    pagesRef.current = validPages
  })

  useEffect(() => {
    const initial = pageFromUrl(window.location.href)
    if (initial) {
      if (pagesRef.current.includes(initial)) navigateRef.current(initial)
      const clean = new URL(window.location.href)
      clean.searchParams.delete('pagina')
      window.history.replaceState(window.history.state, '', clean.pathname + clean.search + clean.hash)
    }

    if (!('serviceWorker' in navigator)) return undefined
    const onMessage = (event) => {
      if (event.data?.type !== 'webcond:navigate') return
      const page = pageFromUrl(event.data.url)
      if (page && pagesRef.current.includes(page)) navigateRef.current(page)
    }
    navigator.serviceWorker.addEventListener('message', onMessage)
    return () => navigator.serviceWorker.removeEventListener('message', onMessage)
  }, [])
}
