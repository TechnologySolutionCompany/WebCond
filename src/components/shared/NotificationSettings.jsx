import { useEffect, useState } from 'react'
import { BellRing } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import { useToast } from './Toast'
import { disablePush, enablePush, getCurrentSubscription, getPushSupport, PUSH_REASON_TEXT } from '../../lib/pushNotifications'
import { isRealEmail, planNotificationChannels } from '../../lib/notifications'

function Switch({ checked, disabled, onChange, label }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className={`switch ${checked ? 'switch-on' : ''}`}
      disabled={disabled}
      onClick={() => onChange(!checked)}
    >
      <span />
    </button>
  )
}

// Notificacoes da propria pessoa. Morador: aparelho + e-mail + WhatsApp (conforme o plano).
// Equipe da plataforma e sindico: so o aparelho (withChannels = false).
export default function NotificationSettings({ withChannels = false, description, embedded = false }) {
  const { profile, refreshProfile } = useAuth()
  const { toast } = useToast()
  const [support, setSupport] = useState(() => getPushSupport())
  const [pushOn, setPushOn] = useState(false)
  const [busy, setBusy] = useState('')

  useEffect(() => {
    void getCurrentSubscription().then((subscription) => setPushOn(Boolean(subscription))).catch(() => setPushOn(false))
  }, [])

  const togglePush = async (next) => {
    setBusy('push')
    try {
      if (next) {
        await enablePush()
        toast('Pronto: este aparelho vai receber as notificacoes.', 'success')
      } else {
        await disablePush()
        toast('Notificacoes desligadas neste aparelho.', 'info')
      }
      setPushOn(next)
    } catch (error) {
      toast(error.message || 'Nao foi possivel alterar as notificacoes.', 'error')
    } finally {
      setSupport(getPushSupport())
      setBusy('')
    }
  }

  const togglePreference = async (column, next) => {
    setBusy(column)
    const { error } = await supabase.from('profiles').update({ [column]: next }).eq('id', profile.id)
    setBusy('')
    if (error) {
      toast('Nao foi possivel salvar a preferencia.', 'error')
      return
    }
    await refreshProfile()
  }

  const channels = planNotificationChannels(profile?.condominium_plan_name)
  const hasEmail = isRealEmail(profile?.email)
  const hasWhatsapp = String(profile?.whatsapp || '').replace(/\D/g, '').length >= 10

  const rows = (
    <div className="notify-rows">
      <div className="notify-row">
        <div>
          <strong>Neste aparelho</strong>
          <span>{support.supported ? 'Celular ou computador, mesmo com o WebCond fechado.' : PUSH_REASON_TEXT[support.reason]}</span>
        </div>
        <Switch label="Notificacoes neste aparelho" checked={pushOn} disabled={busy === 'push' || (!support.supported && !pushOn)} onChange={(next) => void togglePush(next)} />
      </div>

      {withChannels && channels.includes('email') && (
        <div className="notify-row">
          <div>
            <strong>E-mail</strong>
            <span>{hasEmail ? 'No e-mail cadastrado no seu perfil.' : 'Nenhum e-mail cadastrado. Peca ao sindico para incluir o seu.'}</span>
          </div>
          <Switch label="Notificacoes por e-mail" checked={hasEmail && profile?.notificar_email !== false} disabled={!hasEmail || busy === 'notificar_email'} onChange={(next) => void togglePreference('notificar_email', next)} />
        </div>
      )}

      {withChannels && channels.includes('whatsapp') && (
        <div className="notify-row">
          <div>
            <strong>WhatsApp</strong>
            <span>{hasWhatsapp ? 'Mensagem oficial do WebCond no seu WhatsApp. So com a sua autorizacao.' : 'Nenhum WhatsApp cadastrado. Peca ao sindico para incluir o seu.'}</span>
          </div>
          <Switch label="Notificacoes por WhatsApp" checked={hasWhatsapp && profile?.notificar_whatsapp === true} disabled={!hasWhatsapp || busy === 'notificar_whatsapp'} onChange={(next) => void togglePreference('notificar_whatsapp', next)} />
        </div>
      )}
    </div>
  )

  if (embedded) return rows

  return (
    <div className="card">
      <div className="profile-card-title"><BellRing size={16} /> Notificacoes</div>
      <p className="profile-card-sub">{description || 'Receba avisos e cobrancas do condominio assim que forem publicados.'}</p>
      {rows}
    </div>
  )
}
