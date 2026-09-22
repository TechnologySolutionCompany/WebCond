import { useEffect, useMemo, useRef, useState } from 'react'
import { LayoutDashboard, Home, DollarSign, Bell, FileText, Calculator, Menu, UserCog } from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import { useCondominiumSettings } from '../../hooks/useCondominiumSettings'
import { normalizeRole } from '../../lib/auth'
import Sidebar from '../shared/Sidebar'
import { useSidebarMenu } from '../../hooks/useSidebarMenu'
import PlanUpgradeNotice from '../shared/PlanUpgradeNotice'
import Dashboard from './Dashboard'
import Unidades from './Unidades'
import Cobrancas from './Cobrancas'
import Avisos from './Avisos'
import Documentos from './Documentos'
import Contador from './Contador'
import Perfil from './Perfil'

const PAGES = {
  dashboard: Dashboard,
  unidades: Unidades,
  cobrancas: Cobrancas,
  avisos: Avisos,
  documentos: Documentos,
  contador: Contador,
  perfil: Perfil,
}

// Abrem mesmo com o plano vencido: painel (so leitura) e o proprio perfil (senha, suporte, plano).
const ALWAYS_OPEN = new Set(['dashboard', 'perfil'])
const ACCOUNT_SECTION = { label: 'Conta', items: [{ key: 'perfil', label: 'Meu perfil', icon: UserCog }] }

export default function AdminLayout() {
  const { condominiumId, resolvedRole, profile } = useAuth()
  // Teste/plano vencido: so o Painel abre (somente visualizacao); o resto do menu fica com cadeado.
  const planLocked = Boolean(profile?.condominium_plan_locked)
  const [upgradeOpen, setUpgradeOpen] = useState(planLocked)
  const { settings: condominiumSettings } = useCondominiumSettings(condominiumId)
  const [page, setPage] = useState('dashboard')
  const { mobileOpen, toggleMenu, closeMobile, layoutClassName } = useSidebarMenu()
  const [mountedPages, setMountedPages] = useState(['dashboard'])
  const mainContentRef = useRef(null)
  const scrollPositionsRef = useRef({})

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
    if (planLocked && !ALWAYS_OPEN.has(nextPage)) {
      setUpgradeOpen(true)
      return
    }
    if (nextPage === page) return

    if (mainContentRef.current) {
      scrollPositionsRef.current[page] = mainContentRef.current.scrollTop
    }

    setMountedPages((current) => (current.includes(nextPage) ? current : [...current, nextPage]))
    setPage(nextPage)
  }

  const isAccountant = normalizeRole(resolvedRole) === 'contador'

  const baseNav = useMemo(() => (isAccountant ? [
    {
      label: 'Principal',
      items: [
        { key: 'dashboard', label: 'Painel', icon: LayoutDashboard },
        { key: 'contador', label: 'Relatorios', icon: Calculator },
      ],
    },
    ACCOUNT_SECTION,
  ] : [
    {
      label: 'Principal',
      items: [
        { key: 'dashboard', label: 'Painel', icon: LayoutDashboard },
        { key: 'unidades', label: 'Unidades', icon: Home },
        { key: 'cobrancas', label: 'Cobrancas', icon: DollarSign },
      ],
    },
    {
      label: 'Comunicacao',
      items: [
        { key: 'avisos', label: 'Avisos', icon: Bell },
        { key: 'documentos', label: 'Documentos', icon: FileText },
      ],
    },
    {
      label: 'Financeiro',
      items: [
        { key: 'contador', label: 'Relatorios', icon: Calculator },
      ],
    },
    ACCOUNT_SECTION,
  ]), [isAccountant])

  const nav = useMemo(() => (planLocked
    ? baseNav.map((section) => ({ ...section, items: section.items.map((item) => ({ ...item, locked: !ALWAYS_OPEN.has(item.key) })) }))
    : baseNav), [baseNav, planLocked])

  useEffect(() => {
    const allowedPages = new Set(nav.flatMap((section) => section.items).filter((item) => !item.locked).map((item) => item.key))
    if (!allowedPages.has(page)) {
      setPage('dashboard')
      setMountedPages(['dashboard'])
    }
  }, [nav, page])

  const currentLabel = nav.flatMap((section) => section.items).find((item) => item.key === page)?.label || 'Painel'

  return (
    <div className={`app-layout ${layoutClassName}`}>
      <Sidebar items={nav} activeKey={page} onNav={handleNavigate} theme="admin" mobileOpen={mobileOpen} onClose={closeMobile} />
      <main className="main-content" ref={mainContentRef}>
        <div className="mobile-topbar">
          <button className="btn btn-ghost btn-icon" onClick={toggleMenu} aria-label="Abrir ou recolher o menu" aria-expanded={mobileOpen || !layoutClassName}>
            <Menu size={18} />
          </button>
          <div>
            <div className="mobile-topbar-title">{condominiumSettings.name}</div>
            <div className="mobile-topbar-sub">{currentLabel}</div>
          </div>
        </div>
        <div className="page-content">
          <PlanUpgradeNotice
            profile={profile}
            open={upgradeOpen}
            onOpen={() => setUpgradeOpen(true)}
            onClose={() => setUpgradeOpen(false)}
            isAccountant={isAccountant}
          />
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
