import { useEffect, useState } from 'react'
import { ArrowLeft, Check, Clock, CreditCard, LifeBuoy, MessageCircle } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import { getCondominiumAccessState, getPlan, PUBLIC_PLAN_LIST, TRIAL_PERIOD_DAYS } from '../../lib/condominiumPlan'
import { MSG_PLANOS, whatsappPlanoUrl, whatsappUrl } from '../../lib/contato'
import { buildCheckoutUrl } from '../../lib/assinatura'

// Tela de planos do sindico, aberta pelo botao "Melhorar meu plano" em Meu perfil.
// Nada e cobrado aqui: o sindico escolhe e fala com a TSCBr para contratar.
export default function Planos({ isActive = true, onNavigate }) {
  const { condominiumId, profile } = useAuth()
  const [condo, setCondo] = useState(null)

  useEffect(() => {
    if (!condominiumId || !isActive) return
    void (async () => {
      const { data } = await supabase
        .from('condominiums')
        .select('id, name, nome, status, metadata, created_at, updated_at')
        .eq('id', condominiumId)
        .maybeSingle()
      setCondo(data || null)
    })()
  }, [condominiumId, isActive])

  const state = condo ? getCondominiumAccessState(condo) : null
  const isTrial = state ? state.subscriptionStatus !== 'active' : true
  const currentPlan = state ? getPlan(state.planName) : null
  const currentLabel = !state ? '-' : isTrial ? 'Teste gratuito' : currentPlan.label
  const condoName = condo?.name || condo?.nome || ''

  // Enquanto nao houver provedor de pagamento configurado, contratar continua sendo falar
  // com a TSCBr. Assim que houver, o mesmo botao abre o checkout (src/lib/assinatura.js).
  const linkDoPlano = (plan) => buildCheckoutUrl({ plano: plan.id, condominiumId: condo?.id, condominiumName: condoName })
    || whatsappPlanoUrl(plan.label, condoName)
  const pagamentoNoSistema = Boolean(buildCheckoutUrl({ plano: 'ONE' }))

  return (
    <div className="fade-in planos-shell">
      <div className="page-header">
        <button className="btn btn-ghost btn-sm" onClick={() => onNavigate?.('perfil')}><ArrowLeft size={14} /> Voltar ao meu perfil</button>
        <div className="page-title" style={{ marginTop: 10 }}>Planos e valores</div>
        <div className="page-subtitle">
          Escolha com calma. Nada muda automaticamente: voce fala com a TSCBr e a gente ajusta o plano do seu condominio.
        </div>
      </div>

      <div className="plano-atual">
        <div>
          <span>Plano atual</span>
          <strong>{currentLabel}</strong>
        </div>
        <div className="plano-atual-info">
          {isTrial
            ? `Teste gratuito de ${TRIAL_PERIOD_DAYS} dias com os recursos do ONE.`
            : `${currentPlan?.priceLabel}/mes · ${currentPlan?.documentLimit} documentos por mes`}
        </div>
      </div>

      <div className="planos-cards">
        {PUBLIC_PLAN_LIST.map((plan) => {
          const atual = !isTrial && currentPlan?.id === plan.id
          return (
            <div key={plan.id} className={`plano-card ${atual ? 'plano-card-selected' : ''}`}>
              <div className="plano-card-top">
                <span className="plano-card-name">{plan.label}</span>
                <span className="badge badge-blue">{plan.nivel}</span>
                {atual && <span className="badge badge-green"><Check size={11} /> Plano atual</span>}
              </div>

              <div className="plano-card-price">{plan.priceLabel}<span className="plano-card-period">/mes</span></div>
              <p className="plano-card-summary">{plan.description || plan.summary}</p>

              <ul className="plano-card-features">
                {plan.features.map((feature) => (
                  <li key={feature.text} className={feature.soon ? 'plano-feature-soon' : ''}>
                    {feature.soon ? <Clock size={12} /> : <Check size={12} />}
                    <span>{feature.text}{feature.soon ? ' (em breve)' : ''}</span>
                  </li>
                ))}
              </ul>

              {atual ? (
                <div className="plano-card-cta plano-card-cta-atual">Este e o plano do seu condominio hoje.</div>
              ) : (
                <a className="btn btn-primary plano-card-cta" href={linkDoPlano(plan)} target="_blank" rel="noopener noreferrer">
                  {pagamentoNoSistema ? <CreditCard size={14} /> : <MessageCircle size={14} />} Quero o plano {plan.label}
                </a>
              )}
            </div>
          )
        })}
      </div>

      <div className="planos-duvidas">
        <div>
          <strong>Ficou com duvida?</strong>
          <span>Fale com o suporte dentro do sistema ou chame a TSCBr no WhatsApp.</span>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" className="btn btn-ghost" onClick={() => onNavigate?.('suporte')}><LifeBuoy size={14} /> Abrir chamado</button>
          <a className="btn btn-ghost" href={whatsappUrl(MSG_PLANOS)} target="_blank" rel="noopener noreferrer">
            <MessageCircle size={14} /> WhatsApp da TSCBr
          </a>
        </div>
      </div>

      <p className="profile-hint" style={{ textAlign: 'center' }}>
        {profile?.condominium_plan_locked
          ? 'Seu acesso esta somente para visualizacao ate a renovacao do plano.'
          : 'Enquanto isso, seu condominio continua funcionando normalmente.'}
      </p>
    </div>
  )
}
