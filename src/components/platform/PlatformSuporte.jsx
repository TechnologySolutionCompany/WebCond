import { useCallback, useEffect, useState } from 'react'
import { FileText, ImageIcon, LifeBuoy, RefreshCcw, Send } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import { useToast } from '../shared/Toast'
import { STATUS_SUPORTE } from '../../lib/suporte'

// Chamados que os sindicos abriram pelo "Meu perfil". A plataforma responde e muda o status;
// o sindico ve a resposta no proprio perfil.
export default function PlatformSuporte({ isActive = true, onChanged }) {
  const { profile } = useAuth()
  const { toast } = useToast()
  const [tickets, setTickets] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('abertos')
  const [drafts, setDrafts] = useState({})
  const [saving, setSaving] = useState('')
  const [missing, setMissing] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    let query = supabase
      .from('suporte_chamados')
      .select('id, condominium_id, assunto, mensagem, anexos, status, resposta, respondido_em, created_at, condominiums(name, nome), autor:profiles!suporte_chamados_created_by_fkey(nome, whatsapp, email)')
      .order('created_at', { ascending: false })
      .limit(100)
    if (filter === 'abertos') query = query.neq('status', 'resolvido')
    const { data, error } = await query
    setMissing(error?.code === 'PGRST205' || error?.code === '42P01')
    if (error && !(error.code === 'PGRST205' || error.code === '42P01')) toast('Nao foi possivel carregar os chamados.', 'error')
    setTickets(data || [])
    setDrafts(Object.fromEntries((data || []).map((ticket) => [ticket.id, { resposta: ticket.resposta || '', status: ticket.status }])))
    setLoading(false)
  }, [filter, toast])

  useEffect(() => {
    if (isActive) void load()
  }, [isActive, load])

  const openAttachment = async (ticket, anexo) => {
    // So assina arquivo da pasta do proprio condominio do chamado.
    if (!String(anexo.path || '').startsWith(`${ticket.condominium_id}/`)) return
    const { data, error } = await supabase.storage.from('suporte').createSignedUrl(anexo.path, 120)
    if (error || !data?.signedUrl) { toast('Nao foi possivel abrir o anexo.', 'error'); return }
    window.open(data.signedUrl, '_blank', 'noopener,noreferrer')
  }

  const save = async (ticket) => {
    const draft = drafts[ticket.id] || {}
    setSaving(ticket.id)
    const answered = String(draft.resposta || '').trim()
    const { error } = await supabase
      .from('suporte_chamados')
      .update({
        status: draft.status,
        resposta: answered,
        ...(answered && answered !== ticket.resposta ? { respondido_por: profile.id, respondido_em: new Date().toISOString() } : {}),
      })
      .eq('id', ticket.id)
    setSaving('')
    if (error) { toast('Nao foi possivel salvar a resposta.', 'error'); return }
    toast('Chamado atualizado. O sindico ve a resposta no perfil dele.', 'success')
    await load()
    onChanged?.()
  }

  return (
    <div className="fade-in">
      <div className="page-header">
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <div>
            <div className="page-title">Suporte</div>
            <div className="page-subtitle">Chamados enviados pelos sindicos, com prints e PDFs anexados.</div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <select className="input" style={{ width: 170 }} value={filter} onChange={(event) => setFilter(event.target.value)}>
              <option value="abertos">Em aberto</option>
              <option value="todos">Todos</option>
            </select>
            <button className="btn btn-ghost" onClick={() => void load()} disabled={loading}><RefreshCcw size={14} /> Atualizar</button>
          </div>
        </div>
      </div>

      {missing && (
        <div className="plan-attention-banner" role="alert">
          <div><strong>Banco de dados pendente</strong> Execute <code>sql/2026-09-25_perfil_suporte_presenca.sql</code> no Supabase.</div>
        </div>
      )}

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><div className="spinner" /></div>
      ) : tickets.length === 0 ? (
        <div className="empty-state"><LifeBuoy size={40} /><p>Nenhum chamado {filter === 'abertos' ? 'em aberto' : 'ate agora'}.</p></div>
      ) : (
        <div style={{ display: 'grid', gap: 14 }}>
          {tickets.map((ticket) => {
            const meta = STATUS_SUPORTE[ticket.status] || STATUS_SUPORTE.aberto
            const draft = drafts[ticket.id] || {}
            return (
              <div key={ticket.id} className="card">
                <div className="support-ticket-head">
                  <div>
                    <strong>{ticket.assunto || 'Chamado de suporte'}</strong>
                    <div className="support-ticket-date">
                      {ticket.condominiums?.name || ticket.condominiums?.nome || 'Condominio'} · {ticket.autor?.nome || 'Sindico'} · {new Date(ticket.created_at).toLocaleString('pt-BR')}
                    </div>
                  </div>
                  <span className={`badge ${meta.badge}`}>{meta.label}</span>
                </div>
                <p className="support-ticket-text">{ticket.mensagem}</p>
                {(ticket.anexos || []).length > 0 && (
                  <div className="support-files" style={{ marginBottom: 10 }}>
                    {ticket.anexos.map((anexo) => (
                      <button key={anexo.path} type="button" className="support-file support-file-link" onClick={() => void openAttachment(ticket, anexo)}>
                        {anexo.tipo === 'application/pdf' ? <FileText size={12} /> : <ImageIcon size={12} />} {anexo.nome}
                      </button>
                    ))}
                  </div>
                )}
                <div className="support-form">
                  <textarea
                    className="input"
                    rows={3}
                    value={draft.resposta || ''}
                    onChange={(event) => setDrafts({ ...drafts, [ticket.id]: { ...draft, resposta: event.target.value } })}
                    placeholder="Resposta para o sindico (aparece no perfil dele)"
                  />
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <select className="input" style={{ width: 180 }} value={draft.status || 'aberto'} onChange={(event) => setDrafts({ ...drafts, [ticket.id]: { ...draft, status: event.target.value } })}>
                      {Object.entries(STATUS_SUPORTE).map(([value, item]) => <option key={value} value={value}>{item.label}</option>)}
                    </select>
                    <button className="btn btn-primary" onClick={() => void save(ticket)} disabled={saving === ticket.id}>
                      <Send size={14} /> {saving === ticket.id ? 'Salvando...' : 'Salvar resposta'}
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
