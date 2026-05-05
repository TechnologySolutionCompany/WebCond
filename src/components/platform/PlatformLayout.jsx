import { useEffect, useMemo, useRef, useState } from 'react'
import { Activity, Building2, LayoutDashboard, Menu } from 'lucide-react'
import Sidebar from '../shared/Sidebar'
import PlatformDashboard from './PlatformDashboard'
import PlatformCondominiums from './PlatformCondominiums'
import PlatformStatusPage from './PlatformStatusPage'
import { listPlatformCondominiums } from '../../lib/platformApi'

const PAGES = {
  dashboard: PlatformDashboard,
  condominiums: PlatformCondominiums,
  status: PlatformStatusPage,
}

export default function PlatformLayout() {
  const [page, setPage] = useState('dashboard')
  const [mobileOpen, setMobileOpen] = useState(false)
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
  const mainContentRef = useRef(null)
  const scrollPositionsRef = useRef({})

  const nav = useMemo(() => ([
    {
      label: 'Plataforma',
      items: [
        { key: 'dashboard', label: 'Painel global', icon: LayoutDashboard },
        { key: 'condominiums', label: 'Condominios', icon: Building2 },
        { key: 'status', label: 'Status da plataforma', icon: Activity },
      ],
    },
  ]), [])

  const loadPlatformData = async () => {
    setLoading(true)
    setError('')

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
      setError(requestError.message || 'Nao foi possivel carregar o painel global.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadPlatformData()
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
    <div className="app-layout">
      <Sidebar items={nav} activeKey={page} onNav={handleNavigate} theme="platform" mobileOpen={mobileOpen} onClose={() => setMobileOpen(false)} />
      <main className="main-content" ref={mainContentRef}>
        <div className="mobile-topbar">
          <button className="btn btn-ghost btn-icon" onClick={() => setMobileOpen(true)}>
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
                />
              </div>
            )
          })}
        </div>
      </main>
    </div>
  )
}
