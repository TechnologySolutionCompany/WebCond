import { useState } from 'react'
import { LogOut, Mail, Save } from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import { useToast } from './Toast'
import { changeMyLoginEmail } from '../../lib/tenantApi'
import { isValidLoginEmail, normalizeLoginEmail, precisaCadastrarEmail } from '../../lib/loginEmail'

// E-mail de acesso obrigatorio (v2.10A1). Quem entrou pelo CPF/CNPJ e ainda nao tem e-mail
// cadastra um aqui antes de usar o sistema. Nao tem "agora nao": so cadastrar ou sair.
// A troca usa a mesma rota do perfil (/api/tenant/account-email), que vale para qualquer papel e
// exige a senha atual: um computador esquecido logado nao vira troca de credencial.
export default function EmailObrigatorio() {
  const { profile, refreshProfile, signOut } = useAuth()
  const { toast } = useToast()
  const [email, setEmail] = useState('')
  const [senhaAtual, setSenhaAtual] = useState('')
  const [saving, setSaving] = useState(false)

  if (!precisaCadastrarEmail(profile)) return null

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (!isValidLoginEmail(email)) {
      toast('Informe um e-mail valido.', 'error')
      return
    }
    if (!senhaAtual) {
      toast('Informe a sua senha atual.', 'error')
      return
    }
    setSaving(true)
    try {
      await changeMyLoginEmail({ email: normalizeLoginEmail(email), senhaAtual })
      await refreshProfile()
      toast('E-mail cadastrado. Da proxima vez, entre com ele.', 'success')
    } catch (error) {
      toast(error.message || 'Nao foi possivel salvar o e-mail.', 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal-overlay email-obrigatorio" role="dialog" aria-modal="true" aria-labelledby="email-obrigatorio-titulo">
      <form className="modal" style={{ maxWidth: 440 }} onSubmit={handleSubmit}>
        <div className="email-obrigatorio-icone"><Mail size={22} /></div>
        <div id="email-obrigatorio-titulo" className="modal-title">Cadastre seu e-mail de acesso</div>
        <p className="email-obrigatorio-texto">
          A partir desta versao, voce entra no WebCond pelo <strong>e-mail</strong>. O CPF/CNPJ fica so para
          quem esquecer o e-mail. Leva menos de um minuto e voce so faz isso uma vez.
        </p>

        <div className="form-group">
          <label className="form-label" htmlFor="email-obrigatorio">Seu e-mail</label>
          <input
            id="email-obrigatorio"
            className="input"
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            spellCheck={false}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="voce@exemplo.com"
            required
          />
        </div>
        <div className="form-group">
          <label className="form-label" htmlFor="email-obrigatorio-senha">Sua senha atual</label>
          <input
            id="email-obrigatorio-senha"
            className="input"
            type="password"
            autoComplete="current-password"
            value={senhaAtual}
            onChange={(event) => setSenhaAtual(event.target.value)}
            placeholder="A mesma que voce acabou de usar"
            required
          />
          <span className="profile-hint">Confirma que e voce. A senha continua a mesma.</span>
        </div>

        <div className="me-actions">
          <button type="button" className="btn btn-ghost" onClick={() => void signOut()} disabled={saving}>
            <LogOut size={14} /> Sair
          </button>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            <Save size={14} /> {saving ? 'Salvando...' : 'Salvar e continuar'}
          </button>
        </div>
      </form>
    </div>
  )
}
