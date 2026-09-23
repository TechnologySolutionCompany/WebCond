import { useCallback, useEffect, useMemo, useState } from 'react'
import { Clock, FileText, ImageIcon, LifeBuoy, MessageSquare, RefreshCcw, Send, X } from 'lucide-react'
import { useToast } from '../shared/Toast'
import NotificationSettings from '../shared/NotificationSettings'
import ChatMensagens from '../shared/ChatMensagens'
import { listSupportMessages, listSupportTickets, openSupportAttachment, saveSupportTicket, sendSupportMessage } from '../../lib/platformApi'

// Quadro de chamados no formato de colunas (como um quadro de tarefas): Abertos, Em andamento e
// Concluidos. O cartao pode ser arrastado de uma coluna para a outra e, ao clicar, abre a conversa
// com o sindico. Tudo passa pela API: a equipe de suporte nao le nenhuma tabela direto.
const COLUNAS = [
  { key: 'aberto', label: 'Chamados abertos', dot: 'var(--orange)' },
  { key: 'em_andamento', label: 'Em andamento', dot: 'var(--blue)' },
  { key: 'resolvido', label: 'Concluidos', dot: 'var(--green)' },
]
const REFRESH_MS = 30000

function formatWhen(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const minutes = Math.round((Date.now() - date.getTime()) / 60000)
  if (minutes < 1) return 'agora'
  if (minutes < 60) return `ha ${minutes} min`
  if (minutes < 60 * 24) return `ha ${Math.round(minutes / 60)} h`
  return date.toLocaleDateString('pt-BR')
}

function TicketCard({ ticket, onOpen, onDragStart }) {
  return (
    <div
      className="board-card"
      role="button"
      tabIndex={0}
      draggable
      onDragStart={(event) => { event.dataTransfer.setData('text/plain', ticket.id); onDragStart(ticket) }}
      onClick={() => onOpen(ticket)}
      onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onOpen(ticket) } }}
    >
      <div className="board-card-condo">{ticket.condominio.nome}</div>
      <strong className="board-card-title">{ticket.assunto || 'Chamado de suporte'}</strong>
      <p className="board-card-text">{ticket.mensagem}</p>
      <div className="board-card-foot">
        <span><Clock size={11} /> {formatWhen(ticket.ultima_mensagem_em)}</span>
        {(ticket.anexos || []).length > 0 && <span><FileText size={11} /> {ticket.anexos.length}</span>}
        {ticket.aguardando_suporte && ticket.status !== 'resolvido' && <span className="badge badge-orange">Aguardando resposta</span>}
      </div>
    </div>
  )
}

