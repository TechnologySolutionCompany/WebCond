import { useEffect, useRef, useState } from 'react'
import { LayoutDashboard, DollarSign, Bell, FileText, User, TriangleAlert, Menu } from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import { useCondominiumSettings } from '../../hooks/useCondominiumSettings'
import { useMoradorPresence } from '../../hooks/useMoradorPresence'
import { isResidentRole } from '../../lib/auth'
import Sidebar from '../shared/Sidebar'
import MoradorDashboard from './Dashboard'
import MoradorCobrancas from './Cobrancas'
import { MoradorAvisos, MoradorDocumentos } from './AvisosDocumentos'
import MoradorPerfil from './Perfil'
import MoradorOcorrencias from './Ocorrencias'

const nav = [
  {
    label: 'Meu Espaco',
    items: [
      { key: 'dashboard', label: 'Inicio', icon: LayoutDashboard },
      { key: 'cobrancas', label: 'Minhas cobrancas', icon: DollarSign },
      { key: 'avisos', label: 'Avisos', icon: Bell },
      { key: 'documentos', label: 'Documentos', icon: FileText },
      { key: 'ocorrencias', label: 'Ocorrencias', icon: TriangleAlert },
    ],
  },
  {
    label: 'Conta',
    items: [
      { key: 'perfil', label: 'Meu perfil', icon: User },
    ],
  },
]

const pages = {
  dashboard: MoradorDashboard,
  cobrancas: MoradorCobrancas,
  avisos: MoradorAvisos,
  documentos: MoradorDocumentos,
  ocorrencias: MoradorOcorrencias,
  perfil: MoradorPerfil,
}

export default function MoradorLayout() {
  const { profile } = useAuth()
  const { settings: condominiumSettings } = useCondominiumSettings(profile?.condominium_id || profile?.condominio_id || null)
  const [activePage, setActivePage] = useState('dashboard')
  const [mobileOpen, setMobileOpen] = useState(false)
  const [mountedPages, setMountedPages] = useState(['dashboard'])
  const mainContentRef = useRef(null)
  const scrollPositionsRef = useRef({})
  const currentLabel = nav.flatMap((section) => section.items).find((item) => item.key === activePage)?.label || 'Inicio'

  useMoradorPresence(profile, isResidentRole(profile?.role))

  useEffect(() => {
    const mainContent = mainContentRef.current
    if (!mainContent) return

    const targetScroll = scrollPositionsRef.current[activePage] ?? 0
    requestAnimationFrame(() => {
      if (mainContentRef.current) {
        mainContentRef.current.scrollTop = targetScroll
      }
    })
  }, [activePage])

  const handleNavigate = (nextPage) => {
    if (nextPage === activePage) return

    if (mainContentRef.current) {
      scrollPositionsRef.current[activePage] = mainContentRef.current.scrollTop
    }

    setMountedPages((current) => (current.includes(nextPage) ? current : [...current, nextPage]))
    setActivePage(nextPage)
  }

  return (
    <div className="app-layout theme-morador">
      <Sidebar items={nav} activeKey={activePage} onNav={handleNavigate} theme="morador" mobileOpen={mobileOpen} onClose={() => setMobileOpen(false)} />
      <main className="main-content" ref={mainContentRef}>
        <div className="mobile-topbar">
          <button className="btn btn-ghost btn-icon" onClick={() => setMobileOpen(true)}>
            <Menu size={18} />
          </button>
          <div>
            <div className="mobile-topbar-title">{condominiumSettings.name}</div>
            <div className="mobile-topbar-sub">{currentLabel}</div>
          </div>
        </div>
        <div className="page-content">
          {mountedPages.map((pageKey) => {
            const PageComponent = pages[pageKey] || MoradorDashboard
            const isActive = pageKey === activePage

            return (
              <div key={pageKey} style={{ display: isActive ? 'block' : 'none' }}>
                <PageComponent isActive={isActive} />
              </div>
            )
          })}
        </div>
      </main>
    </div>
  )
}
