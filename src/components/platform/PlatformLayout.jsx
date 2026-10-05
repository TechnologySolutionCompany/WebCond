import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Activity, Building2, LayoutDashboard, LifeBuoy, MessageSquareHeart, Users } from 'lucide-react'
import Sidebar from '../shared/Sidebar'
import { AppTopbar, BottomNav, initialsOf } from '../shared/AppChrome'
import EmailObrigatorio from '../shared/EmailObrigatorio'
import { useSidebarMenu } from '../../hooks/useSidebarMenu'
import { useDeepLinkPage } from '../../hooks/useDeepLinkPage'
import { useAuth } from '../../hooks/useAuth'
import { isSupportRole } from '../../lib/auth'
import PlatformDashboard from './PlatformDashboard'
import PlatformCondominiums from './PlatformCondominiums'
import PlatformStatusPage from './PlatformStatusPage'
import PlatformSuporte from './PlatformSuporte'
import PlatformEquipe from './PlatformEquipe'
import PlatformFeedbacks from './PlatformFeedbacks'
import { listFeedbacks, listPlatformCondominiums, listSupportTickets } from '../../lib/platformApi'
import { initialPage, saveLastView } from '../../lib/lastView'

const PAGES = {
  dashboard: PlatformDashboard,
  condominiums: PlatformCondominiums,
  status: PlatformStatusPage,
  suporte: PlatformSuporte,
  equipe: PlatformEquipe,
  feedbacks: PlatformFeedbacks,
}

// Equipe de suporte: so chamados e status. As outras paginas nem aparecem (e a API recusa).
const SUPPORT_PAGES = ['suporte', 'status']

// Lista de condominios (presenca dos sindicos) e contador de chamados sao atualizados em segundo plano.
const BACKGROUND_REFRESH_MS = 60000

