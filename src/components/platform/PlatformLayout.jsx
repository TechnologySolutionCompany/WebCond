import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Activity, Building2, LayoutDashboard, LifeBuoy, Menu, Users } from 'lucide-react'
import Sidebar from '../shared/Sidebar'
import { useSidebarMenu } from '../../hooks/useSidebarMenu'
import { useDeepLinkPage } from '../../hooks/useDeepLinkPage'
import { useAuth } from '../../hooks/useAuth'
import { isSupportRole } from '../../lib/auth'
import PlatformDashboard from './PlatformDashboard'
import PlatformCondominiums from './PlatformCondominiums'
import PlatformStatusPage from './PlatformStatusPage'
import PlatformSuporte from './PlatformSuporte'
import PlatformEquipe from './PlatformEquipe'
import { listPlatformCondominiums, listSupportTickets } from '../../lib/platformApi'

const PAGES = {
  dashboard: PlatformDashboard,
  condominiums: PlatformCondominiums,
  status: PlatformStatusPage,
  suporte: PlatformSuporte,
  equipe: PlatformEquipe,
}

// Equipe de suporte: so chamados e status. As outras paginas nem aparecem (e a API recusa).
const SUPPORT_PAGES = ['suporte', 'status']

// Lista de condominios (presenca dos sindicos) e contador de chamados sao atualizados em segundo plano.
const BACKGROUND_REFRESH_MS = 60000

export default function PlatformLayout() {
  const { resolvedRole } = useAuth()
  const isSupport = isSupportRole(resolvedRole)
  const homePage = isSupport ? 'suporte' : 'dashboard'
  const [page, setPage] = useState(homePage)
  const { mobileOpen, toggleMenu, closeMobile, layoutClassName } = useSidebarMenu()
  const [mountedPages, setMountedPages] = useState([homePage])
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
          { key: 'condominiums', label: 'Condominios', icon: Building2 },
          { key: 'status', label: 'Status da plataforma', icon: Activity },
          { key: 'suporte', label: 'Suporte', icon: LifeBuoy, badge: openTickets },
          { key: 'equipe', label: 'Equipe de suporte', icon: Users },
        ],
      }]), [openTickets, isSupport])
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

  const currentLabel = nav.flatMap((section) => section.items).find((item) => item.key === page)?.label || 'Painel global'

  return (
    <div className={`app-layout ${layoutClassName}`}>
      <Sidebar items={nav} activeKey={page} onNav={handleNavigate} theme="platform" mobileOpen={mobileOpen} onClose={closeMobile} />
      <main className="main-content" ref={mainContentRef}>
        <div className="mobile-topbar">
          <button className="btn btn-ghost btn-icon" onClick={toggleMenu} aria-label="Abrir ou recolher o menu" aria-expanded={mobileOpen || !layoutClassName}>
            <Menu size={18} />
          </button>
          <img src="/logo.svg" alt="" aria-hidden="true" className="marca-mini" />
          <div>
            <div className="mobile-topbar-title">{isSupport ? 'WebCond Suporte' : 'WebCond Platform'}</div>
            <div className="mobile-topbar-sub">{currentLabel}</div>
          </div>
        </div>

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
                />
              </div>
            )
          })}
        </div>
      </main>
    </div>
  )
}
