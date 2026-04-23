import { useEffect, useState } from 'react'
import { CheckCircle, XCircle, Clock, User, Home, Mail, Copy, KeyRound, RotateCcw, AlertTriangle } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { createResident } from '../../lib/adminApi'
import { formatCpf, normalizeCpf } from '../../lib/cpf'
import { useToast } from '../shared/Toast'
import { useAuth } from '../../hooks/useAuth'
import { applyTenantFilter } from '../../lib/tenant'

export default function Solicitacoes() {
  const [lista, setLista] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('pendente')
  const [senhaInfo, setSenhaInfo] = useState(null)
  const { condominiumId } = useAuth()
  const { toast } = useToast()

  useEffect(() => {
    void fetchSolicitacoes()
  }, [condominiumId])

  const fetchSolicitacoes = async () => {
    setLoading(true)
    const query = supabase
      .from('solicitacoes_cadastro')
      .select('*')
      .order('created_at', { ascending: false })
    const { data } = await applyTenantFilter(query, condominiumId)

    setLista(data || [])
    setLoading(false)
  }

  const handleAprovar = async (solicitacao) => {
    const cpf = normalizeCpf(solicitacao.cpf)

    if (cpf.length !== 11) {
      toast('Esta solicitação está sem CPF válido. Corrija o CPF antes de aprovar.', 'error')
      return
    }

    try {
      const result = await createResident({
        nome: solicitacao.nome,
        email: solicitacao.email,
        whatsapp: solicitacao.whatsapp || '',
        apartamento: solicitacao.apartamento || '',
        cpf,
        data_entrada: solicitacao.data_entrada || null,
        role: 'morador',
      })

      const { error: updateError } = await supabase
        .from('solicitacoes_cadastro')
        .update({ status: 'aprovado', updated_at: new Date().toISOString() })
        .eq('id', solicitacao.id)

      if (updateError) throw updateError

      setSenhaInfo({
        nome: solicitacao.nome,
        cpf,
        senha: result.temporaryPassword,
        authMode: result.authMode,
        requiresEmailConfirmation: result.requiresEmailConfirmation,
      })

      toast(
        result.requiresEmailConfirmation
          ? 'Solicitação aprovada. O acesso foi criado, mas o Supabase pode exigir confirmação de e-mail antes do primeiro login.'
          : 'Solicitação aprovada com sucesso.',
        result.requiresEmailConfirmation ? 'info' : 'success',
        result.requiresEmailConfirmation ? 8000 : 4500,
      )

      void fetchSolicitacoes()
    } catch (error) {
      toast(error.message || 'Erro ao aprovar solicitação.', 'error')
    }
  }

  const updateStatus = async (solicitacao, status, message) => {
    const { error } = await supabase
      .from('solicitacoes_cadastro')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', solicitacao.id)

    if (error) {
      toast('Não foi possível atualizar a solicitação.', 'error')
      return
    }

    toast(message, 'info')
    void fetchSolicitacoes()
  }

  const copiar = (texto) => {
    navigator.clipboard?.writeText(texto)
    toast('Copiado!', 'success')
  }

  const pendentes = lista.filter((item) => item.status === 'pendente').length
  const filtradas = lista.filter((item) => item.status === filter)

  return (
    <div className="fade-in">
      <div className="page-header">
        <div>
          <div className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            Solicitações de cadastro
            {pendentes > 0 && (
              <span style={{ background: '#f0883e', color: '#000', borderRadius: 20, padding: '2px 10px', fontSize: 12, fontWeight: 700 }}>
                {pendentes} nova{pendentes > 1 ? 's' : ''}
              </span>
            )}
          </div>
          <div className="page-subtitle">Moradores que solicitaram acesso ao sistema</div>
        </div>
      </div>

      {senhaInfo && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: 440 }}>
            <div style={{ textAlign: 'center', marginBottom: 16 }}>
              <KeyRound size={40} color="#3fb950" style={{ margin: '0 auto 12px' }} />
              <div style={{ fontWeight: 700, fontSize: 18, color: '#e6edf3' }}>Acesso liberado</div>
              <div style={{ fontSize: 13, color: '#8b949e', marginTop: 6 }}>
                Passe estas informações para <strong style={{ color: '#e6edf3' }}>{senhaInfo.nome}</strong>
              </div>
            </div>

            <div style={{ background: '#0d1117', borderRadius: 10, padding: 16, marginBottom: 16 }}>
              <div style={{ fontSize: 12, color: '#8b949e', marginBottom: 4 }}>Login do morador</div>
              <div style={{ fontFamily: 'monospace', fontSize: 14, color: '#e6edf3', marginBottom: 10 }}>{formatCpf(senhaInfo.cpf || '')}</div>
              <div style={{ fontSize: 12, color: '#8b949e', marginBottom: 4 }}>Senha temporária</div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <div style={{ flex: 1, fontFamily: 'monospace', fontSize: 22, fontWeight: 700, color: '#3fb950', letterSpacing: 3 }}>{senhaInfo.senha}</div>
                <button className="btn btn-ghost btn-sm" onClick={() => copiar(`Login: ${formatCpf(senhaInfo.cpf || '')}\nSenha: ${senhaInfo.senha}`)}>
                  <Copy size={13} /> Copiar tudo
                </button>
              </div>
            </div>

            {senhaInfo.requiresEmailConfirmation && (
              <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', background: '#3a2010', border: '1px solid #f0883e', color: '#ffd8b2', borderRadius: 10, padding: 14, marginBottom: 16, fontSize: 12, lineHeight: 1.6 }}>
                <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 2 }} />
                <div>
                  O usuário foi criado pelo modo seguro de contingência. Se o projeto Supabase estiver com confirmação de e-mail ativa, o morador precisará confirmar o e-mail antes de entrar pela primeira vez.
                </div>
              </div>
            )}

            <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }} onClick={() => setSenhaInfo(null)}>
              Entendido
            </button>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        {[
          ['pendente', 'Pendentes'],
          ['aprovado', 'Aprovados'],
          ['rejeitado', 'Rejeitados'],
        ].map(([key, label]) => (
          <button key={key} className={`btn btn-sm ${filter === key ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setFilter(key)}>
            {label} ({lista.filter((item) => item.status === key).length})
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><div className="spinner" /></div>
      ) : filtradas.length === 0 ? (
        <div className="empty-state"><Clock size={40} /><p>Nenhuma solicitação {filter}.</p></div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {filtradas.map((solicitacao) => (
            <div key={solicitacao.id} className="card" style={{ borderLeft: `3px solid ${solicitacao.status === 'pendente' ? '#f0883e' : solicitacao.status === 'aprovado' ? '#3fb950' : '#f85149'}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 12 }}>
                    <div style={{ width: 40, height: 40, borderRadius: 10, background: '#1a2a3a', border: '2px solid #58a6ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <User size={18} color="#58a6ff" />
                    </div>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 15 }}>{solicitacao.nome}</div>
                      <span className={`badge ${solicitacao.status === 'pendente' ? 'badge-orange' : solicitacao.status === 'aprovado' ? 'badge-green' : 'badge-red'}`}>
                        {solicitacao.status === 'pendente' ? 'Aguardando' : solicitacao.status === 'aprovado' ? 'Aprovado' : 'Rejeitado'}
                      </span>
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px,1fr))', gap: 6, fontSize: 12, color: '#8b949e' }}>
                    <span><Mail size={11} /> {solicitacao.email}</span>
                    {solicitacao.cpf && <span>CPF: {formatCpf(solicitacao.cpf)}</span>}
                    {solicitacao.whatsapp && <span>WhatsApp: {solicitacao.whatsapp}</span>}
                    {solicitacao.apartamento && <span><Home size={11} /> Apt. {solicitacao.apartamento}</span>}
                    {solicitacao.data_entrada && <span>Entrada: {new Date(`${solicitacao.data_entrada}T12:00:00`).toLocaleDateString('pt-BR')}</span>}
                    {solicitacao.mensagem && <span style={{ gridColumn: '1/-1', fontStyle: 'italic' }}>"{solicitacao.mensagem}"</span>}
                  </div>
                  <div style={{ fontSize: 11, color: '#484f58', marginTop: 8 }}>
                    {new Date(solicitacao.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flexShrink: 0 }}>
                  {solicitacao.status === 'pendente' && (
                    <>
                      <button className="btn btn-sm" style={{ background: '#3fb950', borderColor: '#3fb950', color: '#000' }} onClick={() => handleAprovar(solicitacao)}>
                        <CheckCircle size={13} /> Aprovar
                      </button>
                      <button className="btn btn-danger btn-sm" onClick={() => updateStatus(solicitacao, 'rejeitado', 'Solicitação rejeitada.')}>
                        <XCircle size={13} /> Rejeitar
                      </button>
                    </>
                  )}
                  {solicitacao.status === 'rejeitado' && (
                    <button className="btn btn-ghost btn-sm" onClick={() => updateStatus(solicitacao, 'pendente', 'Solicitação recuperada para análise.')}>
                      <RotateCcw size={13} /> Recuperar
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