export default function PlatformLayout() {
  const { resolvedRole, profile } = useAuth()
  const isSupport = isSupportRole(resolvedRole)
  const homePage = isSupport ? 'suporte' : 'dashboard'
  // Reabre na ultima tela aberta (v1.09A5).
  const [page, setPage] = useState(() => initialPage('platform', profile?.id, isSupport ? SUPPORT_PAGES : Object.keys(PAGES), homePage))
  const { mobileOpen, toggleMenu, closeMobile, layoutClassName } = useSidebarMenu()
  const [mountedPages, setMountedPages] = useState(() => [page])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [metrics, setMetrics] = useState({
    total_condominiums: 0,
    total_users: 0,
    active_count: 0,
    pending_count: 0,
    rejected_count: 0,
    blocked_count: 0,
  })
  const [condominiums, setCondominiums] = useState([])
  const [openTickets, setOpenTickets] = useState(0)
  const [newFeedbacks, setNewFeedbacks] = useState(0)
  const mainContentRef = useRef(null)
  const scrollPositionsRef = useRef({})

  const nav = useMemo(() => (isSupport
    ? [{
        label: 'Suporte',
        items: [
          { key: 'suporte', label: 'Chamados', icon: LifeBuoy, badge: openTickets },
          { key: 'status', label: 'Status da plataforma', icon: Activity },
        ],
      }]
    : [{
        label: 'Plataforma',
        items: [
          { key: 'dashboard', label: 'Painel global', icon: LayoutDashboard },
          { key: 'condominiums', label: 'Condomínios', icon: Building2 },
          { key: 'status', label: 'Status da plataforma', icon: Activity },
        ],
      }, {
        label: 'Atendimento',
        items: [
          { key: 'suporte', label: 'Chamados', icon: LifeBuoy, badge: openTickets },
          { key: 'feedbacks', label: 'Feedback', icon: MessageSquareHeart, badge: newFeedbacks },
          { key: 'equipe', label: 'Equipe de suporte', icon: Users },
        ],
      }]), [openTickets, newFeedbacks, isSupport])
  const allowedPages = isSupport ? SUPPORT_PAGES : Object.keys(PAGES)

  const loadTicketCount = useCallback(async () => {
    try {
      const result = await listSupportTickets('abertos')
      setOpenTickets(result.abertos || 0)
    } catch {
      // contador e informativo
    }
  }, [])

  // A pagina de Suporte devolve a contagem depois de carregar ou salvar.
  const handleTicketsChanged = useCallback((count) => {
    if (typeof count === 'number') setOpenTickets(count)
    else void loadTicketCount()
  }, [loadTicketCount])

  // silent: atualizacao de fundo, sem spinner e sem apagar a tela se falhar.
  const loadPlatformData = async ({ silent = false } = {}) => {
    if (!silent) {
      setLoading(true)
      setError('')
    }

    try {
      const result = await listPlatformCondominiums()
      setMetrics(result.metrics || {
        total_condominiums: 0,
        total_users: 0,
        active_count: 0,
        pending_count: 0,
        rejected_count: 0,
        blocked_count: 0,
      })
      setCondominiums(result.condominiums || [])
      return result
    } catch (requestError) {
      if (!silent) setError(requestError.message || 'Nao foi possivel carregar o painel global.')
    } finally {
      if (!silent) setLoading(false)
    }
  }

  useEffect(() => {
    // O suporte nao carrega a lista de condominios (rota exclusiva do admin).
    if (isSupport) setLoading(false)
    else void loadPlatformData()
    void loadTicketCount()
    const interval = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return
      if (!isSupport) void loadPlatformData({ silent: true })
      void loadTicketCount()
    }, BACKGROUND_REFRESH_MS)
    return () => window.clearInterval(interval)
  }, [isSupport, loadTicketCount])

  useEffect(() => {
    const mainContent = mainContentRef.current
    if (!mainContent) return

    const targetScroll = scrollPositionsRef.current[page] ?? 0
    requestAnimationFrame(() => {
      if (mainContentRef.current) {
        mainContentRef.current.scrollTop = targetScroll
      }
    })
  }, [page])

  const handleNavigate = (nextPage) => {
    if (nextPage === page || !allowedPages.includes(nextPage)) return

    if (mainContentRef.current) {
      scrollPositionsRef.current[page] = mainContentRef.current.scrollTop
    }

    setMountedPages((current) => (current.includes(nextPage) ? current : [...current, nextPage]))
    setPage(nextPage)
  }

  useDeepLinkPage(allowedPages, handleNavigate)
  useEffect(() => { saveLastView('platform', profile?.id, page) }, [page, profile?.id])

  // Contador de feedback novo no menu (so o admin; o suporte nao ve a caixa).
  const handleFeedbacksChanged = useCallback((count) => setNewFeedbacks(count), [])
  useEffect(() => {
    if (isSupport) return
    void listFeedbacks('novo').then((result) => setNewFeedbacks(result.novos || 0)).catch(() => {})
  }, [isSupport])

  const currentLabel = nav.flatMap((section) => section.items).find((item) => item.key === page)?.label || 'Painel global'

  // Barra inferior do celular (redesign v2.10A3): sem botao central na plataforma.
  const tabs = isSupport
    ? [{ key: 'suporte', label: 'Chamados', icon: LifeBuoy, badge: openTickets }, { key: 'status', label: 'Status', icon: Activity }]
    : [
        { key: 'dashboard', label: 'Painel', icon: LayoutDashboard },
        { key: 'condominiums', label: 'Condomínios', icon: Building2 },
        { key: 'suporte', label: 'Chamados', icon: LifeBuoy, badge: openTickets },
      ]

  return (
    <div className={`app-layout ${layoutClassName}`}>
      <EmailObrigatorio />
      <Sidebar items={nav} activeKey={page} onNav={handleNavigate} theme="platform" mobileOpen={mobileOpen} onClose={closeMobile} />
      <main className="main-content" ref={mainContentRef}>
        <AppTopbar
          title={isSupport ? 'WebCond Suporte' : 'WebCond'}
          crumbRoot="WebCond"
          crumbPage={currentLabel}
          onToggleMenu={toggleMenu}
          menuExpanded={mobileOpen || !layoutClassName}
          initials={initialsOf(profile?.nome)}
          onAvatar={toggleMenu}
        />

        <div className="page-content">
          {mountedPages.map((pageKey) => {
            if (!allowedPages.includes(pageKey)) return null
            const PageComponent = PAGES[pageKey] || PlatformDashboard
            const isActive = pageKey === page

            return (
              <div key={pageKey} style={{ display: isActive ? 'block' : 'none' }}>
                <PageComponent
                  isActive={isActive}
                  loading={loading}
                  error={error}
                  metrics={metrics}
                  condominiums={condominiums}
                  reload={loadPlatformData}
                  onChanged={handleTicketsChanged}
                  onFeedbacksChanged={handleFeedbacksChanged}
                  onNavigate={handleNavigate}
                  openTickets={openTickets}
                  newFeedbacks={newFeedbacks}
                />
              </div>
            )
          })}
        </div>
      </main>
      <BottomNav tabs={tabs} activeKey={page} onNav={handleNavigate} onMore={toggleMenu} moreActive={mobileOpen} />
    </div>
  )
}
