import { useEffect, useMemo, useRef, useState } from 'react'
import { LayoutDashboard, Building2, Receipt, Megaphone, FileText, Calculator, UserCog, LifeBuoy, Plus } from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import { useCondominiumSettings } from '../../hooks/useCondominiumSettings'
import { normalizeRole } from '../../lib/auth'
import Sidebar from '../shared/Sidebar'
import { AppTopbar, BottomNav, initialsOf } from '../shared/AppChrome'
import { useSidebarMenu } from '../../hooks/useSidebarMenu'
import { useDeepLinkPage } from '../../hooks/useDeepLinkPage'
import { initialPage, saveLastView } from '../../lib/lastView'
import PlanUpgradeNotice from '../shared/PlanUpgradeNotice'
import EmailObrigatorio from '../shared/EmailObrigatorio'
import Dashboard from './Dashboard'
import Unidades from './Unidades'
import Cobrancas from './Cobrancas'
import Avisos from './Avisos'
import Documentos from './Documentos'
import Contador from './Contador'
import Perfil from './Perfil'
import Suporte from './Suporte'
import SuporteHub from '../shared/SuporteHub'
import { sendAdminFeedback } from '../../lib/adminApi'
import Planos from './Planos'

// Suporte (v1.09A5): Chamados + Feedback + Sobre.
function AdminSuporte(props) {
  return <SuporteHub chamados={Suporte} sendFeedback={sendAdminFeedback} {...props} />
}

const PAGES = {
  dashboard: Dashboard,
  unidades: Unidades,
  cobrancas: Cobrancas,
  avisos: Avisos,
  documentos: Documentos,
  contador: Contador,
  perfil: Perfil,
  suporte: AdminSuporte,
  planos: Planos,
}

// Abrem mesmo com o plano vencido: painel (so leitura), perfil, suporte e a tela de planos.
const ALWAYS_OPEN = new Set(['dashboard', 'perfil', 'suporte', 'planos'])
const ACCOUNT_SECTION = {
  label: 'Conta',
  items: [
    { key: 'perfil', label: 'Meu perfil', icon: UserCog },
    { key: 'suporte', label: 'Suporte', icon: LifeBuoy },
  ],
}
// Aberta pelo botao "Melhorar meu plano", dentro do perfil: nao ocupa espaco no menu.
const HIDDEN_PAGES = new Set(['planos'])
const HIDDEN_PAGE_LABELS = { planos: 'Planos e valores' }

export default function AdminLayout() {
  const { condominiumId, resolvedRole, profile } = useAuth()
  // Teste/plano vencido: so o Painel abre (somente visualizacao); o resto do menu fica com cadeado.
  const planLocked = Boolean(profile?.condominium_plan_locked)
  const [upgradeOpen, setUpgradeOpen] = useState(planLocked)
  const { settings: condominiumSettings } = useCondominiumSettings(condominiumId)
  // Reabre na ultima tela aberta (v1.09A5): voltar do boleto no navegador nao leva mais ao Painel.
  const [page, setPage] = useState(() => initialPage('admin', profile?.id, Object.keys(PAGES), 'dashboard'))
  const { mobileOpen, toggleMenu, closeMobile, layoutClassName } = useSidebarMenu()
  const [mountedPages, setMountedPages] = useState(() => [page])
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

  useEffect(() => { saveLastView('admin', profile?.id, page) }, [page, profile?.id])
  useDeepLinkPage(Object.keys(PAGES), handleNavigate)

  const isAccountant = normalizeRole(resolvedRole) === 'contador'

  const baseNav = useMemo(() => (isAccountant ? [
    {
      label: 'Principal',
      items: [
        { key: 'dashboard', label: 'Painel', icon: LayoutDashboard },
        { key: 'contador', label: 'Relatórios', icon: Calculator },
      ],
    },
    ACCOUNT_SECTION,
  ] : [
    {
      label: 'Principal',
      items: [
        { key: 'dashboard', label: 'Painel', icon: LayoutDashboard },
        { key: 'unidades', label: 'Unidades', icon: Building2 },
        { key: 'cobrancas', label: 'Cobranças', icon: Receipt },
      ],
    },
    {
      label: 'Comunicação',
      items: [
        { key: 'avisos', label: 'Avisos', icon: Megaphone },
        { key: 'documentos', label: 'Documentos', icon: FileText },
      ],
    },
    {
      label: 'Financeiro',
      items: [
        { key: 'contador', label: 'Relatórios', icon: Calculator },
      ],
    },
    ACCOUNT_SECTION,
  ]), [isAccountant])

  const nav = useMemo(() => (planLocked
    ? baseNav.map((section) => ({ ...section, items: section.items.map((item) => ({ ...item, locked: !ALWAYS_OPEN.has(item.key) })) }))
    : baseNav), [baseNav, planLocked])

  useEffect(() => {
    const allowedPages = new Set([...HIDDEN_PAGES, ...nav.flatMap((section) => section.items).filter((item) => !item.locked).map((item) => item.key)])
    if (!allowedPages.has(page)) {
      setPage('dashboard')
      setMountedPages(['dashboard'])
    }
  }, [nav, page])

  const currentLabel = nav.flatMap((section) => section.items).find((item) => item.key === page)?.label || HIDDEN_PAGE_LABELS[page] || 'Painel'

  // Barra inferior do celular (redesign v2.10A3). Sindico: Painel, Unidades, [Nova cobranca],
  // Cobrancas, Mais. Contador (so leitura): Painel e Relatorios, sem botao central.
  const novaCobranca = isAccountant ? null : { label: 'Nova cobrança', icon: Plus, onClick: () => handleNavigate('cobrancas') }
  const tabs = isAccountant
    ? [{ key: 'dashboard', label: 'Painel', icon: LayoutDashboard }, { key: 'contador', label: 'Relatórios', icon: Calculator }]
    : [{ key: 'dashboard', label: 'Painel', icon: LayoutDashboard }, { key: 'unidades', label: 'Unidades', icon: Building2 }, { key: 'cobrancas', label: 'Cobranças', icon: Receipt }]

  return (
    <div className={`app-layout ${layoutClassName}`}>
      <EmailObrigatorio />
      <Sidebar items={nav} activeKey={page} onNav={handleNavigate} theme="admin" cta={novaCobranca} mobileOpen={mobileOpen} onClose={closeMobile} />
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
                <PageComponent isActive={isActive} onNavigate={handleNavigate} />
              </div>
            )
          })}
        </div>
      </main>
      <BottomNav tabs={tabs} activeKey={page} onNav={handleNavigate} fab={novaCobranca} onMore={toggleMenu} moreActive={mobileOpen} />
    </div>
  )
}
