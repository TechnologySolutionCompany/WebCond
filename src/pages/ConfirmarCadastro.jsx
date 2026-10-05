import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { CheckCircle, Loader2, TriangleAlert } from 'lucide-react'
import { TRIAL_PERIOD_DAYS } from '../lib/condominiumPlan'

// /confirmar-cadastro#token=... (v1.09A5): destino do botao "Confirmar cadastro" do e-mail de
// boas-vindas. O token vem no fragmento (#), que o navegador nao manda para servidor nenhum;
// esta tela o envia no corpo do POST e logo o apaga da barra de endereco.
function lerToken() {
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''))
  return hash.get('token') || ''
}

export default function ConfirmarCadastro() {
  const [estado, setEstado] = useState({ fase: 'confirmando', mensagem: '', condominio: '' })
  const enviado = useRef(false)

  useEffect(() => {
    // StrictMode monta duas vezes em desenvolvimento: a confirmacao sai uma vez so.
    if (enviado.current) return
    enviado.current = true

    const token = lerToken()
    window.history.replaceState(window.history.state, '', window.location.pathname)
    if (!token) {
      setEstado({ fase: 'erro', mensagem: 'Link incompleto. Abra de novo o botao "Confirmar cadastro" do e-mail.' })
      return
    }

    void (async () => {
      try {
        const response = await fetch('/api/auth/confirmar-cadastro', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        })
        const result = await response.json().catch(() => ({}))
        if (!response.ok) throw new Error(result.error || 'Nao foi possivel confirmar o cadastro.')
        setEstado({ fase: result.alreadyConfirmed ? 'ja' : 'ok', condominio: result.condominiumName || '' })
      } catch (error) {
        setEstado({ fase: 'erro', mensagem: error.message || 'Nao foi possivel confirmar o cadastro.' })
      }
    })()
  }, [])

  return (
    <div className="confirmar-page">
      <div className="confirmar-card">
        <img src="/logo.png" alt="" aria-hidden="true" className="confirmar-logo" />
        <div className="confirmar-marca"><span className="sobre-web">Web</span><span className="sobre-cond">Cond</span></div>

        {estado.fase === 'confirmando' && (
          <>
            <Loader2 size={36} className="confirmar-spin" />
            <p>Confirmando seu cadastro...</p>
          </>
        )}

        {(estado.fase === 'ok' || estado.fase === 'ja') && (
          <>
            <CheckCircle size={44} color="var(--green)" />
            <h1>{estado.fase === 'ok' ? 'Cadastro confirmado!' : 'Cadastro ja confirmado'}</h1>
            <p>
              {estado.condominio ? <><strong>{estado.condominio}</strong> esta liberado. </> : null}
              {estado.fase === 'ok'
                ? `Seu teste gratis de ${TRIAL_PERIOD_DAYS} dias comecou agora. Entre com o e-mail e a senha que voce cadastrou e comece pelas unidades e moradores.`
                : 'E so entrar com o e-mail e a senha que voce cadastrou.'}
            </p>
            <Link to="/" className="btn btn-primary confirmar-btn">Entrar no WebCond</Link>
          </>
        )}

        {estado.fase === 'erro' && (
          <>
            <TriangleAlert size={40} color="var(--orange)" />
            <h1>Nao deu para confirmar</h1>
            <p>{estado.mensagem}</p>
            <Link to="/" className="btn btn-primary confirmar-btn">Ir para a tela inicial</Link>
          </>
        )}
      </div>
    </div>
  )
}
