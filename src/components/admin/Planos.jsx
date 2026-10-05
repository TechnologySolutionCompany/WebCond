import { useEffect, useState } from 'react'
import { ArrowLeft, Check, Clock, CreditCard, LifeBuoy, MessageCircle } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import { getCondominiumAccessState, getPlan, PUBLIC_PLAN_LIST, TRIAL_PERIOD_DAYS } from '../../lib/condominiumPlan'
import { MSG_PLANOS, whatsappPlanoUrl, whatsappUrl } from '../../lib/contato'
import { buildCheckoutUrl, describeAssinatura, getAssinaturaConfig } from '../../lib/assinatura'
import { startPlanSubscription } from '../../lib/adminApi'
import { useToast } from '../shared/Toast'

// Tela de planos do sindico, aberta pelo botao "Melhorar meu plano" em Meu perfil.
// Nada e cobrado aqui: o sindico escolhe e fala com a TSCBr para contratar.
export default function Planos({ isActive = true, onNavigate }) {
  const { condominiumId, profile } = useAuth()
  const { toast } = useToast()
  const [condo, setCondo] = useState(null)
  const [abrindo, setAbrindo] = useState('')
  // v2.10A1: com o Asaas ligado, o plano e contratado e pago dentro do sistema.
  const pelaApi = getAssinaturaConfig().pelaApi

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
  const pagamentoNoSistema = pelaApi || Boolean(buildCheckoutUrl({ plano: 'ONE' }))

  // Cria a assinatura e leva para a pagina de pagamento do Asaas (Pix, boleto ou cartao).
  // Sem o Asaas configurado no servidor, cai no WhatsApp da TSCBr como antes.
  const contratar = async (plan) => {
    setAbrindo(plan.id)
    try {
      const { url } = await startPlanSubscription(plan.id)
      window.location.assign(url)
    } catch (error) {
      if (error.code === 'SEM_PROVEDOR') window.open(whatsappPlanoUrl(plan.label, condoName), '_blank', 'noopener,noreferrer')
      else toast(error.message || 'Nao foi possivel abrir o pagamento.', 'error')
      setAbrindo('')
    }
  }

  return (
    <div className="fade-in planos-shell">
      <div className="page-header">
        <button className="btn btn-ghost btn-sm" onClick={() => onNavigate?.('perfil')}><ArrowLeft size={14} /> Voltar ao meu perfil</button>
        <div className="page-title" style={{ marginTop: 10 }}>Planos e valores</div>
        <div className="page-subtitle">
          {pelaApi
            ? 'Escolha o plano e pague por Pix, boleto ou cartao. O plano e liberado assim que o pagamento for confirmado.'
            : 'Escolha com calma. Nada muda automaticamente: voce fala com a TSCBr e a gente ajusta o plano do seu condominio.'}
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
          {condo?.metadata?.assinatura?.provedor ? ` · ${describeAssinatura(condo.metadata)}` : ''}
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
              ) : pelaApi && plan.available ? (
                <button type="button" className="btn btn-primary plano-card-cta" disabled={Boolean(abrindo)} onClick={() => void contratar(plan)}>
                  <CreditCard size={14} /> {abrindo === plan.id ? 'Abrindo o pagamento...' : `Assinar o plano ${plan.label}`}
                </button>
              ) : (
                <a className="btn btn-primary plano-card-cta" href={linkDoPlano(plan)} target="_blank" rel="noopener noreferrer">
                  {pagamentoNoSistema && plan.available ? <CreditCard size={14} /> : <MessageCircle size={14} />} {plan.available ? `Quero o plano ${plan.label}` : `Tenho interesse no ${plan.label}`}
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
