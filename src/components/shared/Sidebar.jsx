import { useAuth } from '../../hooks/useAuth'
import { useCondominiumSettings } from '../../hooks/useCondominiumSettings'
import { useTheme } from '../../hooks/useTheme'
import { Lock, LogOut, Moon, Sun, X } from 'lucide-react'
import { getUserRoleLabel } from '../../lib/auth'
import { getPlan } from '../../lib/condominiumPlan'
import { describeResidentAccess } from '../../lib/units'
import { APP_VERSION } from '../../lib/appVersion'
import { BrandTile, initialsOf } from './AppChrome'

// Menu lateral (redesign v2.10A3): marca, botao principal, secoes e o rodape com a pessoa,
// o tema e o "Sair". No celular vira a gaveta aberta pelo "Mais" da barra inferior.
export default function Sidebar({
  items,
  activeKey,
  onNav,
  theme = 'admin',
  cta = null,
  mobileOpen = false,
  onClose = () => {},
}) {
  const { profile, signOut } = useAuth()
  const { settings: condominiumSettings } = useCondominiumSettings(profile?.condominium_id || profile?.condominio_id || null)
  const { themeMode, setTheme } = useTheme()

  const isPlatform = theme === 'platform'
  const productTitle = isPlatform ? 'WebCond' : condominiumSettings.name
  const productSubtitle = isPlatform ? 'Painel da plataforma' : 'WebCond'
  const planInfo = getPlanInfo(profile)
  const roleLabel = theme === 'morador'
    ? `${describeResidentAccess(profile).label} · ${describeResidentAccess(profile).unitsLabel}`
    : getUserRoleLabel(profile?.role, profile?.apartamento)

  const handleNavigate = (key) => {
    onNav(key)
    onClose()
  }

  const CtaIcon = cta?.icon

  return (
    <>
      <div className={`sidebar-backdrop ${mobileOpen ? 'show' : ''}`} onClick={onClose} />
      <aside className={`sidebar theme-${theme} ${mobileOpen ? 'sidebar-open' : ''}`}>
        <div className="sidebar-brand">
          <BrandTile logoPath={isPlatform ? '' : condominiumSettings.logoPath} />
          <div style={{ minWidth: 0, flex: 1 }}>
            <div className="sidebar-brand-title">{productTitle}</div>
            <div className="sidebar-brand-sub">{productSubtitle}</div>
          </div>
          <button type="button" className="sidebar-close" onClick={onClose} aria-label="Fechar menu">
            <X size={18} />
          </button>
        </div>

        {cta && (
          <div className="sidebar-cta-wrap">
            <button type="button" className="sidebar-cta" onClick={() => { cta.onClick(); onClose() }}>
              <CtaIcon size={18} />
              {cta.label}
            </button>
          </div>
        )}

        <nav className="sidebar-nav">
          {items.map((section, sectionIndex) => (
            <div key={sectionIndex} className="sidebar-group">
              {section.label && <div className="sidebar-section">{section.label}</div>}
              {section.items.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  className={`nav-item ${activeKey === item.key ? 'active' : ''}`}
                  onClick={() => handleNavigate(item.key)}
                  aria-current={activeKey === item.key ? 'page' : undefined}
                >
                  <item.icon size={18} />
                  <span className="nav-item-label">{item.label}</span>
                  {item.locked && <Lock size={13} style={{ opacity: 0.6 }} aria-label="Bloqueado: atualize o plano" />}
                  {item.badge > 0 && <span className="nav-badge">{item.badge}</span>}
                </button>
              ))}
            </div>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="sidebar-user">
            <div className="user-avatar">{initialsOf(profile?.nome)}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="user-name">{profile?.nome || 'Usuario'}</div>
              <div className="user-role">{roleLabel}</div>
              {theme === 'admin' && (
                <div className="user-plan">
                  Plano: <span style={{ color: planInfo.warn ? 'var(--orange)' : 'var(--text)', fontWeight: 600 }}>{planInfo.label}</span>
                </div>
              )}
            </div>
            <button
              type="button"
              className="sidebar-icon-btn"
              onClick={() => setTheme(themeMode === 'dark' ? 'light' : 'dark')}
              title={themeMode === 'dark' ? 'Usar tema claro' : 'Usar tema escuro'}
              aria-label={themeMode === 'dark' ? 'Usar tema claro' : 'Usar tema escuro'}
            >
              {themeMode === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
            </button>
            <button
              type="button"
              className="sidebar-icon-btn sidebar-icon-btn-danger"
              onClick={async () => {
                onClose()
                await signOut()
              }}
              title="Sair"
              aria-label="Sair"
            >
              <LogOut size={16} />
            </button>
          </div>
          <div className="sidebar-version" title="Versao do WebCond em uso neste navegador">WebCond · versao {APP_VERSION}</div>
        </div>
      </aside>
    </>
  )
}

// Plano contratado ou, no teste, os dias restantes (30 dias contados da aprovacao pelo admin).
function getPlanInfo(profile) {
  if (!profile?.condominium_plan_name) return { label: '-', warn: false }

  const isTrial = profile.condominium_subscription_status !== 'active'
  const name = isTrial ? 'Teste' : getPlan(profile.condominium_plan_name).label
  const days = profile.condominium_plan_days_left

  if (profile.condominium_plan_locked) return { label: isTrial ? 'Teste encerrado' : `${name} vencido`, warn: true }
  if (days === null || days === undefined) return { label: name, warn: false }
  if (isTrial || profile.condominium_plan_expiring_soon) {
    return { label: `${name} · ${days} ${days === 1 ? 'dia restante' : 'dias restantes'}`, warn: Boolean(profile.condominium_plan_expiring_soon) }
  }
  return { label: name, warn: false }
}
