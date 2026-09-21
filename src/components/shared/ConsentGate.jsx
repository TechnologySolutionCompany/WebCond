import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ShieldCheck } from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import { supabase } from '../../lib/supabase'
import { POLICY_VERSION } from '../../lib/politicas'

// Aceite dos termos por quem ja tinha conta antes desta versao das politicas.
// Quem se cadastra pelo link ja aceita no proprio formulario.
const LOCAL_KEY = 'webcond:aceite'

function readLocalAcceptance() {
  try {
    return window.localStorage.getItem(LOCAL_KEY) || ''
  } catch {
    return ''
  }
}

function rememberLocally(version) {
  try {
    window.localStorage.setItem(LOCAL_KEY, version)
  } catch {
    // Navegador sem armazenamento local: o aceite so fica no banco.
  }
}

export default function ConsentGate() {
  const { user, profile, refreshProfile } = useAuth()
  const [saving, setSaving] = useState(false)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    setDismissed(false)
  }, [user?.id])

  if (!user || !profile) return null
  if (dismissed) return null
  if (profile.aceite_versao === POLICY_VERSION) return null
  if (readLocalAcceptance() === POLICY_VERSION) return null

  const handleAccept = async () => {
    setSaving(true)
    const { error } = await supabase
      .from('profiles')
      .update({ aceite_versao: POLICY_VERSION, aceite_em: new Date().toISOString() })
      .eq('id', user.id)

    // Coluna ainda nao criada no banco, ou plano vencido (painel somente leitura):
    // o aceite fica registrado no navegador para nao travar quem ja usa o sistema.
    if (error) rememberLocally(POLICY_VERSION)
    else await refreshProfile()

    setSaving(false)
    setDismissed(true)
  }

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="consent-title">
      <div className="modal" style={{ maxWidth: 520 }}>
        <div className="modal-header">
          <div className="modal-title" id="consent-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <ShieldCheck size={18} style={{ color: 'var(--green)' }} /> Uso da plataforma e seus dados
          </div>
        </div>

        <p className="consent-text">
          O WebCond guarda seus dados apenas para administrar o condominio: cadastro da unidade,
          cobrancas, avisos, documentos e ocorrencias.
        </p>

        <ul className="consent-list">
          <li>Seus dados nao sao vendidos nem usados para publicidade.</li>
          <li>Quem ve seu cadastro e a administracao do seu condominio, e mais ninguem.</li>
          <li>Voce pode pedir correcao ou exclusao dos seus dados ao sindico a qualquer momento.</li>
        </ul>

        <p className="consent-text" style={{ marginTop: 14 }}>
          Detalhes na <Link to="/politicas/privacidade" target="_blank">Politica de Privacidade</Link>,
          na <Link to="/politicas/seguranca" target="_blank">Seguranca</Link> e
          nos <Link to="/politicas/cookies" target="_blank">Cookies</Link>.
        </p>

        <div className="modal-footer">
          <button type="button" className="btn btn-primary" onClick={handleAccept} disabled={saving}>
            {saving ? 'Registrando...' : 'Li e aceito'}
          </button>
        </div>
      </div>
    </div>
  )
}
