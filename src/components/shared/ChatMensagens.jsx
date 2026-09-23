import { useEffect, useRef } from 'react'
import { FileText, ImageIcon } from 'lucide-react'

function formatWhen(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const today = new Date()
  const sameDay = date.toDateString() === today.toDateString()
  return sameDay
    ? date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    : date.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

// Conversa do chamado. `viewer` diz de que lado esta quem esta olhando: as mensagens dele
// ficam a direita, as do outro lado a esquerda, como em qualquer aplicativo de mensagem.
export default function ChatMensagens({ mensagens = [], viewer = 'sindico', onAttachment, loading = false, emptyText = 'Nenhuma mensagem ainda.' }) {
  const endRef = useRef(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' })
  }, [mensagens.length])

  if (loading) return <div className="chat-scroll" style={{ justifyContent: 'center' }}><div className="spinner" /></div>

  return (
    <div className="chat-scroll">
      {mensagens.length === 0 ? (
        <p className="chat-empty">{emptyText}</p>
      ) : mensagens.map((mensagem) => {
        const mine = mensagem.autor_tipo === viewer
        return (
          <div key={mensagem.id} className={`chat-line ${mine ? 'chat-line-mine' : ''}`}>
            <div className="chat-bubble">
              <div className="chat-author">
                {mensagem.autor_tipo === 'suporte' && <img src="/logo.svg" alt="" aria-hidden="true" className="marca-mini marca-mini-sm" />}
                {mensagem.autor_nome || (mensagem.autor_tipo === 'suporte' ? 'Suporte WebCond' : 'Sindico')}
                <span>{formatWhen(mensagem.created_at)}</span>
              </div>
              <p>{mensagem.mensagem}</p>
              {(mensagem.anexos || []).length > 0 && (
                <div className="support-files" style={{ marginTop: 8 }}>
                  {mensagem.anexos.map((anexo) => (
                    <button key={anexo.path} type="button" className="support-file support-file-link" onClick={() => onAttachment?.(anexo)}>
                      {anexo.tipo === 'application/pdf' ? <FileText size={12} /> : <ImageIcon size={12} />} {anexo.nome}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )
      })}
      <div ref={endRef} />
    </div>
  )
}
