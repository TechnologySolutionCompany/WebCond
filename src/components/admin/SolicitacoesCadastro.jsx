import { useCallback, useEffect, useState } from 'react'
import { Check, Copy, Link2, RefreshCw, X } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { fetchSignupLink, reviewSignupRequest, saveSignupLink } from '../../lib/adminApi'
import { useAuth } from '../../hooks/useAuth'
import { useToast } from '../shared/Toast'
import SensitiveValue from '../shared/SensitiveValue'

// Link de auto-cadastro e fila de aprovacao. O morador se cadastra sozinho, mas
// so passa a existir no condominio quando o sindico aprova aqui.

const SITUACAO_LABEL = { ocupada: 'Morando', alugada: 'Alugado', desocupada: 'Desocupado' }

function formatDate(value) {
  if (!value) return '-'
  return new Date(value).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export default function SolicitacoesCadastro({ onClose, onApproved }) {
  const { condominiumId } = useAuth()
  const { toast } = useToast()
  const [invite, setInvite] = useState(null)
  const [requests, setRequests] = useState([])
  const [loading, setLoading] = useState(true)
  const [working, setWorking] = useState('')
  const [copied, setCopied] = useState(false)
  const [units, setUnits] = useState({})

  const load = useCallback(async () => {
    setLoading(true)
    const [linkResult, requestsResult] = await Promise.allSettled([
      fetchSignupLink(),
      supabase
        .from('solicitacoes_cadastro')
        .select('id, nome, cpf, whatsapp, email, apartamento, vinculo, situacao, status, created_at, inquilino_nome, inquilino_cpf, inquilino_whatsapp, inquilino_acesso')
        .eq('condominium_id', condominiumId)
        .eq('status', 'pendente')
        .order('created_at', { ascending: true }),
    ])

    if (linkResult.status === 'fulfilled') setInvite(linkResult.value.convite || null)
    else toast(linkResult.reason?.message || 'Nao foi possivel carregar o link.', 'error')

    const pending = requestsResult.status === 'fulfilled' ? (requestsResult.value.data || []) : []
    setRequests(pending)
    setUnits(Object.fromEntries(pending.map((item) => [item.id, item.apartamento || ''])))
    setLoading(false)
  }, [condominiumId, toast])

  useEffect(() => { void load() }, [load])

  const inviteUrl = invite ? `${window.location.origin}/cadastro/${invite.token}` : ''

  const handleGenerate = async () => {
    const confirmed = !invite || window.confirm('Gerar um link novo desativa o link atual. Quem ainda nao se cadastrou vai precisar do endereco novo. Continuar?')
    if (!confirmed) return

    setWorking('link')
    try {
      const result = await saveSignupLink({ action: 'gerar' })
      setInvite(result.convite || null)
      toast('Link de cadastro gerado.', 'success')
    } catch (error) {
      toast(error.message || 'Nao foi possivel gerar o link.', 'error')
    } finally {
      setWorking('')
    }
  }

  const handleRevoke = async () => {
    if (!window.confirm('Desativar o link? Ninguem mais consegue se cadastrar por ele.')) return

    setWorking('link')
    try {
      await saveSignupLink({ action: 'desativar' })
      setInvite(null)
      toast('Link desativado.', 'success')
    } catch (error) {
      toast(error.message || 'Nao foi possivel desativar o link.', 'error')
    } finally {
      setWorking('')
    }
  }

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(inviteUrl)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      toast('Copie o endereco manualmente.', 'info')
    }
  }

  const handleReview = async (request, action) => {
    const numero = String(units[request.id] || request.apartamento || '').trim()
    if (action === 'aprovar' && !numero) {
      toast('Informe o numero da unidade antes de aprovar.', 'error')
      return
    }
    if (action === 'recusar' && !window.confirm(`Recusar o cadastro de ${request.nome}? A conta enviada por essa pessoa sera apagada.`)) return

    setWorking(request.id)
    try {
      await reviewSignupRequest({ requestId: request.id, action, numero })
      toast(action === 'aprovar' ? `${request.nome} liberado na unidade ${numero}.` : 'Cadastro recusado.', 'success')
      setRequests((current) => current.filter((item) => item.id !== request.id))
      if (action === 'aprovar') onApproved?.()
    } catch (error) {
      // O papel ja esta ocupado na unidade: o sindico decide se substitui.
      if (error.code === 'VINCULO_OCUPADO') {
        const replace = window.confirm(`${error.details?.error || error.message}\n\nSubstituir por ${request.nome}? O morador anterior sai da unidade.`)
        if (replace) {
          try {
            await reviewSignupRequest({ requestId: request.id, action, numero, substituir: true })
            toast(`${request.nome} liberado na unidade ${numero}.`, 'success')
            setRequests((current) => current.filter((item) => item.id !== request.id))
            onApproved?.()
          } catch (replaceError) {
            toast(replaceError.message || 'Nao foi possivel aprovar.', 'error')
          }
        }
      } else {
        toast(error.message || 'Nao foi possivel concluir.', 'error')
      }
    } finally {
      setWorking('')
    }
  }

  return (
    <div className="modal-overlay" onClick={(event) => event.target === event.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 720 }}>
        <div className="modal-header">
          <div className="modal-title">Cadastro por link</div>
          <button className="btn btn-ghost btn-icon" onClick={onClose} aria-label="Fechar"><X size={16} /></button>
        </div>

        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 30 }}><div className="spinner" /></div>
        ) : (
          <>
            <p className="consent-text" style={{ marginBottom: 14 }}>
              Envie este endereco aos moradores. Cada pessoa preenche os proprios dados e escolhe a
              senha; o acesso so e liberado depois que voce aprovar aqui.
            </p>

            {invite ? (
              <>
                <div className="signup-link-box">
                  <span className="signup-link-value">{inviteUrl}</span>
                  <button className="btn btn-ghost" onClick={handleCopy}>
                    {copied ? <><Check size={15} /> Copiado</> : <><Copy size={15} /> Copiar</>}
                  </button>
                </div>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginTop: 10, fontSize: 12, color: 'var(--text-muted)' }}>
                  <span>Valido ate {formatDate(invite.expiraEm)}</span>
                  <span>·</span>
                  <span>{invite.usos} cadastro{invite.usos === 1 ? '' : 's'} enviado{invite.usos === 1 ? '' : 's'}</span>
                  {invite.expirado && <span className="badge badge-orange">Expirado</span>}
                  <button className="btn btn-ghost btn-sm" onClick={handleGenerate} disabled={working === 'link'} style={{ marginLeft: 'auto' }}>
                    <RefreshCw size={13} /> Gerar novo
                  </button>
                  <button className="btn btn-ghost btn-sm" onClick={handleRevoke} disabled={working === 'link'} style={{ color: 'var(--red)' }}>
                    Desativar
                  </button>
                </div>
              </>
            ) : (
              <button className="btn btn-primary" onClick={handleGenerate} disabled={working === 'link'}>
                <Link2 size={15} /> Gerar link de cadastro
              </button>
            )}

            <div style={{ marginTop: 26, paddingTop: 18, borderTop: '1px solid var(--border)' }}>
              <div className="modal-title" style={{ marginBottom: 6 }}>
                Aguardando aprovacao {requests.length > 0 && <span className="badge badge-orange">{requests.length}</span>}
              </div>

              {requests.length === 0 ? (
                <p className="consent-text">Nenhum cadastro aguardando no momento.</p>
              ) : requests.map((request) => (
                <div key={request.id} className="signup-request">
                  <div className="signup-request-main">
                    <div className="signup-request-name">{request.nome}</div>
                    <div className="signup-request-meta">
                      <span><SensitiveValue value={request.cpf} type="cpf" /></span>
                      <span><SensitiveValue value={request.whatsapp} type="phone" /></span>
                      <span className="badge badge-blue">{SITUACAO_LABEL[request.situacao] || 'Morando'}</span>
                      <span>{formatDate(request.created_at)}</span>
                    </div>

                    {request.inquilino_nome && (
                      <div className="signup-request-tenant">
                        Inquilino: <strong>{request.inquilino_nome}</strong>
                        {' · '}<SensitiveValue value={request.inquilino_cpf} type="cpf" />
                        {' · '}<SensitiveValue value={request.inquilino_whatsapp} type="phone" />
                        {' · '}{request.inquilino_acesso ? 'com acesso a plataforma' : 'sem acesso a plataforma'}
                      </div>
                    )}
                  </div>

                  <div className="signup-request-actions">
                    <input
                      className="input signup-request-unit"
                      value={units[request.id] ?? ''}
                      onChange={(event) => setUnits((current) => ({ ...current, [request.id]: event.target.value }))}
                      aria-label={`Unidade de ${request.nome}`}
                      maxLength={20}
                    />
                    <button className="btn btn-primary btn-sm" onClick={() => handleReview(request, 'aprovar')} disabled={working === request.id}>
                      Aprovar
                    </button>
                    <button className="btn btn-ghost btn-sm" onClick={() => handleReview(request, 'recusar')} disabled={working === request.id} style={{ color: 'var(--red)' }}>
                      Recusar
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
