import { useCallback, useEffect, useState } from 'react'
import { Archive, CheckCheck, MessageSquareHeart, RefreshCcw, RotateCcw, Star } from 'lucide-react'
import { useToast } from '../shared/Toast'
import { listFeedbacks, updateFeedbackStatus } from '../../lib/platformApi'
import { categoriaFeedbackLabel, STATUS_FEEDBACK } from '../../lib/feedback'
import { getUserRoleLabel } from '../../lib/auth'

const FILTROS = [
  { key: 'ativos', label: 'Novos e lidos' },
  { key: 'novo', label: 'Novos' },
  { key: 'arquivado', label: 'Arquivados' },
  { key: 'todos', label: 'Todos' },
]

function formatWhen(value) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })
}

// Caixa de feedback (v1.09A5): o que moradores, sindicos e contadores mandaram para a TSCBr.
export default function PlatformFeedbacks({ isActive = true, onFeedbacksChanged }) {
  const { toast } = useToast()
  const [filtro, setFiltro] = useState('ativos')
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [savingId, setSavingId] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const result = await listFeedbacks(filtro)
      setItems(result.feedbacks || [])
      setError('')
      onFeedbacksChanged?.(result.novos || 0)
    } catch (loadError) {
      setError(loadError.message || 'Nao foi possivel carregar os feedbacks.')
    } finally {
      setLoading(false)
    }
  }, [filtro, onFeedbacksChanged])

  useEffect(() => { if (isActive) void load() }, [isActive, load])

  const mudarStatus = async (item, status) => {
    setSavingId(item.id)
    try {
      const result = await updateFeedbackStatus({ id: item.id, status })
      onFeedbacksChanged?.(result.novos || 0)
      await load()
    } catch (saveError) {
      toast(saveError.message || 'Nao foi possivel atualizar.', 'error')
    } finally {
      setSavingId('')
    }
  }

  return (
    <div className="fade-in">
      <div className="page-header">
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <div>
            <div className="page-title">Feedback</div>
            <div className="page-subtitle">O que moradores, sindicos e contadores mandaram pelo Suporte do app.</div>
          </div>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => void load()} disabled={loading}>
            <RefreshCcw size={13} /> Atualizar
          </button>
        </div>
      </div>

      <div className="condo-tabs" role="tablist">
        {FILTROS.map((item) => (
          <button key={item.key} type="button" className="condo-tab" role="tab" aria-selected={filtro === item.key} onClick={() => setFiltro(item.key)}>
            {item.label}
          </button>
        ))}
      </div>

      {error && <div className="card" style={{ color: 'var(--red)', marginBottom: 16 }}>{error}</div>}

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><div className="spinner" /></div>
      ) : items.length === 0 ? (
        <div className="empty-state">
          <MessageSquareHeart size={40} />
          <p>Nenhum feedback {filtro === 'novo' ? 'novo' : 'por aqui'}.</p>
        </div>
      ) : (
        <div className="feedback-list">
          {items.map((item) => {
            const status = STATUS_FEEDBACK[item.status] || STATUS_FEEDBACK.novo
            return (
              <article key={item.id} className={`feedback-item ${item.status === 'novo' ? 'novo' : ''}`}>
                <div className="feedback-item-head">
                  <span className={`badge ${status.badge}`}>{status.label}</span>
                  <span className="badge badge-purple">{categoriaFeedbackLabel(item.categoria)}</span>
                  {item.nota ? (
                    <span title={`Nota ${item.nota} de 5`} style={{ display: 'inline-flex', alignItems: 'center', gap: 3, color: '#f5b301' }}>
                      <Star size={12} fill="currentColor" /> {item.nota}/5
                    </span>
                  ) : null}
                  <strong>{item.autor_nome || 'Sem nome'}</strong>
                  <span>{getUserRoleLabel(item.autor_papel)}{item.condominio_nome ? ` · ${item.condominio_nome}` : ''}</span>
                  <span>{formatWhen(item.created_at)}{item.versao_app ? ` · ${item.versao_app}` : ''}</span>
                </div>
                <div className="feedback-item-msg">{item.mensagem}</div>
                <div className="feedback-item-actions">
                  {item.status === 'novo' && (
                    <button type="button" className="btn btn-ghost btn-sm" disabled={savingId === item.id} onClick={() => void mudarStatus(item, 'lido')}>
                      <CheckCheck size={13} /> Marcar como lido
                    </button>
                  )}
                  {item.status !== 'arquivado' ? (
                    <button type="button" className="btn btn-ghost btn-sm" disabled={savingId === item.id} onClick={() => void mudarStatus(item, 'arquivado')}>
                      <Archive size={13} /> Arquivar
                    </button>
                  ) : (
                    <button type="button" className="btn btn-ghost btn-sm" disabled={savingId === item.id} onClick={() => void mudarStatus(item, 'lido')}>
                      <RotateCcw size={13} /> Desarquivar
                    </button>
                  )}
                </div>
              </article>
            )
          })}
        </div>
      )}
    </div>
  )
}
