import { useCallback, useEffect, useRef, useState } from 'react'
import { FileText, ImageIcon, LifeBuoy, Paperclip, Send, X } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import { useToast } from '../shared/Toast'
import { STATUS_SUPORTE, SUPORTE_MAX_ANEXOS, SUPORTE_MAX_BYTES, SUPORTE_TIPOS } from '../../lib/suporte'

// Chamado de suporte do sindico para a administracao da plataforma: mensagem + imagens/PDF.
// Os anexos vao para a pasta do proprio condominio no bucket privado "suporte".

function formatSize(bytes) {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function safeName(name) {
  const clean = String(name || 'arquivo').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9._-]+/g, '-')
  return clean.slice(-80) || 'arquivo'
}

export default function Suporte() {
  const { profile, condominiumId } = useAuth()
  const { toast } = useToast()
  const [assunto, setAssunto] = useState('')
  const [mensagem, setMensagem] = useState('')
  const [files, setFiles] = useState([])
  const [sending, setSending] = useState(false)
  const [tickets, setTickets] = useState([])
  const [loading, setLoading] = useState(true)
  const inputRef = useRef(null)

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('suporte_chamados')
      .select('id, assunto, mensagem, anexos, status, resposta, respondido_em, created_at')
      .order('created_at', { ascending: false })
      .limit(20)
    setTickets(data || [])
    setLoading(false)
  }, [])

  useEffect(() => { void load() }, [load])

  const addFiles = (list) => {
    const next = [...files]
    for (const file of list) {
      if (next.length >= SUPORTE_MAX_ANEXOS) { toast(`No maximo ${SUPORTE_MAX_ANEXOS} anexos por chamado.`, 'error'); break }
      if (!SUPORTE_TIPOS.includes(file.type)) { toast(`${file.name}: envie imagem (PNG, JPG, WEBP) ou PDF.`, 'error'); continue }
      if (file.size > SUPORTE_MAX_BYTES) { toast(`${file.name}: o limite e 5 MB por arquivo.`, 'error'); continue }
      next.push(file)
    }
    setFiles(next)
  }

  const openAttachment = async (anexo) => {
    const { data, error } = await supabase.storage.from('suporte').createSignedUrl(anexo.path, 120)
    if (error || !data?.signedUrl) { toast('Nao foi possivel abrir o anexo.', 'error'); return }
    window.open(data.signedUrl, '_blank', 'noopener,noreferrer')
  }

  const handleSend = async (event) => {
    event.preventDefault()
    if (mensagem.trim().length < 5) { toast('Descreva o problema em pelo menos uma frase.', 'error'); return }

    setSending(true)
    const ticketId = crypto.randomUUID()
    const uploaded = []
    try {
      for (const file of files) {
        const path = `${condominiumId}/${ticketId}/${Date.now()}-${safeName(file.name)}`
        const { error } = await supabase.storage.from('suporte').upload(path, file, { contentType: file.type })
        if (error) throw new Error(`Nao foi possivel enviar ${file.name}.`)
        uploaded.push({ path, nome: file.name, tipo: file.type, tamanho: file.size })
      }

      const { error } = await supabase.from('suporte_chamados').insert({
        id: ticketId,
        condominium_id: condominiumId,
        created_by: profile.id,
        assunto: assunto.trim().slice(0, 120),
        mensagem: mensagem.trim(),
        anexos: uploaded,
      })
      if (error) throw new Error('Nao foi possivel abrir o chamado.')

      setAssunto('')
      setMensagem('')
      setFiles([])
      toast('Chamado enviado. A administracao da WebCond foi avisada.', 'success')
      await load()
    } catch (sendError) {
      if (uploaded.length) await supabase.storage.from('suporte').remove(uploaded.map((item) => item.path))
      toast(sendError.message || 'Nao foi possivel enviar o chamado.', 'error')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="card">
      <div className="profile-card-title"><LifeBuoy size={16} /> Suporte</div>
      <p className="profile-card-sub">
        Encontrou um problema? Descreva o que aconteceu e, se ajudar, anexe prints ou PDF. A administracao
        da WebCond recebe na hora e responde por aqui.
      </p>

      <form onSubmit={handleSend} className="support-form">
        <div className="form-group">
          <label className="form-label" htmlFor="suporte-assunto">Assunto (opcional)</label>
          <input id="suporte-assunto" className="input" value={assunto} maxLength={120} onChange={(event) => setAssunto(event.target.value)} placeholder="Ex.: Sistema lento ao lancar cobrancas" />
        </div>
        <div className="form-group">
          <label className="form-label" htmlFor="suporte-mensagem">Mensagem</label>
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

        <div className="support-attach">
          <input
            ref={inputRef}
            type="file"
            accept={SUPORTE_TIPOS.join(',')}
            multiple
            hidden
            onChange={(event) => { addFiles([...event.target.files]); event.target.value = '' }}
          />
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => inputRef.current?.click()} disabled={files.length >= SUPORTE_MAX_ANEXOS}>
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
                <button type="button" onClick={() => setFiles(files.filter((_, i) => i !== index))} aria-label={`Remover ${file.name}`}><X size={12} /></button>
              </span>
            ))}
          </div>
        )}

        <div>
          <button type="submit" className="btn btn-primary" disabled={sending}>
            <Send size={14} /> {sending ? 'Enviando...' : 'Enviar ao suporte'}
          </button>
        </div>
      </form>

      <div className="support-history">
        <div className="form-label" style={{ marginBottom: 8 }}>Meus chamados</div>
        {loading ? <div className="spinner" /> : tickets.length === 0 ? (
          <p className="profile-card-sub" style={{ margin: 0 }}>Nenhum chamado aberto ate agora.</p>
        ) : tickets.map((ticket) => {
          const meta = STATUS_SUPORTE[ticket.status] || STATUS_SUPORTE.aberto
          return (
            <div key={ticket.id} className="support-ticket">
              <div className="support-ticket-head">
                <strong>{ticket.assunto || 'Chamado de suporte'}</strong>
                <span className={`badge ${meta.badge}`}>{meta.label}</span>
              </div>
              <div className="support-ticket-date">{new Date(ticket.created_at).toLocaleString('pt-BR')}</div>
              <p className="support-ticket-text">{ticket.mensagem}</p>
              {(ticket.anexos || []).length > 0 && (
                <div className="support-files">
                  {ticket.anexos.map((anexo) => (
                    <button key={anexo.path} type="button" className="support-file support-file-link" onClick={() => void openAttachment(anexo)}>
                      {anexo.tipo === 'application/pdf' ? <FileText size={12} /> : <ImageIcon size={12} />} {anexo.nome}
                    </button>
                  ))}
                </div>
              )}
              {ticket.resposta && (
                <div className="support-reply">
                  <strong>Resposta da WebCond</strong>
                  {ticket.respondido_em && <span> · {new Date(ticket.respondido_em).toLocaleString('pt-BR')}</span>}
                  <p>{ticket.resposta}</p>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
