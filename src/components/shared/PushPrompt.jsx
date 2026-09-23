import { useEffect, useState } from 'react'
import { BellRing, X } from 'lucide-react'
import { useToast } from './Toast'
import { enablePush, getCurrentSubscription, getPushSupport, PUSH_REASON_TEXT } from '../../lib/pushNotifications'

const DISMISS_KEY = 'webcond:push-convite-dispensado'

function wasDismissed() {
  try {
    return window.localStorage.getItem(DISMISS_KEY) === '1'
  } catch {
    return false
  }
}

// Convite discreto no Inicio do morador para ligar as notificacoes neste aparelho.
// Some depois de ativar ou de tocar em "Agora nao" (a opcao continua em Meu perfil).
export default function PushPrompt() {
  const { toast } = useToast()
  const [visible, setVisible] = useState(false)
  const [busy, setBusy] = useState(false)
  const support = getPushSupport()

  useEffect(() => {
    if (wasDismissed() || (!support.supported && support.reason !== 'ios-install')) return
    void getCurrentSubscription().then((subscription) => setVisible(!subscription)).catch(() => {})
  }, [support.supported, support.reason])

  const dismiss = () => {
    try {
      window.localStorage.setItem(DISMISS_KEY, '1')
    } catch {
      // sem armazenamento: o convite volta na proxima visita
    }
    setVisible(false)
  }

  const activate = async () => {
    setBusy(true)
    try {
      await enablePush()
      toast('Pronto: avisos e cobrancas vao chegar neste aparelho.', 'success')
      setVisible(false)
    } catch (error) {
      toast(error.message || 'Nao foi possivel ativar.', 'error')
    } finally {
      setBusy(false)
    }
  }

  if (!visible) return null

  return (
    <div className="push-prompt" role="status">
      <BellRing size={16} />
      <div className="push-prompt-text">
        <strong>Receba avisos e cobrancas no {support.reason === 'ios-install' ? 'iPhone' : 'aparelho'}</strong>
        <span>{support.supported ? 'Chega na hora, mesmo com o WebCond fechado.' : PUSH_REASON_TEXT['ios-install']}</span>
      </div>
      {support.supported && (
        <button type="button" className="btn btn-primary btn-sm" onClick={() => void activate()} disabled={busy}>
          {busy ? 'Ativando...' : 'Ativar'}
        </button>
      )}
      <button type="button" className="btn btn-ghost btn-sm btn-icon" onClick={dismiss} aria-label="Agora nao"><X size={14} /></button>
    </div>
  )
}
