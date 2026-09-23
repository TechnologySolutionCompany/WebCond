import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowLeft, FileText, ImageIcon, LifeBuoy, Paperclip, Plus, RefreshCcw, Send, X } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import { useToast } from '../shared/Toast'
import ChatMensagens from '../shared/ChatMensagens'
import { STATUS_SUPORTE, SUPORTE_MAX_ANEXOS, SUPORTE_MAX_BYTES, SUPORTE_TIPOS } from '../../lib/suporte'
import { notifySupportTicket } from '../../lib/adminApi'

// Suporte do sindico: abre chamado, acompanha a fila e conversa com a equipe da WebCond.
// A conversa fica na tabela suporte_mensagens; cada lado ve tudo o que o outro escreveu.
const REFRESH_MS = 30000
const FILTROS = [
  { key: 'abertos', label: 'Em aberto' },
  { key: 'em_andamento', label: 'Em andamento' },
  { key: 'resolvido', label: 'Concluidos' },
  { key: 'todos', label: 'Todos' },
]

function formatSize(bytes) {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function safeName(name) {
  const clean = String(name || 'arquivo').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9._-]+/g, '-')
  return clean.slice(-80) || 'arquivo'
}

function formatWhen(value) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

// Campo de anexos usado tanto no chamado novo quanto na conversa.
function Anexos({ files, setFiles, disabled }) {
  const inputRef = useRef(null)
  const { toast } = useToast()

  const addFiles = (list) => {
    const next = [...files]
    for (const file of list) {
      if (next.length >= SUPORTE_MAX_ANEXOS) { toast(`No maximo ${SUPORTE_MAX_ANEXOS} anexos por mensagem.`, 'error'); break }
      if (!SUPORTE_TIPOS.includes(file.type)) { toast(`${file.name}: envie imagem (PNG, JPG, WEBP) ou PDF.`, 'error'); continue }
      if (file.size > SUPORTE_MAX_BYTES) { toast(`${file.name}: o limite e 5 MB por arquivo.`, 'error'); continue }
      next.push(file)
    }
    setFiles(next)
  }

  return (
    <>
      <div className="support-attach">
        <input ref={inputRef} type="file" accept={SUPORTE_TIPOS.join(',')} multiple hidden onChange={(event) => { addFiles([...event.target.files]); event.target.value = '' }} />
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => inputRef.current?.click()} disabled={disabled || files.length >= SUPORTE_MAX_ANEXOS}>
          <Paperclip size={13} /> Anexar imagem ou PDF
        </button>
        <span className="support-hint">Ate {SUPORTE_MAX_ANEXOS} arquivos de 5 MB.</span>
      </div>
      {files.length > 0 && (
        <div className="support-files">
          {files.map((file, index) => (
            <span key={`${file.name}-${index}`} className="support-file">
              {file.type === 'application/pdf' ? <FileText size={12} /> : <ImageIcon size={12} />}
              {file.name} · {formatSize(file.size)}
              <button type="button" onClick={() => setFiles(files.filter((_, position) => position !== index))} aria-label={`Remover ${file.name}`}><X size={12} /></button>
            </span>
          ))}
        </div>
      )}
    </>
  )
}

