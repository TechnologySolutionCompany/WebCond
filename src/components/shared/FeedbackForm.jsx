import { useState } from 'react'
import { MessageSquareHeart, Send, Star } from 'lucide-react'
import { useToast } from './Toast'
import { CATEGORIAS_FEEDBACK } from '../../lib/feedback'
import { APP_VERSION } from '../../lib/appVersion'

const MAX = 2000

// Suporte > Feedback (v1.09A5): qualquer perfil manda a opiniao direto para a administracao
// da plataforma (TSCBr). `send` e a funcao de API do perfil (morador ou sindico/contador).
export default function FeedbackForm({ send, pagina = '' }) {
  const { toast } = useToast()
  const [categoria, setCategoria] = useState('sugestao')
  const [nota, setNota] = useState(0)
  const [mensagem, setMensagem] = useState('')
  const [sending, setSending] = useState(false)
  const [enviado, setEnviado] = useState(false)

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (mensagem.trim().length < 5) {
      toast('Escreva pelo menos uma frase.', 'error')
      return
    }
    setSending(true)
    try {
      await send({ categoria, nota: nota || null, mensagem: mensagem.trim(), pagina, versao: APP_VERSION })
      setMensagem('')
      setNota(0)
      setEnviado(true)
      toast('Feedback enviado. Obrigado!', 'success')
    } catch (error) {
      toast(error.message || 'Nao foi possivel enviar o feedback.', 'error')
    } finally {
      setSending(false)
    }
  }

  return (
    <form className="me-panel feedback-form" onSubmit={handleSubmit}>
      <div className="feedback-intro">
        <MessageSquareHeart size={18} />
        <span>
          Conte o que achou do WebCond: o que ajudou, o que atrapalhou, o que falta. Vai direto para a
          equipe que desenvolve o sistema. Para assuntos do seu condominio, fale com o sindico(a).
        </span>
      </div>

      <div className="form-group">
        <span className="form-label">Assunto</span>
        <div className="feedback-chips" role="radiogroup" aria-label="Assunto do feedback">
          {CATEGORIAS_FEEDBACK.map((item) => (
            <button
              key={item.key}
              type="button"
              role="radio"
              aria-checked={categoria === item.key}
              className={`btn btn-sm ${categoria === item.key ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setCategoria(item.key)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <div className="form-group">
        <span className="form-label">Nota para o WebCond (opcional)</span>
        <div className="feedback-stars" role="radiogroup" aria-label="Nota de 1 a 5">
          {[1, 2, 3, 4, 5].map((value) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={nota === value}
              aria-label={`${value} de 5`}
              className={value <= nota ? 'ativa' : ''}
              onClick={() => setNota(nota === value ? 0 : value)}
            >
              <Star size={22} />
            </button>
          ))}
        </div>
      </div>

      <div className="form-group">
        <label className="form-label" htmlFor="feedback-mensagem">Mensagem</label>
        <textarea
          id="feedback-mensagem"
          className="input"
          rows={5}
          maxLength={MAX}
          value={mensagem}
          onChange={(event) => { setMensagem(event.target.value); setEnviado(false) }}
          placeholder="Escreva aqui..."
        />
        <span className="profile-hint">{mensagem.length}/{MAX}</span>
      </div>

      {enviado && <div className="feedback-ok">Recebemos seu feedback. Obrigado por ajudar a melhorar o WebCond!</div>}

      <div className="me-actions">
        <button type="submit" className="btn btn-primary" disabled={sending || mensagem.trim().length < 5}>
          <Send size={14} /> {sending ? 'Enviando...' : 'Enviar feedback'}
        </button>
      </div>
    </form>
  )
}
