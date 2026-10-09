import { useEffect, useRef, useState } from 'react'
import { House, Receipt, Bell, FileText, User, TriangleAlert, LifeBuoy, QrCode, ChartColumn } from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import { useCondominiumSettings } from '../../hooks/useCondominiumSettings'
import { useMoradorPresence } from '../../hooks/useMoradorPresence'
import { isResidentRole } from '../../lib/auth'
import Sidebar from '../shared/Sidebar'
import { AppTopbar, BottomNav, initialsOf } from '../shared/AppChrome'
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
import MoradorResumo from './Resumo'
import SuporteHub from '../shared/SuporteHub'
import { sendTenantFeedback } from '../../lib/tenantApi'

// Suporte do morador (v1.09A5): Feedback para a plataforma e Sobre. Assunto do condominio
// continua indo para o sindico, pelas ocorrencias.
function MoradorSuporte(props) {
  return <SuporteHub sendFeedback={sendTenantFeedback} {...props} />
}

const nav = [
  {
    label: 'Meu espaço',
    items: [
      { key: 'dashboard', label: 'Início', icon: House },
      { key: 'cobrancas', label: 'Minhas cobranças', icon: Receipt },
      { key: 'resumo', label: 'Resumo do condomínio', icon: ChartColumn },
      { key: 'avisos', label: 'Avisos', icon: Bell },
      { key: 'documentos', label: 'Documentos', icon: FileText },
      { key: 'ocorrencias', label: 'Ocorrências', icon: TriangleAlert },
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

// Barra inferior do celular (redesign v2.10A3): Inicio, Cobrancas, [Pagar], Avisos, Mais.
const TABS = [
  { key: 'dashboard', label: 'Início', icon: House },
  { key: 'cobrancas', label: 'Cobranças', icon: Receipt },
  { key: 'avisos', label: 'Avisos', icon: Bell },
]

const pages = {
  dashboard: MoradorDashboard,
  cobrancas: MoradorCobrancas,
  resumo: MoradorResumo,
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
  const currentLabel = nav.flatMap((section) => section.items).find((item) => item.key === activePage)?.label || 'Início'
  // Botao principal: pagar uma cobranca (abre Minhas cobrancas).
  const pagar = { label: 'Pagar cobrança', icon: QrCode, onClick: () => handleNavigate('cobrancas') }

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
      <Sidebar items={nav} activeKey={activePage} onNav={handleNavigate} theme="morador" cta={pagar} mobileOpen={mobileOpen} onClose={closeMobile} />
      <main className="main-content" ref={mainContentRef}>
        <AppTopbar
          title={condominiumSettings.name}
          logoPath={condominiumSettings.logoPath}
          crumbRoot={condominiumSettings.name}
          crumbPage={currentLabel}
          onToggleMenu={toggleMenu}
          menuExpanded={mobileOpen || !layoutClassName}
          initials={initialsOf(profile?.nome)}
          onAvatar={() => handleNavigate('perfil')}
        />
        <div className="page-content">
          {activePage === 'dashboard' && <PlanAttentionBanner audience="resident" />}
          {mountedPages.map((pageKey) => {
            const PageComponent = pages[pageKey] || MoradorDashboard
            const isActive = pageKey === activePage

            return (
              <div key={pageKey} style={{ display: isActive ? 'block' : 'none' }}>
                <PageComponent isActive={isActive} onNavigate={handleNavigate} />
              </div>
            )
          })}
        </div>
      </main>
      <BottomNav tabs={TABS} activeKey={activePage} onNav={handleNavigate} fab={pagar} onMore={toggleMenu} moreActive={mobileOpen} />
    </div>
  )
}