export default function Suporte({ isActive = true }) {
  const { profile, condominiumId } = useAuth()
  const { toast } = useToast()
  const [tickets, setTickets] = useState([])
  const [loading, setLoading] = useState(true)
  const [missing, setMissing] = useState(false)
  const [filtro, setFiltro] = useState('abertos')
  const [novo, setNovo] = useState(false)
  const [assunto, setAssunto] = useState('')
  const [mensagem, setMensagem] = useState('')
  const [files, setFiles] = useState([])
  const [sending, setSending] = useState(false)
  const [abertoId, setAbertoId] = useState('')
  const [mensagens, setMensagens] = useState([])
  const [carregandoChat, setCarregandoChat] = useState(false)
  const [resposta, setResposta] = useState('')
  const [respostaFiles, setRespostaFiles] = useState([])

  const loadTickets = useCallback(async () => {
    const base = 'id, assunto, mensagem, anexos, status, resposta, respondido_em, created_at'
    let { data, error } = await supabase
      .from('suporte_chamados')
      .select(`${base}, ultima_mensagem_em`)
      .order('created_at', { ascending: false })
      .limit(50)

    // Antes do SQL 09-27 a coluna ultima_mensagem_em ainda nao existe: a lista continua aparecendo,
    // mas o aviso de banco pendente fica na tela porque a conversa depende do mesmo SQL.
    const codigoOriginal = error?.code
    if (error?.code === '42703') {
      const retry = await supabase.from('suporte_chamados').select(base).order('created_at', { ascending: false }).limit(50)
      data = retry.data
      error = retry.error
    }

    setMissing(['PGRST205', '42P01', '42703'].includes(codigoOriginal || error?.code))
    setTickets(data || [])
    setLoading(false)
  }, [])

  const loadMensagens = useCallback(async (ticketId, { silent = false } = {}) => {
    if (!ticketId) return
    if (!silent) setCarregandoChat(true)
    const { data } = await supabase
      .from('suporte_mensagens')
      .select('id, autor_tipo, autor_nome, mensagem, anexos, created_at')
      .eq('chamado_id', ticketId)
      .order('created_at', { ascending: true })
    setMensagens(data || [])
    setCarregandoChat(false)
  }, [])

  useEffect(() => { if (isActive) void loadTickets() }, [isActive, loadTickets])
  useEffect(() => { if (abertoId) void loadMensagens(abertoId) }, [abertoId, loadMensagens])

  // Resposta do suporte aparece sozinha enquanto a tela estiver aberta.
  useEffect(() => {
    if (!isActive) return undefined
    const interval = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return
      void loadTickets()
      if (abertoId) void loadMensagens(abertoId, { silent: true })
    }, REFRESH_MS)
    return () => window.clearInterval(interval)
  }, [isActive, abertoId, loadTickets, loadMensagens])

  const openAttachment = async (anexo) => {
    const { data, error } = await supabase.storage.from('suporte').createSignedUrl(anexo.path, 120)
    if (error || !data?.signedUrl) { toast('Nao foi possivel abrir o anexo.', 'error'); return }
    window.open(data.signedUrl, '_blank', 'noopener,noreferrer')
  }

  async function uploadFiles(list, ticketId) {
    const uploaded = []
    for (const file of list) {
      const path = `${condominiumId}/${ticketId}/${Date.now()}-${safeName(file.name)}`
      const { error } = await supabase.storage.from('suporte').upload(path, file, { contentType: file.type })
      if (error) throw new Error(`Nao foi possivel enviar ${file.name}.`)
      uploaded.push({ path, nome: file.name, tipo: file.type, tamanho: file.size })
    }
    return uploaded
  }

  const abrirChamado = async (event) => {
    event.preventDefault()
    if (mensagem.trim().length < 5) { toast('Descreva o problema em pelo menos uma frase.', 'error'); return }

    setSending(true)
    const ticketId = crypto.randomUUID()
    let uploaded = []
    try {
      uploaded = await uploadFiles(files, ticketId)
      const { error } = await supabase.from('suporte_chamados').insert({
        id: ticketId,
        condominium_id: condominiumId,
        created_by: profile.id,
        assunto: assunto.trim().slice(0, 120),
        mensagem: mensagem.trim(),
        anexos: uploaded,
      })
      if (error) throw new Error('Nao foi possivel abrir o chamado.')
      // Aviso no celular de quem atende. O chamado ja esta salvo; falha aqui nao muda nada para o sindico.
      void notifySupportTicket(ticketId).catch(() => {})

      setAssunto('')
      setMensagem('')
      setFiles([])
      setNovo(false)
      toast('Chamado enviado. A equipe da WebCond foi avisada.', 'success')
      await loadTickets()
      setAbertoId(ticketId)
    } catch (sendError) {
      if (uploaded.length) await supabase.storage.from('suporte').remove(uploaded.map((item) => item.path))
      toast(sendError.message || 'Nao foi possivel enviar o chamado.', 'error')
    } finally {
      setSending(false)
    }
  }

  const responder = async (event) => {
    event.preventDefault()
    if (!resposta.trim()) return

    setSending(true)
    let uploaded = []
    try {
      uploaded = await uploadFiles(respostaFiles, abertoId)
      const { error } = await supabase.from('suporte_mensagens').insert({
        chamado_id: abertoId,
        autor_id: profile.id,
        autor_tipo: 'sindico',
        autor_nome: profile.nome || 'Sindico',
        mensagem: resposta.trim(),
        anexos: uploaded,
      })
      if (error) throw new Error('Nao foi possivel enviar a mensagem.')
      setResposta('')
      setRespostaFiles([])
      await Promise.all([loadMensagens(abertoId, { silent: true }), loadTickets()])
    } catch (sendError) {
      if (uploaded.length) await supabase.storage.from('suporte').remove(uploaded.map((item) => item.path))
      toast(sendError.message || 'Nao foi possivel enviar a mensagem.', 'error')
    } finally {
      setSending(false)
    }
  }

  const aberto = tickets.find((ticket) => ticket.id === abertoId) || null
  const visiveis = tickets.filter((ticket) => (
    filtro === 'todos' ? true
      : filtro === 'abertos' ? ticket.status !== 'resolvido'
        : ticket.status === filtro
  ))

  if (aberto) {
    const meta = STATUS_SUPORTE[aberto.status] || STATUS_SUPORTE.aberto
    return (
      <div className="fade-in me-shell">
        <div className="page-header">
          <button className="btn btn-ghost btn-sm" onClick={() => setAbertoId('')}><ArrowLeft size={14} /> Voltar aos chamados</button>
        </div>
        <div className="chat-panel">
          <div className="chat-head">
            <div style={{ minWidth: 0 }}>
              <strong>{aberto.assunto || 'Chamado de suporte'}</strong>
              <div className="support-ticket-date">Aberto em {formatWhen(aberto.created_at)}</div>
            </div>
            <span className={`badge ${meta.badge}`}>{meta.label}</span>
          </div>

          <ChatMensagens mensagens={mensagens} viewer="sindico" loading={carregandoChat} onAttachment={openAttachment} />

          {aberto.status === 'resolvido' && (
            <p className="chat-note">Chamado concluido. Se escrever de novo, ele volta para a fila da equipe.</p>
          )}
          <form className="chat-form" onSubmit={responder}>
            <textarea
              className="input"
              rows={2}
              maxLength={4000}
              value={resposta}
              onChange={(event) => setResposta(event.target.value)}
              placeholder="Escreva para a equipe da WebCond..."
            />
            <Anexos files={respostaFiles} setFiles={setRespostaFiles} disabled={sending} />
            <div className="me-actions">
              <button type="submit" className="btn btn-primary" disabled={sending || !resposta.trim()}>
                <Send size={14} /> {sending ? 'Enviando...' : 'Enviar'}
              </button>
            </div>
          </form>
        </div>
      </div>
    )
  }

  return (
    <div className="fade-in me-shell">
      <div className="page-header">
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <div>
            <div className="page-title">Suporte</div>
            <div className="page-subtitle">Fale com a equipe da WebCond e acompanhe os chamados abertos.</div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-ghost btn-sm" onClick={() => void loadTickets()}><RefreshCcw size={14} /> Atualizar</button>
            <button className="btn btn-primary" onClick={() => setNovo((current) => !current)}>
              {novo ? <><X size={14} /> Cancelar</> : <><Plus size={14} /> Novo chamado</>}
            </button>
          </div>
        </div>
      </div>

      {missing && (
        <div className="plan-attention-banner" role="alert">
          <div><strong>Banco de dados pendente</strong> Execute <code>sql/2026-09-25</code> e <code>sql/2026-09-27</code> no Supabase.</div>
        </div>
      )}

      {novo && (
        <form className="me-panel" onSubmit={abrirChamado} style={{ marginBottom: 18 }}>
          <div className="form-group">
            <label className="form-label" htmlFor="suporte-assunto">Assunto (opcional)</label>
            <input id="suporte-assunto" className="input" value={assunto} maxLength={120} onChange={(event) => setAssunto(event.target.value)} placeholder="Ex.: Sistema lento ao lancar cobrancas" />
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="suporte-mensagem">O que aconteceu?</label>
            <textarea
              id="suporte-mensagem"
              className="input"
              rows={4}
              maxLength={4000}
              value={mensagem}
              onChange={(event) => setMensagem(event.target.value)}
              placeholder="Ola, identifiquei um problema no sistema: ele tem ficado lento e com problemas no acesso durante..."
            />
          </div>
          <Anexos files={files} setFiles={setFiles} disabled={sending} />
          <div className="me-actions">
            <button type="submit" className="btn btn-primary" disabled={sending}>
              <Send size={14} /> {sending ? 'Enviando...' : 'Abrir chamado'}
            </button>
          </div>
        </form>
      )}

      <div className="condo-tabs" role="tablist">
        {FILTROS.map((item) => (
          <button key={item.key} type="button" className="condo-tab" role="tab" aria-selected={filtro === item.key} onClick={() => setFiltro(item.key)}>
            {item.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><div className="spinner" /></div>
      ) : visiveis.length === 0 ? (
        <div className="empty-state"><LifeBuoy size={40} /><p>Nenhum chamado {filtro === 'todos' ? 'ate agora' : 'nesta situacao'}.</p></div>
      ) : (
        <div className="ticket-list">
          {visiveis.map((ticket) => {
            const meta = STATUS_SUPORTE[ticket.status] || STATUS_SUPORTE.aberto
            const respondido = ticket.respondido_em && new Date(ticket.respondido_em).getTime() >= new Date(ticket.ultima_mensagem_em || ticket.created_at).getTime()
            return (
              <button key={ticket.id} type="button" className="ticket-card" onClick={() => setAbertoId(ticket.id)}>
                <div className="ticket-card-top">
                  <strong>{ticket.assunto || 'Chamado de suporte'}</strong>
                  <span className={`badge ${meta.badge}`}>{meta.label}</span>
                </div>
                <p className="ticket-card-text">{ticket.mensagem}</p>
                <div className="ticket-card-foot">
                  <span>{formatWhen(ticket.ultima_mensagem_em || ticket.created_at)}</span>
                  {respondido && <span className="badge badge-green">Respondido</span>}
                </div>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