export default function PlatformSuporte({ isActive = true, onChanged }) {
  const { toast } = useToast()
  const [tickets, setTickets] = useState([])
  const [loading, setLoading] = useState(true)
  const [missing, setMissing] = useState(false)
  const [foco, setFoco] = useState('')
  const [arrastando, setArrastando] = useState(null)
  const [aberto, setAberto] = useState(null)
  const [mensagens, setMensagens] = useState([])
  const [carregandoChat, setCarregandoChat] = useState(false)
  const [resposta, setResposta] = useState('')
  const [saving, setSaving] = useState('')

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true)
    try {
      const result = await listSupportTickets('todos')
      setMissing(false)
      setTickets(result.tickets || [])
      onChanged?.(result.abertos)
    } catch (error) {
      setMissing(/SQL 2026-09-2/.test(error.message || ''))
      if (!silent) toast(error.message || 'Nao foi possivel carregar os chamados.', 'error')
    } finally {
      if (!silent) setLoading(false)
    }
  }, [toast, onChanged])

  const loadMensagens = useCallback(async (id, { silent = false } = {}) => {
    if (!silent) setCarregandoChat(true)
    try {
      const result = await listSupportMessages(id)
      setMensagens(result.mensagens || [])
    } catch (error) {
      toast(error.message || 'Nao foi possivel carregar a conversa.', 'error')
    } finally {
      setCarregandoChat(false)
    }
  }, [toast])

  useEffect(() => { if (isActive) void load() }, [isActive, load])

  useEffect(() => {
    if (!isActive) return undefined
    const interval = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return
      void load({ silent: true })
      if (aberto) void loadMensagens(aberto.id, { silent: true })
    }, REFRESH_MS)
    return () => window.clearInterval(interval)
  }, [isActive, aberto, load, loadMensagens])

  const abrir = (ticket) => {
    setAberto(ticket)
    setResposta('')
    void loadMensagens(ticket.id)
  }

  const mover = async (ticket, status) => {
    if (!ticket || ticket.status === status) return
    setSaving(ticket.id)
    // A coluna muda na hora; se a API recusar, a lista volta ao que o servidor disser.
    setTickets((current) => current.map((item) => (item.id === ticket.id ? { ...item, status } : item)))
    setAberto((current) => (current?.id === ticket.id ? { ...current, status } : current))
    try {
      await saveSupportTicket({ id: ticket.id, status })
      await load({ silent: true })
    } catch (error) {
      toast(error.message || 'Nao foi possivel mover o chamado.', 'error')
      await load({ silent: true })
    } finally {
      setSaving('')
    }
  }

  const responder = async (event) => {
    event.preventDefault()
    const texto = resposta.trim()
    if (!texto || !aberto) return
    setSaving(aberto.id)
    try {
      const result = await sendSupportMessage({ id: aberto.id, mensagem: texto })
      setResposta('')
      setAberto((current) => (current ? { ...current, status: result.status || current.status } : current))
      await Promise.all([loadMensagens(aberto.id, { silent: true }), load({ silent: true })])
      toast('Resposta enviada. O sindico ve na hora, no Suporte dele.', 'success')
    } catch (error) {
      toast(error.message || 'Nao foi possivel enviar a resposta.', 'error')
    } finally {
      setSaving('')
    }
  }

  const abrirAnexo = async (anexo) => {
    if (!aberto) return
    try {
      const { url } = await openSupportAttachment({ id: aberto.id, path: anexo.path })
      window.open(url, '_blank', 'noopener,noreferrer')
    } catch (error) {
      toast(error.message || 'Nao foi possivel abrir o anexo.', 'error')
    }
  }

  const porColuna = useMemo(() => {
    const grupos = { aberto: [], em_andamento: [], resolvido: [] }
    for (const ticket of tickets) (grupos[ticket.status] || grupos.aberto).push(ticket)
    for (const lista of Object.values(grupos)) {
      lista.sort((a, b) => new Date(b.ultima_mensagem_em).getTime() - new Date(a.ultima_mensagem_em).getTime())
    }
    return grupos
  }, [tickets])

  const colunasVisiveis = foco ? COLUNAS.filter((coluna) => coluna.key === foco) : COLUNAS

  return (
    <div className="fade-in">
      <div className="page-header">
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <div>
            <div className="page-title">Suporte</div>
            <div className="page-subtitle">
              Arraste o chamado entre as colunas e clique para conversar com o sindico.
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {foco && <button className="btn btn-ghost" onClick={() => setFoco('')}>Ver o quadro</button>}
            <button className="btn btn-ghost" onClick={() => void load()} disabled={loading}><RefreshCcw size={14} /> Atualizar</button>
          </div>
        </div>
      </div>

      <div style={{ marginBottom: 16 }}>
        <NotificationSettings description="Receba um aviso no aparelho quando um sindico abrir um chamado." />
      </div>

      {missing && (
        <div className="plan-attention-banner" role="alert">
          <div><strong>Banco de dados pendente</strong> Execute <code>sql/2026-09-25</code> e <code>sql/2026-09-27</code> no Supabase.</div>
        </div>
      )}

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><div className="spinner" /></div>
      ) : (
        <div className={`board ${foco ? 'board-foco' : ''}`}>
          {colunasVisiveis.map((coluna) => (
            <section
              key={coluna.key}
              className={`board-col ${arrastando && arrastando.status !== coluna.key ? 'board-col-alvo' : ''}`}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault()
                const id = event.dataTransfer.getData('text/plain')
                const ticket = tickets.find((item) => item.id === id)
                setArrastando(null)
                if (ticket) void mover(ticket, coluna.key)
              }}
            >
              <button type="button" className="board-col-head" onClick={() => setFoco(foco === coluna.key ? '' : coluna.key)}>
                <span className="board-dot" style={{ background: coluna.dot }} />
                {coluna.label}
                <span className="board-count">{porColuna[coluna.key].length}</span>
              </button>

              <div className="board-col-body">
                {porColuna[coluna.key].length === 0 ? (
                  <p className="board-empty">Nenhum chamado aqui.</p>
                ) : porColuna[coluna.key].map((ticket) => (
                  <TicketCard key={ticket.id} ticket={ticket} onOpen={abrir} onDragStart={setArrastando} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {aberto && (
        <div className="modal-overlay" onClick={(event) => event.target === event.currentTarget && setAberto(null)}>
          <div className="modal chat-modal" role="dialog" aria-modal="true" aria-label={`Chamado ${aberto.assunto || ''}`}>
            <div className="modal-header" style={{ alignItems: 'flex-start', gap: 12 }}>
              <div style={{ minWidth: 0 }}>
                <div className="modal-title">{aberto.assunto || 'Chamado de suporte'}</div>
                <div className="support-context" style={{ margin: '6px 0 0' }}>
                  <span>{aberto.condominio.nome}</span>
                  <span>Plano: {aberto.condominio.plano}</span>
                  <span>Situacao: {aberto.condominio.situacao}</span>
                  <span>Sindico: {aberto.autor.nome}</span>
                  {aberto.autor.whatsapp && <span>WhatsApp: {aberto.autor.whatsapp}</span>}
                  {aberto.autor.email && <span>E-mail: {aberto.autor.email}</span>}
                </div>
              </div>
              <button className="btn btn-ghost btn-icon" onClick={() => setAberto(null)} aria-label="Fechar"><X size={16} /></button>
            </div>

            <div className="chat-status">
              {COLUNAS.map((coluna) => (
                <button
                  key={coluna.key}
                  type="button"
                  className={`btn btn-sm ${aberto.status === coluna.key ? 'btn-primary' : 'btn-ghost'}`}
                  onClick={() => void mover(aberto, coluna.key)}
                  disabled={saving === aberto.id}
                >
                  {coluna.label}
                </button>
              ))}
            </div>

            <ChatMensagens mensagens={mensagens} viewer="suporte" loading={carregandoChat} onAttachment={abrirAnexo} emptyText="O chamado ainda nao tem mensagens." />

            {(aberto.anexos || []).length > 0 && (
              <div className="support-files" style={{ marginBottom: 8 }}>
                {aberto.anexos.map((anexo) => (
                  <button key={anexo.path} type="button" className="support-file support-file-link" onClick={() => void abrirAnexo(anexo)}>
                    {anexo.tipo === 'application/pdf' ? <FileText size={12} /> : <ImageIcon size={12} />} {anexo.nome}
                  </button>
                ))}
              </div>
            )}

            <form className="chat-form" onSubmit={responder}>
              <textarea
                className="input"
                rows={2}
                maxLength={4000}
                value={resposta}
                onChange={(event) => setResposta(event.target.value)}
                placeholder="Responder ao sindico..."
              />
              <div className="me-actions">
                <button type="submit" className="btn btn-primary" disabled={saving === aberto.id || !resposta.trim()}>
                  <Send size={14} /> {saving === aberto.id ? 'Enviando...' : 'Responder'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {!loading && tickets.length === 0 && !missing && (
        <div className="empty-state"><LifeBuoy size={40} /><p>Nenhum chamado ate agora.</p></div>
      )}

      {!loading && tickets.length > 0 && (
        <p className="profile-hint" style={{ marginTop: 12 }}>
          <MessageSquare size={12} style={{ verticalAlign: '-2px' }} /> Responder move o chamado de "Chamados abertos" para "Em andamento" automaticamente.
        </p>
      )}
    </div>
  )
}
