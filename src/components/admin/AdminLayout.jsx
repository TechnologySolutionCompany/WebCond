import { useEffect, useRef, useState } from 'react'
import { LayoutDashboard, Users, DollarSign, Bell, FileText, ClipboardList, Calculator, Menu } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import { applyTenantFilter } from '../../lib/tenant'
import { normalizeRole } from '../../lib/auth'
import Sidebar from '../shared/Sidebar'
import Dashboard from './Dashboard'
import Moradores from './Moradores'
import Cobrancas from './Cobrancas'
import Avisos from './Avisos'
import Documentos from './Documentos'
import Solicitacoes from './Solicitacoes'
import Contador from './Contador'

const PAGES = {
  dashboard: Dashboard,
  moradores: Moradores,
  cobrancas: Cobrancas,
  avisos: Avisos,
  documentos: Documentos,
  solicitacoes: Solicitacoes,
  contador: Contador,
}

export default function AdminLayout() {
  const { condominiumId, resolvedRole } = useAuth()
  const [page, setPage] = useState('dashboard')
  const [pendentes, setPendentes] = useState(0)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [mountedPages, setMountedPages] = useState(['dashboard'])
  const mainContentRef = useRef(null)
  const scrollPositionsRef = useRef({})

  const fetchPendentes = async () => {
    const query = supabase
      .from('solicitacoes_cadastro')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pendente')
    const { count } = await applyTenantFilter(query, condominiumId)

    setPendentes(count || 0)
  }

  useEffect(() => {
    void fetchPendentes()

    const channel = supabase
      .channel('sol_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'solicitacoes_cadastro' }, () => {
        void fetchPendentes()
      })
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [condominiumId])

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

  const isAccountant = normalizeRole(resolvedRole) === 'contador'

  const nav = isAccountant ? [
    {
      label: 'Principal',
      items: [
        { key: 'dashboard', label: 'Painel', icon: LayoutDashboard },
        { key: 'contador', label: 'Relatórios', icon: Calculator },
      ],
    },
  ] : [
    {
      label: 'Principal',
      items: [
        { key: 'dashboard', label: 'Painel', icon: LayoutDashboard },
        { key: 'moradores', label: 'Moradores', icon: Users },
        { key: 'cobrancas', label: 'Cobranças', icon: DollarSign },
      ],
    },
    {
      label: 'Comunicação',
      items: [
        { key: 'avisos', label: 'Avisos', icon: Bell },
        { key: 'documentos', label: 'Documentos', icon: FileText },
      ],
    },
    {
      label: 'Acesso',
      items: [
        { key: 'solicitacoes', label: pendentes > 0 ? `Solicitações (${pendentes})` : 'Solicitações', icon: ClipboardList },
      ],
    },
    {
      label: 'Financeiro',
      items: [
        { key: 'contador', label: 'Relatórios', icon: Calculator },
      ],
    },
  ]

  useEffect(() => {
    const allowedPages = new Set(nav.flatMap((section) => section.items).map((item) => item.key))
    if (!allowedPages.has(page)) {
      setPage(nav[0]?.items?.[0]?.key || 'dashboard')
    }
  }, [nav, page])

  const currentLabel = nav.flatMap((section) => section.items).find((item) => item.key === page)?.label || 'Painel'

  return (
    <div className="app-layout">
      <Sidebar items={nav} activeKey={page} onNav={handleNavigate} theme="admin" mobileOpen={mobileOpen} onClose={() => setMobileOpen(false)} />
      <main className="main-content" ref={mainContentRef}>
        <div className="mobile-topbar">
          <button className="btn btn-ghost btn-icon" onClick={() => setMobileOpen(true)}>
            <Menu size={18} />
          </button>
          <div>
            <div className="mobile-topbar-title">WebCond Admin</div>
            <div className="mobile-topbar-sub">{currentLabel}</div>
          </div>
        </div>
        <div className="page-content">
          {mountedPages.map((pageKey) => {
            const PageComponent = PAGES[pageKey] || Dashboard
            const isActive = pageKey === page

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
