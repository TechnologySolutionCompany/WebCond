import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useToast } from '../shared/Toast'
import { useAuth } from '../../hooks/useAuth'
import { UserCheck, UserX, Clock, CheckCircle, XCircle, Loader2, RefreshCw, Home, Phone } from 'lucide-react'

export default function Solicitacoes() {
  const [solicitacoes, setSolicitacoes] = useState([])
  const [loading, setLoading] = useState(true)
  const [processando, setProcessando] = useState(null)
  const [filter, setFilter] = useState('pendente')
  const { profile } = useAuth()
  const { toast } = useToast()

  useEffect(() => { fetchSolicitacoes() }, [])

  const fetchSolicitacoes = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('solicitacoes_cadastro')
      .select('*')
      .order('created_at', { ascending: false })
    if (!error) setSolicitacoes(data || [])
    setLoading(false)
  }

  const aprovar = async (s) => {
    if (!confirm(`Aprovar o cadastro de ${s.nome}? Será criado um usuário e enviado acesso.`)) return
    setProcessando(s.id)
    try {
      // Gerar senha temporária
      const tempPassword = Math.random().toString(36).slice(-8) + 'A1!'

      // Criar usuário no Auth
      const { data: signupData, error: signupError } = await supabase.auth.signUp({
        email: s.email,
        password: tempPassword,
        options: {
          data: { role: 'morador', nome: s.nome }
        }
      })
      if (signupError) throw signupError

      const userId = signupData.user?.id
      if (!userId) throw new Error('Usuário não criado.')

      // Criar/atualizar profile
      const { error: profileError } = await supabase
        .from('profiles')
        .upsert({
          id: userId,
          role: 'morador',
          nome: s.nome,
          email: s.email,
          telefone: s.telefone || '',
          whatsapp: s.whatsapp || '',
          apartamento: s.apartamento || '',
          cpf: s.cpf || '',
          ativo: true,
        })
      if (profileError) throw profileError

      // Marcar solicitação como aprovada
      await supabase
        .from('solicitacoes_cadastro')
        .update({ status: 'aprovado', aprovado_por: profile.id, updated_at: new Date().toISOString() })
        .eq('id', s.id)

      toast(`✅ ${s.nome} aprovado! Senha temporária: ${tempPassword}`, 'success', 10000)
      fetchSolicitacoes()
    } catch (e) {
      toast(e.message || 'Erro ao aprovar.', 'error')
    } finally {
      setProcessando(null)
    }
  }

  const rejeitar = async (s) => {
    if (!confirm(`Rejeitar a solicitação de ${s.nome}?`)) return
    setProcessando(s.id)
    await supabase
      .from('solicitacoes_cadastro')
      .update({ status: 'rejeitado', updated_at: new Date().toISOString() })
      .eq('id', s.id)
    toast(`Solicitação de ${s.nome} rejeitada.`, 'info')
    setProcessando(null)
    fetchSolicitacoes()
  }

  const pendentes = solicitacoes.filter(s => s.status === 'pendente').length
  const filtered = solicitacoes.filter(s => s.status === filter)

  return (
    <div className="fade-in">
      <div className="page-header">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div className="page-title">Solicitações de Cadastro</div>
              {pendentes > 0 && (
                <span style={{ background: '#f0883e', color: '#000', borderRadius: 20, padding: '2px 9px', fontSize: 12, fontWeight: 700 }}>
                  {pendentes} nova{pendentes > 1 ? 's' : ''}
                </span>
              )}
            </div>
            <div className="page-subtitle">Moradores que solicitaram acesso ao sistema</div>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={fetchSolicitacoes}>
            <RefreshCw size={14} /> Atualizar
          </button>
        </div>
      </div>

      {/* Filtros */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {[
          { key: 'pendente', label: 'Pendentes', icon: Clock, color: '#f0883e' },
          { key: 'aprovado', label: 'Aprovados', icon: CheckCircle, color: '#3fb950' },
          { key: 'rejeitado', label: 'Rejeitados', icon: XCircle, color: '#f85149' },
        ].map(({ key, label, icon: Icon, color }) => {
          const count = solicitacoes.filter(s => s.status === key).length
          return (
            <button key={key}
              className={`btn btn-sm ${filter === key ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setFilter(key)}
              style={filter === key ? { background: color, borderColor: color, color: key === 'aprovado' ? '#000' : '#fff' } : {}}
            >
              <Icon size={13} /> {label} {count > 0 && `(${count})`}
            </button>
          )
        })}
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><div className="spinner" /></div>
      ) : filtered.length === 0 ? (
        <div className="empty-state">
          <UserCheck size={40} />
          <p>Nenhuma solicitação {filter === 'pendente' ? 'pendente' : filter === 'aprovado' ? 'aprovada' : 'rejeitada'}.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {filtered.map(s => (
            <div key={s.id} className="card" style={{
              borderLeft: `3px solid ${s.status === 'pendente' ? '#f0883e' : s.status === 'aprovado' ? '#3fb950' : '#f85149'}`
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
                {/* Info */}
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                    <div style={{ width: 40, height: 40, borderRadius: 10, background: '#1a2a3a', border: '2px solid #58a6ff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700, color: '#58a6ff', flexShrink: 0 }}>
                      {s.nome?.[0]?.toUpperCase() || '?'}
                    </div>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 15 }}>{s.nome}</div>
                      <div style={{ fontSize: 12, color: '#8b949e' }}>{s.email}</div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: 12, color: '#8b949e' }}>
                    {s.apartamento && (
                      <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Home size={11} /> Apt. {s.apartamento}
                      </span>
                    )}
                    {s.telefone && (
                      <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Phone size={11} /> {s.telefone}
                      </span>
                    )}
                    <span>Solicitado em {new Date(s.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
                  </div>
                  {s.mensagem && (
                    <div style={{ marginTop: 8, fontSize: 12, color: '#8b949e', background: '#1c2333', borderRadius: 6, padding: '6px 10px', fontStyle: 'italic' }}>
                      "{s.mensagem}"
                    </div>
                  )}
                </div>

                {/* Ações */}
                <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                  {s.status === 'pendente' && (
                    <>
                      <button
                        className="btn btn-sm"
                        disabled={processando === s.id}
                        onClick={() => aprovar(s)}
                        style={{ background: '#1a3a24', border: '1px solid #3fb950', color: '#3fb950' }}
                      >
                        {processando === s.id
                          ? <Loader2 size={13} style={{ animation: 'spin .6s linear infinite' }} />
                          : <UserCheck size={13} />}
                        Aprovar
                      </button>
                      <button
                        className="btn btn-sm"
                        disabled={processando === s.id}
                        onClick={() => rejeitar(s)}
                        style={{ background: '#3a1010', border: '1px solid #f85149', color: '#f85149' }}
                      >
                        <UserX size={13} /> Rejeitar
                      </button>
                    </>
                  )}
                  {s.status === 'aprovado' && (
                    <span className="badge badge-green"><CheckCircle size={11} /> Aprovado</span>
                  )}
                  {s.status === 'rejeitado' && (
                    <span className="badge badge-red"><XCircle size={11} /> Rejeitado</span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )
}
