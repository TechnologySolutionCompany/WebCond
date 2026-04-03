import { useAuth } from '../../hooks/useAuth'
import { Building2, LogOut } from 'lucide-react'

export default function Sidebar({ items, activeKey, onNav, theme = 'admin' }) {
  const { profile, signOut } = useAuth()

  const initials = profile?.nome
    ? profile.nome.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()
    : '?'

  const accentColor = theme === 'admin' ? '#3fb950' : '#58a6ff'
  const accentDim = theme === 'admin' ? '#1a3a24' : '#1a2a3a'

  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Building2 size={20} color={accentColor} />
          <div>
            <div className="sidebar-logo-title">WebCond</div>
            <div className="sidebar-logo-sub">Eco Living III</div>
          </div>
        </div>
        <div style={{ marginTop: 10, padding: '4px 8px', borderRadius: 6, background: accentDim, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: accentColor, letterSpacing: '.06em', textTransform: 'uppercase' }}>
            {theme === 'admin' ? '⚡ Administrador' : '🏠 Morador'}
          </span>
        </div>
      </div>

      <nav className="sidebar-nav">
        {items.map((section, si) => (
          <div key={si} style={{ marginBottom: 16 }}>
            {section.label && <div className="sidebar-section">{section.label}</div>}
            {section.items.map(item => (
              <button
                key={item.key}
                className={`nav-item ${activeKey === item.key ? 'active' : ''}`}
                onClick={() => onNav(item.key)}
                style={{ position: 'relative' }}
              >
                <item.icon size={16} />
                {item.label}
                {item.badge > 0 && (
                  <span style={{
                    marginLeft: 'auto', background: '#f0883e', color: '#000',
                    borderRadius: 20, padding: '1px 7px', fontSize: 11, fontWeight: 700, flexShrink: 0
                  }}>
                    {item.badge}
                  </span>
                )}
              </button>
            ))}
          </div>
        ))}
      </nav>

      <div className="sidebar-footer">
        <div className="user-info">
          <div className="user-avatar" style={{ background: accentDim, borderColor: accentColor, color: accentColor }}>
            {initials}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="user-name">{profile?.nome || 'Usuário'}</div>
            <div className="user-role">
              {profile?.role === 'admin' ? 'Síndico' : `Apt. ${profile?.apartamento || '--'}`}
            </div>
          </div>
        </div>
        <button className="nav-item" onClick={signOut} style={{ color: '#f85149', marginTop: 4 }}>
          <LogOut size={16} /> Sair
        </button>
      </div>
    </aside>
  )
}
