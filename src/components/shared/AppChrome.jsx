import { ChevronRight, Ellipsis, PanelLeft } from 'lucide-react'
import { condominiumLogoUrl } from '../../lib/condominiumLogo'

// Moldura do app no redesign v2.10A3 (prototipo "WebCond App"):
// marca, cabecalho e barra inferior do celular. Os tres layouts (sindico, morador e plataforma)
// usam as mesmas pecas; cada um so diz quais abas e qual botao central quer.

// Quadrado da marca: o simbolo do WebCond sobre o azul-marinho ou, quando existir, a logo do
// condominio sobre a superficie (logo colorida nao some no fundo escuro).
export function BrandTile({ logoPath = '', size = 40 }) {
  const logo = condominiumLogoUrl(logoPath)
  return (
    <span className={`brand-tile ${logo ? 'brand-tile-logo' : ''}`} style={{ width: size, height: size }} aria-hidden="true">
      <img src={logo || '/brand/wc-simbolo.svg'} alt="" style={{ width: logo ? '82%' : '64%', height: logo ? '82%' : '64%' }} />
    </span>
  )
}

export function initialsOf(nome = '') {
  const partes = String(nome || '').trim().split(/\s+/).filter(Boolean)
  if (!partes.length) return '?'
  return (partes[0][0] + (partes.length > 1 ? partes[partes.length - 1][0] : '')).toUpperCase()
}

// Cabecalho. Computador: botao de recolher o menu + "Condominio > Pagina".
// Celular: marca + nome do condominio + pagina atual + avatar (abre o perfil).
export function AppTopbar({ title, logoPath, crumbRoot, crumbPage, onToggleMenu, menuExpanded, initials, onAvatar, actions = null }) {
  return (
    <header className="app-topbar">
      <button type="button" className="app-topbar-icon app-topbar-desktop" onClick={onToggleMenu} aria-label="Mostrar ou recolher o menu" aria-expanded={menuExpanded}>
        <PanelLeft size={18} />
      </button>
      <div className="app-topbar-crumb app-topbar-desktop">
        <span className="app-topbar-crumb-root">{crumbRoot}</span>
        <ChevronRight size={14} />
        <span className="app-topbar-crumb-page">{crumbPage}</span>
      </div>

      <div className="app-topbar-brand app-topbar-mobile">
        <BrandTile logoPath={logoPath} size={34} />
        <div style={{ minWidth: 0 }}>
          <div className="app-topbar-title">{title}</div>
          <div className="app-topbar-sub">{crumbPage}</div>
        </div>
      </div>

      {actions}
      {onAvatar && (
        <button type="button" className="app-topbar-avatar app-topbar-mobile" onClick={onAvatar} aria-label="Meu perfil">
          {initials}
        </button>
      )}
    </header>
  )
}

// Barra inferior do celular: abas, botao central (opcional) e "Mais", que abre o menu completo.
export function BottomNav({ tabs, activeKey, onNav, fab = null, onMore, moreActive = false }) {
  const renderTab = (tab) => {
    const Icon = tab.icon
    const active = tab.key === activeKey
    return (
      <button key={tab.key} type="button" className={`bottom-nav-tab ${active ? 'active' : ''}`} onClick={() => onNav(tab.key)} aria-current={active ? 'page' : undefined}>
        <span className="bottom-nav-pill">
          <Icon size={21} />
          {tab.badge > 0 && <span className="bottom-nav-dot" aria-label={`${tab.badge} pendente(s)`} />}
        </span>
        {tab.label}
      </button>
    )
  }

  const metade = fab ? Math.ceil(tabs.length / 2) : tabs.length
  const FabIcon = fab?.icon
  return (
    <nav className="bottom-nav" aria-label="Navegacao principal">
      {tabs.slice(0, metade).map(renderTab)}
      {fab && (
        <div className="bottom-nav-fab-slot">
          <button type="button" className="bottom-nav-fab" onClick={fab.onClick} aria-label={fab.label} title={fab.label}>
            <FabIcon size={24} />
          </button>
        </div>
      )}
      {tabs.slice(metade).map(renderTab)}
      <button type="button" className={`bottom-nav-tab ${moreActive ? 'active' : ''}`} onClick={onMore} aria-label="Mais opcoes">
        <span className="bottom-nav-pill"><Ellipsis size={21} /></span>
        Mais
      </button>
    </nav>
  )
}
