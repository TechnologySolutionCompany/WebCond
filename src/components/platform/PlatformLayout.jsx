import { useEffect, useMemo, useRef, useState } from 'react'
import { Activity, Building2, LayoutDashboard, LifeBuoy, Menu } from 'lucide-react'
import Sidebar from '../shared/Sidebar'
import { useSidebarMenu } from '../../hooks/useSidebarMenu'
import PlatformDashboard from './PlatformDashboard'
import PlatformCondominiums from './PlatformCondominiums'
import PlatformStatusPage from './PlatformStatusPage'
import PlatformSuporte from './PlatformSuporte'
import { supabase } from '../../lib/supabase'
import { listPlatformCondominiums } from '../../lib/platformApi'

const PAGES = {
  dashboard: PlatformDashboard,
  condominiums: PlatformCondominiums,
  status: PlatformStatusPage,
  suporte: PlatformSuporte,
}

// Lista de condominios (presenca dos sindicos) e contador de chamados sao atualizados em segundo plano.
const BACKGROUND_REFRESH_MS = 60000

export default function PlatformLayout() {
  const [page, setPage] = useState('dashboard')
  const { mobileOpen, toggleMenu, closeMobile, layoutClassName } = useSidebarMenu()
  const [mountedPages, setMountedPages] = useState(['dashboard'])
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

  const nav = useMemo(() => ([
    {
      label: 'Plataforma',
      items: [
        { key: 'dashboard', label: 'Painel global', icon: LayoutDashboard },
        { key: 'condominiums', label: 'Condominios', icon: Building2 },
        { key: 'status', label: 'Status da plataforma', icon: Activity },
        { key: 'suporte', label: 'Suporte', icon: LifeBuoy, badge: openTickets },
      ],
    },
  ]), [openTickets])

  const loadTicketCount = async () => {
    const { count, error: countError } = await supabase
      .from('suporte_chamados')
      .select('id', { count: 'exact', head: true })
      .neq('status', 'resolvido')
    if (!countError) setOpenTickets(count || 0)
  }

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
    } catch (requestError) {
      if (!silent) setError(requestError.message || 'Nao foi possivel carregar o painel global.')
    } finally {
      if (!silent) setLoading(false)
    }
  }

  useEffect(() => {
    void loadPlatformData()
    void loadTicketCount()
    const interval = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return
      void loadPlatformData({ silent: true })
      void loadTicketCount()
    }, BACKGROUND_REFRESH_MS)
    return () => window.clearInterval(interval)
  }, [])

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
    if (nextPage === page) return

    if (mainContentRef.current) {
      scrollPositionsRef.current[page] = mainContentRef.current.scrollTop
    }

    setMountedPages((current) => (current.includes(nextPage) ? current : [...current, nextPage]))
    setPage(nextPage)
  }

  const currentLabel = nav.flatMap((section) => section.items).find((item) => item.key === page)?.label || 'Painel global'

  return (
    <div className={`app-layout ${layoutClassName}`}>
      <Sidebar items={nav} activeKey={page} onNav={handleNavigate} theme="platform" mobileOpen={mobileOpen} onClose={closeMobile} />
      <main className="main-content" ref={mainContentRef}>
        <div className="mobile-topbar">
          <button className="btn btn-ghost btn-icon" onClick={toggleMenu} aria-label="Abrir ou recolher o menu" aria-expanded={mobileOpen || !layoutClassName}>
            <Menu size={18} />
          </button>
          <div>
            <div className="mobile-topbar-title">WebCond Platform</div>
            <div className="mobile-topbar-sub">{currentLabel}</div>
          </div>
        </div>

        <div className="page-content">
          {mountedPages.map((pageKey) => {
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
                  onChanged={loadTicketCount}
                />
              </div>
            )
          })}
        </div>
      </main>
    </div>
  )
}
