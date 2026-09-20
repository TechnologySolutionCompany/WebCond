import { useAuth } from '../../hooks/useAuth'
import { useCondominiumSettings } from '../../hooks/useCondominiumSettings'
import { useTheme } from '../../hooks/useTheme'
import { Building2, Lock, LogOut, Moon, Sun, X } from 'lucide-react'
import { getUserRoleLabel } from '../../lib/auth'
import { getPlan } from '../../lib/condominiumPlan'
import { describeResidentAccess } from '../../lib/units'

export default function Sidebar({
  items,
  activeKey,
  onNav,
  theme = 'admin',
  mobileOpen = false,
  onClose = () => {},
}) {
  const { profile, signOut } = useAuth()
  const { settings: condominiumSettings } = useCondominiumSettings(profile?.condominium_id || profile?.condominio_id || null)
  const { themeMode, setTheme } = useTheme()

  const initials = profile?.nome
    ? profile.nome.split(' ').map((name) => name[0]).slice(0, 2).join('').toUpperCase()
    : '?'

  const planInfo = getPlanInfo(profile)

  const accentMap = {
    admin: { color: '#3fb950', dim: '#1a3a24', label: 'Administrador' },
    morador: { color: '#58a6ff', dim: '#1a2a3a', label: 'Morador' },
    platform: { color: '#e3b341', dim: '#3a2d10', label: 'Plataforma' },
  }

  const resolvedAccent = accentMap[theme] || accentMap.admin
  const accentColor = resolvedAccent.color
  const accentDim = resolvedAccent.dim
  const productTitle = theme === 'platform' ? 'WebCond' : condominiumSettings.name
  const productSubtitle = theme === 'platform' ? 'Technology Solution Company BR' : 'Painel do condominio'

  const handleNavigate = (key) => {
    onNav(key)
    onClose()
  }

  return (
    <>
      <div className={`sidebar-backdrop ${mobileOpen ? 'show' : ''}`} onClick={onClose} />
      <aside className={`sidebar theme-${theme} ${mobileOpen ? 'sidebar-open' : ''}`}>
        <div className="sidebar-logo">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Building2 size={20} color={accentColor} />
              <div>
                <div className="sidebar-logo-title">{productTitle}</div>
                <div className="sidebar-logo-sub">{productSubtitle}</div>
              </div>
            </div>
            <button type="button" className="sidebar-close" onClick={onClose}>
              <X size={18} />
            </button>
          </div>
          <div style={{ marginTop: 10, padding: '4px 8px', borderRadius: 6, background: accentDim, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: accentColor, letterSpacing: '.06em', textTransform: 'uppercase' }}>
              {resolvedAccent.label}
            </span>
          </div>
        </div>

        <nav className="sidebar-nav">
          {items.map((section, sectionIndex) => (
            <div key={sectionIndex} style={{ marginBottom: 16 }}>
              {section.label && <div className="sidebar-section">{section.label}</div>}
              {section.items.map((item) => (
                <button
                  key={item.key}
                  className={`nav-item ${activeKey === item.key ? 'active' : ''}`}
                  onClick={() => handleNavigate(item.key)}
                  style={{ position: 'relative' }}
                >
                  <item.icon size={16} />
                  {item.label}
                  {item.locked && <Lock size={12} style={{ marginLeft: 'auto', opacity: 0.6 }} aria-label="Bloqueado: atualize o plano" />}
                  {item.badge > 0 && (
                    <span style={{ marginLeft: 'auto', background: '#f0883e', color: '#000', borderRadius: 20, padding: '1px 7px', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>
                      {item.badge}
                    </span>
                  )}
                </button>
              ))}
            </div>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="theme-toggle" role="group" aria-label="Tema da interface">
            <button
              type="button"
              className={`theme-toggle-btn ${themeMode === 'dark' ? 'active' : ''}`}
              onClick={() => setTheme('dark')}
            >
              <Moon size={14} />
              Escuro
            </button>
            <button
              type="button"
              className={`theme-toggle-btn ${themeMode === 'light' ? 'active' : ''}`}
              onClick={() => setTheme('light')}
            >
              <Sun size={14} />
              Claro
            </button>
          </div>

          <div className="user-info">
            <div className="user-avatar" style={{ background: accentDim, borderColor: accentColor, color: accentColor }}>
              {initials}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              {theme === 'admin' ? (
                <>
                  <div className="user-role">{getUserRoleLabel(profile?.role, profile?.apartamento)}</div>
                  <div className="user-name">{profile?.nome || 'Usuario'}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4, fontWeight: 500 }}>
                    Plano: <span style={{ color: planInfo.warn ? 'var(--orange)' : 'var(--text)', fontWeight: 600 }}>{planInfo.label}</span>
                  </div>
                </>
              ) : (
                <>
                  <div className="user-name">{profile?.nome || 'Usuario'}</div>
                  <div className="user-role">
                    {theme === 'morador'
                      ? `${describeResidentAccess(profile).label} · ${describeResidentAccess(profile).unitsLabel}`
                      : getUserRoleLabel(profile?.role, profile?.apartamento)}
                  </div>
                </>
              )}
            </div>
          </div>
          <button
            className="nav-item"
            onClick={async () => {
              onClose()
              await signOut()
            }}
            style={{ color: '#f85149', marginTop: 4 }}
          >
            <LogOut size={16} /> Sair
          </button>
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
