import { useState } from 'react'
import FeedbackForm from './FeedbackForm'
import Sobre from './Sobre'

// Pagina "Suporte" com abas (v1.09A5). O sindico tem Chamados + Feedback + Sobre; o morador,
// que fala com o sindico pelas ocorrencias, tem Feedback + Sobre.
// `chamados` e o componente de chamados (so no painel do sindico).
export default function SuporteHub({ chamados: Chamados = null, sendFeedback, isActive = true, ...rest }) {
  const tabs = [
    ...(Chamados ? [{ key: 'chamados', label: 'Chamados' }] : []),
    { key: 'feedback', label: 'Feedback' },
    { key: 'sobre', label: 'Sobre' },
  ]
  const [tab, setTab] = useState(tabs[0].key)

  return (
    <div className="fade-in">
      <div className="condo-tabs suporte-hub-tabs" role="tablist">
        {tabs.map((item) => (
          <button key={item.key} type="button" className="condo-tab" role="tab" aria-selected={tab === item.key} onClick={() => setTab(item.key)}>
            {item.label}
          </button>
        ))}
      </div>

      {/* A aba Chamados ja tem o proprio titulo. */}
      {tab !== 'chamados' && (
        <div className="page-header">
          <div className="page-title">{tab === 'sobre' ? 'Sobre o WebCond' : 'Feedback'}</div>
          <div className="page-subtitle">
            {tab === 'sobre' ? 'Versao do aplicativo e contato direto com a TSCBr' : 'Sua opiniao vai direto para a equipe do WebCond'}
          </div>
        </div>
      )}

      {Chamados && (
        <div style={{ display: tab === 'chamados' ? 'block' : 'none' }}>
          <Chamados isActive={isActive && tab === 'chamados'} {...rest} />
        </div>
      )}
      {tab === 'feedback' && <div className="suporte-hub-panel"><FeedbackForm send={sendFeedback} pagina="suporte" /></div>}
      {tab === 'sobre' && <div className="suporte-hub-panel"><Sobre /></div>}
    </div>
  )
}
