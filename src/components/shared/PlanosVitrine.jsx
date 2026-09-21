import { Check, Clock } from 'lucide-react'
import { PUBLIC_PLAN_LIST, TRIAL_PERIOD_DAYS } from '../../lib/condominiumPlan'

// Vitrine de planos mostrada ao sindico no fim do cadastro do condominio.
// O plano Parceria nao entra aqui: so a administracao da plataforma direciona esse plano.
// Escolher e opcional e nada e cobrado agora: sem escolha, o condominio segue no periodo
// gratuito. PRO e MAX ainda estao em desenvolvimento, entao sao apenas visiveis.
export default function PlanosVitrine({ value, onChange }) {
  return (
    <div className="planos-vitrine">
      <div className="planos-vitrine-title">Planos</div>
      <p className="planos-vitrine-sub">
        Assim que a plataforma autorizar seu cadastro voce ja tem {TRIAL_PERIOD_DAYS} dias gratis para
        testar e avaliar a plataforma. Sua assinatura inicial ja conta com os recursos do ONE.
      </p>
      <p className="planos-vitrine-call">Caso ja queira assinar, selecione o plano:</p>

      <div className="planos-grid">
        {PUBLIC_PLAN_LIST.map((plan) => {
          const selected = value === plan.id
          const Card = plan.available ? 'button' : 'div'

          return (
            <Card
              key={plan.id}
              {...(plan.available
                ? {
                    type: 'button',
                    className: `plano-card plano-card-click ${selected ? 'plano-card-selected' : ''}`,
                    'aria-pressed': selected,
                    onClick: () => onChange(selected ? '' : plan.id),
                  }
                : { className: 'plano-card plano-card-soon' })}
            >
              <div className="plano-card-top">
                <span className="plano-card-name">{plan.label}</span>
                {!plan.available && <span className="badge badge-blue">Em desenvolvimento</span>}
                {selected && <span className="badge badge-green"><Check size={11} /> Escolhido</span>}
              </div>

              <div className="plano-card-price">
                {plan.priceLabel}<span className="plano-card-period">/mes</span>
              </div>

              <p className="plano-card-summary">{plan.summary}</p>

              <ul className="plano-card-features">
                {plan.features.map((feature) => (
                  <li key={feature.text} className={feature.soon ? 'plano-feature-soon' : ''}>
                    {feature.soon ? <Clock size={12} /> : <Check size={12} />}
                    <span>{feature.text}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )
        })}
      </div>

      <p className="planos-vitrine-note">
        Nada e cobrado agora e da para mudar quando quiser. Sem escolher nenhum plano, seu condominio
        continua no periodo gratuito.
      </p>
    </div>
  )
}
