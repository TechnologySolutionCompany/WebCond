import { useEffect, useRef, useState } from 'react'
import { LayoutDashboard, DollarSign, Bell, FileText, User, TriangleAlert, Menu, LifeBuoy } from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import { useCondominiumSettings } from '../../hooks/useCondominiumSettings'
import { painelLogoUrl } from '../../lib/condominiumLogo'
import { useMoradorPresence } from '../../hooks/useMoradorPresence'
import { isResidentRole } from '../../lib/auth'
import Sidebar from '../shared/Sidebar'
import { useSidebarMenu } from '../../hooks/useSidebarMenu'
import { useDeepLinkPage } from '../../hooks/useDeepLinkPage'
import { initialPage, saveLastView } from '../../lib/lastView'
import PlanAttentionBanner from '../shared/PlanAttentionBanner'
import EmailObrigatorio from '../shared/EmailObrigatorio'
import MoradorDashboard from './Dashboard'
import MoradorCobrancas from './Cobrancas'
import { MoradorAvisos, MoradorDocumentos } from './AvisosDocumentos'
import MoradorPerfil from './Perfil'
import MoradorOcorrencias from './Ocorrencias'
import SuporteHub from '../shared/SuporteHub'
import { sendTenantFeedback } from '../../lib/tenantApi'

// Suporte do morador (v1.09A5): Feedback para a plataforma e Sobre. Assunto do condominio
// continua indo para o sindico, pelas ocorrencias.
function MoradorSuporte(props) {
  return <SuporteHub sendFeedback={sendTenantFeedback} {...props} />
}

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
      { key: 'suporte', label: 'Suporte', icon: LifeBuoy },
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
  suporte: MoradorSuporte,
}

export default function MoradorLayout() {
  const { profile } = useAuth()
  const { settings: condominiumSettings } = useCondominiumSettings(profile?.condominium_id || profile?.condominio_id || null)
  // Reabre na ultima tela aberta (v1.09A5): voltar do boleto no navegador nao leva mais ao Inicio.
  const [activePage, setActivePage] = useState(() => initialPage('morador', profile?.id, Object.keys(pages), 'dashboard'))
  const { mobileOpen, toggleMenu, closeMobile, layoutClassName } = useSidebarMenu()
  const [mountedPages, setMountedPages] = useState(() => [activePage])
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

  useDeepLinkPage(Object.keys(pages), handleNavigate)
  useEffect(() => { saveLastView('morador', profile?.id, activePage) }, [activePage, profile?.id])

  return (
    <div className={`app-layout theme-morador ${layoutClassName}`}>
      <EmailObrigatorio />
      <Sidebar items={nav} activeKey={activePage} onNav={handleNavigate} theme="morador" mobileOpen={mobileOpen} onClose={closeMobile} />
      <main className="main-content" ref={mainContentRef}>
        <div className="mobile-topbar">
          <button className="btn btn-ghost btn-icon" onClick={toggleMenu} aria-label="Abrir ou recolher o menu" aria-expanded={mobileOpen || !layoutClassName}>
            <Menu size={18} />
          </button>
          <img src={painelLogoUrl(condominiumSettings.logoPath)} alt="" aria-hidden="true" className="marca-mini" />
          <div>
            <div className="mobile-topbar-title">{condominiumSettings.name}</div>
            <div className="mobile-topbar-sub">{currentLabel}</div>
          </div>
        </div>
        <div className="page-content">
          {activePage === 'dashboard' && <PlanAttentionBanner audience="resident" />}
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
