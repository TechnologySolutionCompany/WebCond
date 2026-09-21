import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Building2, CheckCircle2, Eye, EyeOff, ShieldCheck, TriangleAlert } from 'lucide-react'
import { fetchSignupInfo, submitSignup } from '../lib/signupApi'
import { normalizeCpf } from '../lib/cpf'

// Pagina publica do auto-cadastro. Quem preenche e sempre o proprietario: o condominio vem do
// token do link e nunca aparece como campo, entao nao existe forma de errar o condominio aqui.

const SITUACOES = [
  { value: 'ocupada', label: 'Morando', detail: 'Voce mora na unidade' },
  { value: 'alugada', label: 'Alugado', detail: 'Ha um inquilino morando' },
  { value: 'desocupada', label: 'Desocupado', detail: 'Ninguem morando no momento' },
]

const emptyPerson = { nome: '', cpf: '', whatsapp: '', email: '', password: '', confirmacao: '' }
const emptyForm = {
  situacao: 'ocupada',
  apartamento: '',
  proprietario: emptyPerson,
  inquilino: emptyPerson,
  inquilinoAcesso: false,
  aceite: false,
}

function maskCpfInput(value) {
  const digits = normalizeCpf(value).slice(0, 11)
  return digits
    .replace(/^(\d{3})(\d)/, '$1.$2')
    .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d{1,2})$/, '.$1-$2')
}

