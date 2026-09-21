import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'

// O WebCond usa somente cookies essenciais (manter voce conectado). Nao ha rastreamento,
// entao a barra e um aviso, nao uma escolha falsa entre aceitar e recusar.
// So aparece nas telas publicas: quem esta dentro do sistema ve o aceite completo.
const LOCAL_KEY = 'webcond:cookies'

function alreadySeen() {
  try {
    return window.localStorage.getItem(LOCAL_KEY) === 'ok'
  } catch {
    return false
  }
}

export default function CookieBar() {
  const { user, loading } = useAuth()
  const [hidden, setHidden] = useState(() => alreadySeen())

  if (hidden || loading || user) return null

  const dismiss = () => {
    try {
      window.localStorage.setItem(LOCAL_KEY, 'ok')
    } catch {
      // Sem armazenamento local o aviso volta na proxima visita.
    }
    setHidden(true)
  }

  return (
    <div className="cookie-bar" role="region" aria-label="Aviso de cookies">
      <span>
        Usamos apenas cookies essenciais para manter voce conectado. Sem rastreamento e sem
        publicidade. <Link to="/politicas/cookies">Saiba mais</Link>.
      </span>
      <button type="button" className="btn btn-primary btn-sm" onClick={dismiss}>Entendi</button>
    </div>
  )
}
