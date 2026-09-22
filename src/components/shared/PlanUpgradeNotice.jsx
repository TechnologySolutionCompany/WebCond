import { useState } from 'react'
import { AlertTriangle, Clock, ExternalLink, Lock, X } from 'lucide-react'

// Link de pagamento/renovacao (definido depois em VITE_PLAN_UPGRADE_URL). Sem link, o botao nao aparece.
const PLAN_UPGRADE_URL = String(import.meta.env.VITE_PLAN_UPGRADE_URL || '').trim()
const WARNING_DISMISS_KEY = 'webcond:plan-warning-dismissed'

function todayKey() {
  return new Date().toISOString().slice(0, 10)
}

function readDismissed() {
  try {
    return window.localStorage.getItem(WARNING_DISMISS_KEY) === todayKey()
  } catch {
    return false
  }
}

export function UpgradeButton({ small = false }) {
  if (!PLAN_UPGRADE_URL) {
    return <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Link de pagamento em breve. Fale com a WebCond para renovar.</span>
  }
  return (
    <a className={`btn btn-primary ${small ? 'btn-sm' : ''}`} href={PLAN_UPGRADE_URL} target="_blank" rel="noopener noreferrer">
      <ExternalLink size={small ? 12 : 14} /> Atualizar plano
    </a>
  )
}

// Plano vencido: popup "Atualize seu plano" + faixa fixa de somente visualizacao.
// Faltando poucos dias: aviso pequeno no canto, que pode ser fechado (volta no dia seguinte).
export default function PlanUpgradeNotice({ profile, open, onOpen, onClose, isAccountant = false }) {
  const [warningDismissed, setWarningDismissed] = useState(readDismissed)
  const isTrial = profile?.condominium_subscription_status !== 'active'
  const days = profile?.condominium_plan_days_left

  if (profile?.condominium_plan_locked) {
    const title = isTrial ? 'Seu periodo de teste terminou' : `Seu plano ${profile.condominium_plan_name} venceu`

    return (
      <>
        <div className="plan-locked-bar" role="status">
          <Lock size={14} />
          <span>Painel somente para visualizacao.</span>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onOpen}>Atualize seu plano</button>
        </div>

        {open && (
          <div className="modal-overlay" onClick={(event) => event.target === event.currentTarget && onClose()}>
            <div className="modal" style={{ maxWidth: 440 }} role="dialog" aria-modal="true" aria-labelledby="plan-upgrade-title">
              <div className="modal-header">
                <div className="modal-title" id="plan-upgrade-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <AlertTriangle size={18} color="var(--orange)" /> Atualize seu plano
                </div>
                <button className="btn btn-ghost btn-icon" onClick={onClose} aria-label="Fechar"><X size={16} /></button>
              </div>
              <div style={{ display: 'grid', gap: 12, fontSize: 14 }}>
                <strong>{title}.</strong>
                <span style={{ color: 'var(--text-muted)' }}>
                  O painel continua aberto so para visualizacao: lancamentos, cadastros de unidades e exportacoes ficam bloqueados ate a renovacao.
                  {isAccountant && ' Avise o sindico para regularizar o plano.'}
                </span>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                  {!isAccountant && <UpgradeButton />}
                  <button className="btn btn-ghost" onClick={onClose}>Continuar visualizando</button>
                </div>
              </div>
            </div>
          </div>
        )}
      </>
    )
  }

  if (profile?.condominium_plan_expiring_soon && !warningDismissed) {
    const dismiss = () => {
      setWarningDismissed(true)
      try {
        window.localStorage.setItem(WARNING_DISMISS_KEY, todayKey())
      } catch {
        // Sem armazenamento local, o aviso so volta ao recarregar.
      }
    }

    return (
      <div className="plan-warning-toast" role="status">
        <Clock size={16} color="var(--orange)" style={{ flexShrink: 0, marginTop: 2 }} />
        <div style={{ display: 'grid', gap: 8 }}>
          <div>
            <strong>Atualize seu plano</strong>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              {isTrial ? 'O teste' : `O plano ${profile.condominium_plan_name}`} vence em {days} {days === 1 ? 'dia' : 'dias'}.
            </div>
          </div>
          {!isAccountant && <UpgradeButton small />}
        </div>
        <button className="btn btn-ghost btn-icon" onClick={dismiss} aria-label="Fechar aviso" style={{ marginLeft: 'auto' }}><X size={14} /></button>
      </div>
    )
  }

  return null
}
