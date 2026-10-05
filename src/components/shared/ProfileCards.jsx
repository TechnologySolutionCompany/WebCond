import { ChevronRight, Moon, Sun } from 'lucide-react'
import { useTheme } from '../../hooks/useTheme'
import { initialsOf } from './AppChrome'
import { APP_VERSION } from '../../lib/appVersion'
import { InstallAppButton } from './InstallApp'

// Pecas do "Meu perfil" no formato do prototipo (redesign v2.10A3), usadas pelo morador e pelo sindico.
export function ProfileHeader({ nome, subtitle }) {
  return (
    <div className="pf-head">
      <div className="pf-avatar">{initialsOf(nome)}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <h1 className="screen-title" style={{ fontSize: 'clamp(24px, 1.2vw + 18px, 30px)', overflowWrap: 'anywhere' }}>{nome}</h1>
        <div className="screen-sub" style={{ marginTop: 0 }}>{subtitle}</div>
      </div>
    </div>
  )
}

export function ProfileCard({ title, action, sub, children, flush = false }) {
  return (
    <div className={`pf-card${flush ? ' pf-card-flush' : ''}`}>
      {(title || action) && (
        <div className="pf-card-head">
          <span className="pf-card-title">{title}</span>
          {action}
        </div>
      )}
      {sub && <div className="pf-card-sub">{sub}</div>}
      {children}
    </div>
  )
}

export function ProfileRow({ icon: Icon, label, value, extra }) {
  return (
    <div className="pf-row">
      {Icon && <span className="pf-row-icon"><Icon size={18} /></span>}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="pf-row-label">{label}</div>
        <div className="pf-row-value">{value}</div>
      </div>
      {extra}
    </div>
  )
}

export function ThemeCard() {
  const { themeMode, setTheme } = useTheme()
  return (
    <ProfileCard title="Aparência">
      <div className="seg pf-theme" role="radiogroup" aria-label="Tema">
        <button type="button" role="radio" aria-checked={themeMode === 'light'} className={themeMode === 'light' ? 'active' : ''} onClick={() => setTheme('light')}><Sun size={17} />Claro</button>
        <button type="button" role="radio" aria-checked={themeMode === 'dark'} className={themeMode === 'dark' ? 'active' : ''} onClick={() => setTheme('dark')}><Moon size={17} />Escuro</button>
      </div>
    </ProfileCard>
  )
}

// Lista de atalhos da conta (Trocar senha, Suporte, Privacidade, Sair) + versao do app.
export function AccountLinks({ items }) {
  return (
    <div className="pf-card pf-card-links">
      {items.filter(Boolean).map((item) => {
        const Icon = item.icon
        const content = (
          <>
            <Icon size={18} />
            <span style={{ flex: 1 }}>{item.label}</span>
            <ChevronRight size={16} color="var(--text-dim)" />
          </>
        )
        return item.href ? (
          <a key={item.label} className={`pf-link${item.danger ? ' pf-link-danger' : ''}`} href={item.href} target="_blank" rel="noopener noreferrer">{content}</a>
        ) : (
          <button key={item.label} type="button" className={`pf-link${item.danger ? ' pf-link-danger' : ''}`} onClick={item.onClick}>{content}</button>
        )
      })}
      <InstallAppButton className="pf-link" label="Adicionar o app à tela inicial" />
      <div className="pf-version">WebCond · versão {APP_VERSION}</div>
    </div>
  )
}
