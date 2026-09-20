import { useCallback, useState } from 'react'

const COLLAPSED_KEY = 'webcond:sidebar-collapsed'
const MOBILE_QUERY = '(max-width: 920px)'

function readCollapsed() {
  try {
    return window.localStorage.getItem(COLLAPSED_KEY) === '1'
  } catch {
    return false
  }
}

// Menu hamburguer: no celular abre/fecha a gaveta; no computador recolhe/expande o menu fixo.
export function useSidebarMenu() {
  const [mobileOpen, setMobileOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(readCollapsed)

  const toggleMenu = useCallback(() => {
    if (window.matchMedia(MOBILE_QUERY).matches) {
      setMobileOpen((current) => !current)
      return
    }

    setCollapsed((current) => {
      const next = !current
      try {
        window.localStorage.setItem(COLLAPSED_KEY, next ? '1' : '0')
      } catch {
        // Preferencia apenas local; sem storage o menu so nao lembra o estado.
      }
      return next
    })
  }, [])

  const closeMobile = useCallback(() => setMobileOpen(false), [])

  return {
    mobileOpen,
    collapsed,
    toggleMenu,
    closeMobile,
    layoutClassName: collapsed ? 'sidebar-collapsed' : '',
  }
}