function maskPhoneInput(value) {
  const digits = String(value || '').replace(/\D/g, '').slice(0, 11)
  if (digits.length <= 2) return digits
  if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`
}

function PersonFields({ id, person, onChange, showEmail, showPassword, passwordLabel, passwordHint }) {
  const [showPass, setShowPass] = useState(false)
  const update = (field, value) => onChange({ ...person, [field]: value })

  return (
    <div className="signup-grid">
      <div className="form-group signup-full">
        <label className="form-label" htmlFor={`${id}-nome`}>Nome completo</label>
        <input
          id={`${id}-nome`}
          className="input"
          value={person.nome}
          onChange={(event) => update('nome', event.target.value)}
          placeholder="Como no documento"
          autoComplete="off"
          maxLength={120}
        />
      </div>

      <div className="form-group">
        <label className="form-label" htmlFor={`${id}-cpf`}>CPF</label>
        <input
          id={`${id}-cpf`}
          className="input"
          value={person.cpf}
          onChange={(event) => update('cpf', maskCpfInput(event.target.value))}
          placeholder="000.000.000-00"
          inputMode="numeric"
        />
      </div>

      <div className="form-group">
        <label className="form-label" htmlFor={`${id}-whatsapp`}>WhatsApp</label>
        <input
          id={`${id}-whatsapp`}
          className="input"
          value={person.whatsapp}
          onChange={(event) => update('whatsapp', maskPhoneInput(event.target.value))}
          placeholder="(00) 00000-0000"
          inputMode="tel"
        />
      </div>

      {showEmail && (
        <div className="form-group signup-full">
          <label className="form-label" htmlFor={`${id}-email`}>E-mail (opcional)</label>
          <input
            id={`${id}-email`}
            className="input"
            type="email"
            value={person.email}
            onChange={(event) => update('email', event.target.value)}
            placeholder="voce@exemplo.com"
            autoComplete="off"
          />
        </div>
      )}

      {showPassword && (
        <>
          <div className="form-group">
            <label className="form-label" htmlFor={`${id}-senha`}>{passwordLabel}</label>
            <div className="signup-password">
              <input
                id={`${id}-senha`}
                className="input"
                type={showPass ? 'text' : 'password'}
                value={person.password}
                onChange={(event) => update('password', event.target.value)}
                placeholder="Minimo de 6 caracteres"
                autoComplete="new-password"
              />
              <button
                type="button"
                className="btn btn-ghost btn-icon"
                onClick={() => setShowPass((current) => !current)}
                aria-label={showPass ? 'Ocultar senha' : 'Mostrar senha'}
              >
                {showPass ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor={`${id}-confirmacao`}>Repita a senha</label>
            <input
              id={`${id}-confirmacao`}
              className="input"
              type={showPass ? 'text' : 'password'}
              value={person.confirmacao}
              onChange={(event) => update('confirmacao', event.target.value)}
              autoComplete="new-password"
            />
          </div>

          {passwordHint && <p className="signup-hint signup-full">{passwordHint}</p>}
        </>
      )}
    </div>
  )
}

export default function AutoCadastro() {
  const { token = '' } = useParams()
  const [state, setState] = useState('loading')
  const [condominio, setCondominio] = useState('')
  const [blockMessage, setBlockMessage] = useState('')
  const [form, setForm] = useState(emptyForm)
  const [error, setError] = useState('')
  const [sending, setSending] = useState(false)

  useEffect(() => {
    document.title = 'Cadastro de morador | WebCond'
    return () => { document.title = 'WebCond' }
  }, [])

  useEffect(() => {
    let active = true

    fetchSignupInfo(token)
      .then((info) => {
        if (!active) return
        setCondominio(info.condominio || '')
        setState('form')
      })
      .catch((infoError) => {
        if (!active) return
        setBlockMessage(infoError.message || 'Nao foi possivel abrir este link de cadastro.')
        setState('blocked')
      })

    return () => { active = false }
  }, [token])

  const update = useCallback((field, value) => {
    setForm((current) => ({ ...current, [field]: value }))
  }, [])

  const alugado = form.situacao === 'alugada'
  // Imovel desocupado: so nome, CPF e WhatsApp do proprietario.
  const desocupado = form.situacao === 'desocupada'

  const localError = useMemo(() => {
    const checkPerson = (person, rotulo, { senha }) => {
      if (person.nome.trim().length < 3) return `Informe o nome completo do ${rotulo}.`
      if (normalizeCpf(person.cpf).length !== 11) return `Informe um CPF valido para o ${rotulo}.`
      if (String(person.whatsapp).replace(/\D/g, '').length < 10) return `Informe um WhatsApp com DDD para o ${rotulo}.`
      if (senha && person.password.length < 6) return `A senha do ${rotulo} precisa ter pelo menos 6 caracteres.`
      if (senha && person.password !== person.confirmacao) return `As senhas do ${rotulo} nao sao iguais.`
      return ''
    }

    if (!form.apartamento.trim()) return 'Informe o numero da unidade.'
    const dono = checkPerson(form.proprietario, 'proprietario', { senha: true })
    if (dono) return dono
    if (alugado) {
      const inquilino = checkPerson(form.inquilino, 'inquilino', { senha: form.inquilinoAcesso })
      if (inquilino) return inquilino
      if (normalizeCpf(form.inquilino.cpf) === normalizeCpf(form.proprietario.cpf)) {
        return 'O CPF do inquilino precisa ser diferente do CPF do proprietario.'
      }
    }
    if (!form.aceite) return 'E preciso aceitar os termos para continuar.'
    return ''
  }, [form, alugado])

  const handleSubmit = async (event) => {
    event.preventDefault()

    if (localError) {
      setError(localError)
      return
    }

    setSending(true)
    setError('')

    try {
      await submitSignup({
        token,
        situacao: form.situacao,
        apartamento: form.apartamento,
        proprietario: {
          nome: form.proprietario.nome,
          cpf: form.proprietario.cpf,
          whatsapp: form.proprietario.whatsapp,
          email: desocupado ? '' : form.proprietario.email,
          password: form.proprietario.password,
        },
        inquilino: alugado
          ? {
              nome: form.inquilino.nome,
              cpf: form.inquilino.cpf,
              whatsapp: form.inquilino.whatsapp,
              email: form.inquilino.email,
              password: form.inquilinoAcesso ? form.inquilino.password : '',
              acesso: form.inquilinoAcesso,
            }
          : null,
        aceite: form.aceite,
      })
      setForm(emptyForm)
      setState('sent')
    } catch (submitError) {
      setError(submitError.message || 'Nao foi possivel enviar seu cadastro.')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="policy-page signup-page">
      <header className="policy-topbar">
        <Link to="/" className="policy-brand">
          <ArrowLeft size={16} />
          <img src="/logo.png" alt="" aria-hidden="true" />
          <span><span className="policy-brand-web">Web</span><span className="policy-brand-cond">Cond</span></span>
        </Link>
        <nav className="policy-topbar-nav">
          <Link to="/politicas/privacidade">Privacidade</Link>
          <Link to="/politicas/seguranca">Seguranca</Link>
        </nav>
      </header>

      <div className="signup-shell">
        {state === 'loading' && (
          <div className="signup-card signup-centered">
            <div className="spinner" />
            <p className="signup-muted">Abrindo o link de cadastro...</p>
          </div>
        )}

        {state === 'blocked' && (
          <div className="signup-card signup-centered">
            <TriangleAlert size={36} className="signup-icon-warn" />
            <h1 className="signup-title">Link indisponivel</h1>
            <p className="signup-muted">{blockMessage}</p>
            <Link to="/" className="btn btn-primary">Ir para a tela de entrada</Link>
          </div>
        )}

        {state === 'sent' && (
          <div className="signup-card signup-centered">
            <CheckCircle2 size={36} className="signup-icon-ok" />
            <h1 className="signup-title">Cadastro enviado</h1>
            <p className="signup-muted">
              O sindico de {condominio || 'seu condominio'} vai conferir os dados e liberar o acesso.
              Assim que ele aprovar, voce entra no WebCond com o seu CPF e a senha que acabou de escolher.
            </p>
            <Link to="/" className="btn btn-primary">Ir para a tela de entrada</Link>
          </div>
        )}

        {state === 'form' && (
          <form className="signup-card" onSubmit={handleSubmit}>
            <div className="signup-condo">
              <Building2 size={16} />
              <div>
                <span className="signup-condo-label">Cadastro de morador</span>
                <strong>{condominio}</strong>
              </div>
            </div>

            <div className="signup-grid">
              <div className="form-group">
                <label className="form-label" htmlFor="apartamento">Unidade</label>
                <input
                  id="apartamento"
                  className="input"
                  value={form.apartamento}
                  onChange={(event) => update('apartamento', event.target.value)}
                  placeholder="101"
                  maxLength={20}
                />
              </div>
            </div>

            <div className="signup-section">
              <div className="form-label">Situacao do imovel</div>
              <div className="signup-options">
                {SITUACOES.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    className={`signup-option ${form.situacao === option.value ? 'signup-option-on' : ''}`}
                    aria-pressed={form.situacao === option.value}
                    onClick={() => update('situacao', option.value)}
                  >
                    <strong>{option.label}</strong>
                    <span>{option.detail}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="signup-section">
              <div className="form-label">Proprietario</div>
              <PersonFields
                id="dono"
                person={form.proprietario}
                onChange={(person) => update('proprietario', person)}
                showEmail={!desocupado}
                showPassword
                passwordLabel="Senha de acesso"
              />
            </div>

            {alugado && (
              <div className="signup-section">
                <div className="form-label">Inquilino</div>
                <p className="signup-hint">
                  O cadastro do inquilino e responsabilidade do proprietario, nao do sindico.
                </p>

                <PersonFields
                  id="inquilino"
                  person={form.inquilino}
                  onChange={(person) => update('inquilino', person)}
                  showEmail
                  showPassword={form.inquilinoAcesso}
                  passwordLabel="Senha do inquilino"
                  passwordHint="O inquilino entra com o CPF dele e esta senha. Para troca-la depois, ele pede a alteracao no perfil e o sindico envia a nova senha."
                />

                <label className="signup-consent signup-toggle">
                  <input
                    type="checkbox"
                    checked={form.inquilinoAcesso}
                    onChange={(event) => update('inquilinoAcesso', event.target.checked)}
                  />
                  <span>
                    O inquilino vai ter acesso a plataforma?
                    <em> Sem acesso, ele fica cadastrado na unidade mas nao entra no sistema.</em>
                  </span>
                </label>
              </div>
            )}

            <label className="signup-consent">
              <input
                type="checkbox"
                checked={form.aceite}
                onChange={(event) => update('aceite', event.target.checked)}
              />
              <span>
                Li e aceito os <Link to="/politicas/privacidade" target="_blank">termos de uso e a politica de privacidade</Link>.
                Os dados serao usados apenas para a administracao do condominio.
              </span>
            </label>

            {error && <div className="signup-error">{error}</div>}

            <button type="submit" className="btn btn-primary signup-submit" disabled={sending}>
              {sending ? <><span className="spinner" /> Enviando...</> : 'Enviar cadastro'}
            </button>

            <p className="signup-note">
              <ShieldCheck size={13} /> As senhas sao criptografadas e nem o sindico consegue ve-las.
            </p>
          </form>
        )}
      </div>
    </div>
  )
}
