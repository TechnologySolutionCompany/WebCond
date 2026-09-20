import { AlertTriangle } from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'

// Aviso ao morador quando o teste/plano do condominio venceu (o acesso do morador continua liberado).
export default function PlanAttentionBanner({ audience = 'admin' }) {
  const { profile } = useAuth()
  if (!profile?.condominium_plan_attention) return null

  return (
    <div className="plan-attention-banner" role="alert">
      <AlertTriangle size={20} color="var(--orange)" style={{ flexShrink: 0, marginTop: 2 }} />
      <div>
        <strong>Seu plano precisa de atencao</strong>
        {audience === 'admin'
          ? 'O plano do condominio venceu. Entre em contato com a WebCond para renovar e manter tudo funcionando.'
          : 'O plano do condominio venceu. Avise o sindico para regularizar junto a WebCond.'}
      </div>
    </div>
  )
}
