import { useEffect, useMemo, useState } from 'react'
import { InstallAppButton } from '../components/shared/InstallApp'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import {
  ArrowRight,
  Building,
  Building2,
  CheckCircle,
  Info,
  Eye,
  EyeOff,
  IdCard,
  Loader2,
  LockKeyhole,
  Mail,
  Moon,
  ShieldCheck,
  Sun,
  X,
} from 'lucide-react'
import { CONDOMINIUM_EMAIL_PENDING_CODE, useAuth } from '../hooks/useAuth'
import { useTheme } from '../hooks/useTheme'
import { getHomePathForRole } from '../lib/auth'
import { buscarContatoParaTrocaDeSenha, resendSignupConfirmation, signInWithDocument, signInWithEmail } from '../lib/authApi'
import { LOGIN_MODE_INICIAL, LOGIN_MODES } from '../lib/loginEmail'
import { formatCpf, normalizeCpf } from '../lib/cpf'
import { formatCpfCnpj, getCpfCnpjType, normalizeCpfCnpj } from '../lib/document'
import { registerCondominium } from '../lib/platformApi'
import AddressFields from '../components/shared/AddressFields'
import SiteFooter from '../components/shared/SiteFooter'
import WhatsAppIcon from '../components/shared/WhatsAppIcon'
import { MSG_PLANOS, whatsappUrl } from '../lib/contato'
import { APP_VERSION } from '../lib/appVersion'
import { TRIAL_PERIOD_DAYS } from '../lib/condominiumPlan'
import { composeAddress, emptyAddress, sanitizeAddress } from '../lib/address'

const emptyCondominiumForm = {
  name: '',
  cnpj: '',
  addressDetails: emptyAddress,
  whatsapp: '',
  unitCount: '',
  pixKey: '',
  bankDestination: '',
  syndicName: '',
  syndicCpf: '',
  syndicEmail: '',
  subSyndicName: '',
  subSyndicWhatsapp: '',
  password: '',
}

export default function Landing() {
  const { themeMode, setTheme } = useTheme()
  const S = useMemo(() => buildStyles(PALETTES[themeMode] || PALETTES.dark), [themeMode])
  const [searchParams, setSearchParams] = useSearchParams()
  const [tab, setTab] = useState(searchParams.get('cadastro') === 'condominio' ? 'condominio' : 'login')
  // v2.10A1: o login SEMPRE abre no e-mail. CPF/CNPJ so para quem esqueceu o e-mail (nao fica
  // lembrado); quem entra assim e ainda nao tem e-mail cadastra um logo em seguida.
  const [loginMode, setLoginMode] = useState(LOGIN_MODE_INICIAL)
  const [email, setEmail] = useState('')
  const [cpf, setCpf] = useState('')
  const [pass, setPass] = useState('')
  const [showPass, setShowPass] = useState(false)
  // "Esqueci a senha" (v2.10A2): so no login por CPF. Abre o pedido de troca ao sindico pelo WhatsApp.
  const [ajudaSenha, setAjudaSenha] = useState({ aberta: false, buscando: false })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [condominiumForm, setCondominiumForm] = useState(emptyCondominiumForm)
  const [successMode, setSuccessMode] = useState('')
  const [registerResult, setRegisterResult] = useState(null)
  const { user, loading: authLoading, resolvedRole, authIssue, authIssueCode, sessionNotice, signOut } = useAuth()
  const [resendState, setResendState] = useState({ sending: false, message: '' })
  const navigate = useNavigate()
  const hasBlockedSession = !authLoading && user && !resolvedRole && authIssue

  useEffect(() => {
    if (!authLoading && user && resolvedRole) {
      navigate(getHomePathForRole(resolvedRole), { replace: true })
    }
  }, [authLoading, user, resolvedRole, navigate])

  // O link "Cadastrar condominio" do rodape aponta para /?cadastro=condominio. Como a tela ja
  // esta montada, e este efeito que abre o cadastro quando o endereco muda.
  useEffect(() => {
    if (searchParams.get('cadastro') === 'condominio') setTab('condominio')
  }, [searchParams])

  useEffect(() => {
    if (hasBlockedSession) {
      setError(authIssue)
    }
  }, [authIssue, hasBlockedSession])

  const handleLogin = async (event) => {
    event.preventDefault()
    setLoading(true)
    setError('')

    try {
      if (loginMode === LOGIN_MODES.email) {
        await signInWithEmail(email, pass)
        return
      }

      const normalizedDocument = normalizeCpfCnpj(cpf)
      if (!getCpfCnpjType(normalizedDocument)) {
        setError('Informe um CPF ou CNPJ valido.')
        return
      }

      await signInWithDocument(normalizedDocument, pass)
    } catch (loginError) {
      setError(loginError.message || 'Nao foi possivel entrar.')
    } finally {
      setLoading(false)
    }
  }

  const switchLoginMode = (mode) => {
    setLoginMode(mode)
    setError('')
    setAjudaSenha({ aberta: false, buscando: false })
  }

  // Quem troca a senha do morador e o sindico (em Unidades). O servidor diz para qual WhatsApp
  // pedir: o do condominio da pessoa ou, se nao der para saber, o suporte da TSCBr.
  const pedirTrocaDeSenha = async () => {
    const documento = normalizeCpfCnpj(cpf)
    if (getCpfCnpjType(documento) !== 'cpf') {
      setError('Digite o seu CPF acima para pedir a troca de senha.')
      return
    }
    setError('')
    setAjudaSenha((atual) => ({ ...atual, buscando: true }))
    try {
      const contato = await buscarContatoParaTrocaDeSenha(documento)
      const mensagem = contato.destino === 'sindico'
        ? `Ola, sindico(a)! Esqueci minha senha do WebCond. Pode cadastrar uma nova senha para mim? Meu CPF termina em ${documento.slice(-2)}.`
        : 'Ola! Esqueci minha senha do WebCond e preciso de ajuda para voltar a acessar.'
      // Navega na mesma aba: no celular abre o app do WhatsApp (janela nova apos "await" e bloqueada).
      window.location.href = `https://wa.me/${contato.whatsapp}?text=${encodeURIComponent(mensagem)}`
    } catch (contatoError) {
      setError(contatoError.message || 'Nao foi possivel buscar o contato agora.')
    } finally {
      setAjudaSenha((atual) => ({ ...atual, buscando: false }))
    }
  }

  const handleCondominiumRegister = async (event) => {
    event.preventDefault()

    const payload = {
      name: condominiumForm.name,
      cnpj: normalizeCpfCnpj(condominiumForm.cnpj),
      addressDetails: sanitizeAddress(condominiumForm.addressDetails),
      whatsapp: condominiumForm.whatsapp,
      unitCount: Number(condominiumForm.unitCount || 0),
      pixKey: condominiumForm.pixKey,
      bankDestination: condominiumForm.bankDestination,
      syndicName: condominiumForm.syndicName,
      syndicCpf: normalizeCpf(condominiumForm.syndicCpf),
      syndicEmail: condominiumForm.syndicEmail,
      subSyndicName: condominiumForm.subSyndicName,
      subSyndicWhatsapp: condominiumForm.subSyndicWhatsapp,
      password: condominiumForm.password,
    }
    const address = payload.addressDetails

    if (!payload.name || !payload.cnpj || !composeAddress(address) || address.zip_code.length !== 8 || !address.number || !address.city || !payload.whatsapp || !payload.syndicName || !payload.syndicCpf || !payload.syndicEmail || !payload.password) {
      setError('Preencha os dados do condominio e do sindico responsavel.')
      return
    }

    if (payload.unitCount < 1) {
      setError('Informe a quantidade de unidades do condominio.')
      return
    }

    if (!getCpfCnpjType(payload.cnpj)) {
      setError('Informe um CPF ou CNPJ valido para o condominio.')
      return
    }

    if (payload.syndicCpf.length !== 11) {
      setError('Informe um CPF valido para o sindico.')
      return
    }

    if (payload.password.length < 6) {
      setError('A senha inicial precisa ter pelo menos 6 caracteres.')
      return
    }

    setLoading(true)
    setError('')

    try {
      const result = await registerCondominium(payload)
      setRegisterResult({ ...result, email: payload.syndicEmail })
      setSuccessMode('condominio')
    } catch (submissionError) {
      setError(submissionError.message || 'Erro ao enviar solicitacao.')
    } finally {
      setLoading(false)
    }
  }

  const closeCondominiumModal = () => {
    setTab('login')
    setError('')
    if (searchParams.get('cadastro')) setSearchParams({}, { replace: true })
  }

  if (successMode) {
    return (
      <div style={{ ...S.root, flexDirection: 'column' }} className="landing-root">
        <button
          type="button"
          style={S.themeToggle}
          onClick={() => setTheme(themeMode === 'light' ? 'dark' : 'light')}
          title={themeMode === 'light' ? 'Usar tema escuro' : 'Usar tema claro'}
          aria-label={themeMode === 'light' ? 'Usar tema escuro' : 'Usar tema claro'}
        >
          {themeMode === 'light' ? <Moon size={16} /> : <Sun size={16} />}
        </button>
        <div style={S.center}>
          <style>{RESPONSIVE_STYLES}</style>
          <div style={S.successCard}>
            <img src={themeMode === 'light' ? '/brand/wc-logo-slogan-claro.svg' : '/brand/wc-logo-slogan-escuro.svg'} alt="WebCond" style={S.successLogo} />
            <CheckCircle size={48} color={S.brandGreen.color} style={{ margin: '0 auto 18px' }} />
            <div style={S.successTitle}>Condominio cadastrado!</div>
            {registerResult?.emailSent ? (
              <div style={S.successText}>
                Enviamos uma mensagem para <strong style={S.pageText}>{registerResult.email}</strong>.
                Abra o e-mail e toque em <strong style={S.pageText}>Confirmar cadastro</strong>: o acesso de
                sindico(a) e liberado na hora, com {TRIAL_PERIOD_DAYS} dias de teste gratis.
                <span style={{ display: 'block', marginTop: 10, fontSize: 12 }}>Nao chegou? Confira a caixa de spam ou de promocoes.</span>
              </div>
            ) : (
              <div style={S.successText}>
                O cadastro foi recebido. Assim que a plataforma liberar o condominio, voce entra com o e-mail e a
                senha que acabou de cadastrar e ja comeca o teste gratis de {TRIAL_PERIOD_DAYS} dias.
              </div>
            )}
            <button
              className="landing-primary-button"
              style={{ ...S.btnBase, ...S.primaryBtn, width: '100%' }}
              onClick={() => {
                setSuccessMode('')
                setRegisterResult(null)
                setTab('login')
                setCondominiumForm(emptyCondominiumForm)
                if (searchParams.get('cadastro')) setSearchParams({}, { replace: true })
              }}
            >
              Voltar ao login
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={S.root} className="landing-root">
      {/* Redesign v2.10A3: no computador, painel escuro com a marca; no celular so o formulario. */}
      <aside className="landing-hero" style={S.hero}>
        <img src="/brand/wc-simbolo.svg" alt="" aria-hidden="true" style={S.heroWatermark} />
        <img src="/brand/wc-logo-slogan-escuro.svg" alt="WebCond" style={S.heroLogo} />
        <div style={{ position: 'relative', maxWidth: 420 }}>
          <div style={S.heroTitle}>O condomínio inteiro em um só app.</div>
          <div style={S.heroText}>Cobranças, avisos, documentos e ocorrências para síndicos e moradores.</div>
        </div>
        <div style={S.heroFoot}>© TSCBr · versão {APP_VERSION}</div>
      </aside>

      <div style={S.formSide}>
      {/* Com o cadastro aberto o botao de tema sairia por cima do "fechar" do formulario. */}
      {tab !== 'condominio' && (
        <button
          type="button"
          style={S.themeToggle}
          onClick={() => setTheme(themeMode === 'light' ? 'dark' : 'light')}
          title={themeMode === 'light' ? 'Usar tema escuro' : 'Usar tema claro'}
          aria-label={themeMode === 'light' ? 'Usar tema escuro' : 'Usar tema claro'}
        >
          {themeMode === 'light' ? <Moon size={16} /> : <Sun size={16} />}
        </button>
      )}

      <div style={S.center}>
        <style>{RESPONSIVE_STYLES}</style>

        {/* Tela inicial enxuta (v1.09A5): no celular cabe inteira, sem rolar. O que era do rodape
            (contato, redes, politicas) aparece na tela de cadastro e em Suporte > Sobre. */}
        <div style={S.brandArea}>
          <img
            className="landing-form-logo"
            src={themeMode === 'light' ? '/brand/wc-logo-slogan-claro.svg' : '/brand/wc-logo-slogan-escuro.svg'}
            alt="WebCond"
            style={S.logoImage}
          />
          <h1 style={S.brandName}>Entrar</h1>
          <div style={S.brandSubtitle}>Entre na área do seu condomínio</div>
        </div>

        <div style={S.card} className="landing-card">

          {error && tab === 'login' && <div style={S.err}>{error}</div>}
          {!error && sessionNotice && tab === 'login' && <div style={{ ...S.note, marginTop: 0, marginBottom: 14 }}>{sessionNotice}</div>}

          {hasBlockedSession && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ color: S.pageText.color, fontSize: 14, lineHeight: 1.7 }}>
                Seu acesso foi autenticado, mas a plataforma ainda nao liberou o ambiente para continuar.
              </div>
              {authIssueCode === CONDOMINIUM_EMAIL_PENDING_CODE ? (
                <>
                  <div style={{ color: S.pageMuted.color, fontSize: 13, lineHeight: 1.7 }}>
                    Nao achou o e-mail? Confira a caixa de spam ou de promocoes, ou peca um novo link.
                  </div>
                  {resendState.message && <div style={{ ...S.note, margin: 0 }}>{resendState.message}</div>}
                  <button
                    type="button"
                    className="landing-primary-button"
                    style={{ ...S.btnBase, ...S.primaryBtn }}
                    disabled={resendState.sending}
                    onClick={async () => {
                      setResendState({ sending: true, message: '' })
                      try {
                        const result = await resendSignupConfirmation()
                        setResendState({ sending: false, message: `Novo e-mail enviado para ${result.email}.` })
                      } catch (resendError) {
                        setResendState({ sending: false, message: resendError.message })
                      }
                    }}
                  >
                    <Mail size={15} /> {resendState.sending ? 'Enviando...' : 'Reenviar e-mail de confirmacao'}
                  </button>
                </>
              ) : (
                <div style={{ color: S.pageMuted.color, fontSize: 13, lineHeight: 1.7 }}>
                  Use o aviso acima como referencia e, se necessario, entre em contato com a administracao ou com a plataforma para regularizar o acesso.
                </div>
              )}
              <button
                type="button"
                className="landing-secondary-button"
                style={{ ...S.btnBase, ...S.secondaryBtn }}
                onClick={() => {
                  setError('')
                  void signOut()
                }}
              >
                Encerrar sessao
              </button>
            </div>
          )}

          {!hasBlockedSession && (
            <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column' }}>
              {loginMode === LOGIN_MODES.email ? (
                <div className="form-group">
                  <label className="form-label" style={S.label} htmlFor="login-email">E-mail</label>
                  <div style={S.inputShell} className="landing-input-shell">
                    <Mail size={17} color={S.pageMuted.color} />
                    <input
                      id="login-email"
                      className="landing-input"
                      style={S.input}
                      type="email"
                      inputMode="email"
                      autoComplete="username"
                      autoCapitalize="none"
                      spellCheck={false}
                      placeholder="voce@exemplo.com"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      required
                    />
                  </div>
                  <button type="button" style={S.switchLink} onClick={() => switchLoginMode(LOGIN_MODES.documento)}>
                    Esqueci meu e-mail
                  </button>
                </div>
              ) : (
                <div className="form-group">
                  <label className="form-label" style={S.label} htmlFor="login-documento">CPF</label>
                  <div style={S.inputShell} className="landing-input-shell">
                    <IdCard size={17} color={S.pageMuted.color} />
                    <input
                      id="login-documento"
                      className="landing-input"
                      style={S.input}
                      type="text"
                      inputMode="numeric"
                      autoComplete="username"
                      placeholder="000.000.000-00"
                      value={formatCpfCnpj(cpf)}
                      onChange={(event) => setCpf(normalizeCpfCnpj(event.target.value))}
                      required
                    />
                  </div>
                  <button type="button" style={S.switchLink} onClick={() => switchLoginMode(LOGIN_MODES.email)}>
                    Entrar com e-mail
                  </button>
                </div>
              )}

              <div className="form-group" style={{ marginTop: 14 }}>
                <label className="form-label" style={S.label}>Senha</label>
                <div style={S.inputShell} className="landing-input-shell">
                  <LockKeyhole size={17} color={S.pageMuted.color} />
                  <input
                    className="landing-input"
                    style={{ ...S.input, paddingRight: 44 }}
                    type={showPass ? 'text' : 'password'}
                    autoComplete="current-password"
                    placeholder="Digite sua senha"
                    value={pass}
                    onChange={(event) => setPass(event.target.value)}
                    required
                  />
                  <button type="button" onClick={() => setShowPass(!showPass)} style={S.eye}>
                    {showPass ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
                {loginMode === LOGIN_MODES.documento && !ajudaSenha.aberta && (
                  <button type="button" style={S.switchLink} onClick={() => setAjudaSenha({ aberta: true, buscando: false })}>
                    Esqueci a senha
                  </button>
                )}
              </div>

              {loginMode === LOGIN_MODES.documento && ajudaSenha.aberta && (
                <div style={S.ajudaSenha}>
                  <span>A senha e trocada pelo sindico do seu condominio.</span>
                  <button type="button" style={S.ajudaSenhaBotao} onClick={() => void pedirTrocaDeSenha()} disabled={ajudaSenha.buscando}>
                    {ajudaSenha.buscando ? <Loader2 size={15} style={{ animation: 'spin .6s linear infinite' }} /> : <WhatsAppIcon size={16} color="#fff" />}
                    Solicitar troca de senha ao sindico
                  </button>
                </div>
              )}

              <button type="submit" disabled={loading} className="landing-primary-button" style={{ ...S.btnBase, ...S.primaryBtn, marginTop: 20 }}>
                {loading ? (
                  <>
                    <Loader2 size={15} style={{ animation: 'spin .6s linear infinite' }} /> Entrando...
                  </>
                ) : <>Entrar <ArrowRight size={18} /></>}
              </button>

              <div style={S.condoCard}>
                <span style={S.condoCardIcon}><Building2 size={18} /></span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: S.pageText.color }}>É síndico?</div>
                  <div style={{ fontSize: 13, color: S.pageMuted.color }}>Cadastre o condomínio e teste {TRIAL_PERIOD_DAYS} dias grátis</div>
                </div>
                <button
                  type="button"
                  style={S.condoLink}
                  onClick={() => {
                    setTab('condominio')
                    setError('')
                  }}
                >
                  Cadastrar <ArrowRight size={15} />
                </button>
              </div>

              <style>{'@keyframes spin{to{transform:rotate(360deg)}}'}</style>
            </form>
          )}

        </div>

        {!hasBlockedSession && tab === 'condominio' && (
          <div style={S.modalOverlay} className="landing-modal-overlay" onClick={(event) => event.target === event.currentTarget && !loading && closeCondominiumModal()}>
            <div style={S.modalCard} className="landing-modal-card" role="dialog" aria-modal="true" aria-labelledby="condo-register-title">
              <div style={S.modalHeader}>
                <div>
                  <div id="condo-register-title" style={S.modalTitle}>Cadastre seu condominio</div>
                  <div style={S.modalSub}>Preencha os dados e confirme pelo e-mail do sindico(a): o acesso e liberado na hora, com {TRIAL_PERIOD_DAYS} dias de teste gratis.</div>
                </div>
                <button type="button" onClick={closeCondominiumModal} disabled={loading} style={S.modalClose} aria-label="Fechar">
                  <X size={18} />
                </button>
              </div>
              {error && <div style={S.err}>{error}</div>}
            <form onSubmit={handleCondominiumRegister} style={{ display: 'flex', flexDirection: 'column' }}>
              <div className="landing-condo-grid" style={S.condominiumGrid}>
                <div className="form-group" style={{ gridColumn: '1/-1' }}>
                  <label className="form-label" style={S.label}>Nome do condominio *</label>
                  <input
                    className="input"
                    style={S.standardInput}
                    placeholder="Condominio Solar das Palmeiras"
                    value={condominiumForm.name}
                    onChange={(event) => setCondominiumForm((current) => ({ ...current, name: event.target.value }))}
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label" style={S.label}>CPF ou CNPJ do condominio *</label>
                  <input
                    className="input"
                    style={S.standardInput}
                    placeholder="000.000.000-00 ou 00.000.000/0000-00"
                    value={formatCpfCnpj(condominiumForm.cnpj)}
                    onChange={(event) => setCondominiumForm((current) => ({ ...current, cnpj: normalizeCpfCnpj(event.target.value) }))}
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label" style={S.label}>WhatsApp de contato do sindico *</label>
                  <input
                    className="input"
                    style={S.standardInput}
                    placeholder="(81) 90000-0000"
                    value={condominiumForm.whatsapp}
                    onChange={(event) => setCondominiumForm((current) => ({ ...current, whatsapp: event.target.value }))}
                    required
                  />
                </div>

                <AddressFields
                  value={condominiumForm.addressDetails}
                  onChange={(addressDetails) => setCondominiumForm((current) => ({ ...current, addressDetails }))}
                  required
                  inputStyle={S.standardInput}
                  labelStyle={S.label}
                />

                <div className="form-group">
                  <label className="form-label" style={S.label}>Quantidade de unidades *</label>
                  <input
                    className="input"
                    style={S.standardInput}
                    type="number"
                    min="1"
                    placeholder="24"
                    value={condominiumForm.unitCount}
                    onChange={(event) => setCondominiumForm((current) => ({ ...current, unitCount: event.target.value }))}
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label" style={S.label}>Chave Pix</label>
                  <input
                    className="input"
                    style={S.standardInput}
                    placeholder="email, celular, CPF ou chave aleatoria"
                    value={condominiumForm.pixKey}
                    onChange={(event) => setCondominiumForm((current) => ({ ...current, pixKey: event.target.value }))}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label" style={S.label}>Banco destino do Pix</label>
                  <input
                    className="input"
                    style={S.standardInput}
                    placeholder="Ex.: Nubank, Inter, Caixa, InfinitePay"
                    value={condominiumForm.bankDestination}
                    onChange={(event) => setCondominiumForm((current) => ({ ...current, bankDestination: event.target.value }))}
                  />
                </div>

                <div style={S.sectionTag}>
                  <ShieldCheck size={15} color={S.brandGreen.color} />
                  <div style={{ fontSize: 12, color: S.pageMuted.color }}>Responsavel inicial pelo acesso administrativo</div>
                </div>

                <div className="form-group" style={{ gridColumn: '1/-1' }}>
                  <label className="form-label" style={S.label}>Nome do sindico *</label>
                  <input
                    className="input"
                    style={S.standardInput}
                    placeholder="Maria Ferreira"
                    value={condominiumForm.syndicName}
                    onChange={(event) => setCondominiumForm((current) => ({ ...current, syndicName: event.target.value }))}
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label" style={S.label}>CPF do sindico *</label>
                  <input
                    className="input"
                    style={S.standardInput}
                    placeholder="000.000.000-00"
                    value={formatCpf(condominiumForm.syndicCpf)}
                    onChange={(event) => setCondominiumForm((current) => ({ ...current, syndicCpf: normalizeCpf(event.target.value) }))}
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label" style={S.label}>E-mail do sindico *</label>
                  <input
                    className="input"
                    style={S.standardInput}
                    type="email"
                    inputMode="email"
                    autoCapitalize="none"
                    spellCheck={false}
                    autoComplete="email"
                    placeholder="sindico@condominio.com"
                    value={condominiumForm.syndicEmail}
                    onChange={(event) => setCondominiumForm((current) => ({ ...current, syndicEmail: event.target.value }))}
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label" style={S.label}>Subsindico (opcional)</label>
                  <input
                    className="input"
                    style={S.standardInput}
                    placeholder="Nome do subsindico"
                    value={condominiumForm.subSyndicName}
                    onChange={(event) => setCondominiumForm((current) => ({ ...current, subSyndicName: event.target.value }))}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label" style={S.label}>WhatsApp do subsindico (opcional)</label>
                  <input
                    className="input"
                    style={S.standardInput}
                    placeholder="(81) 90000-0000"
                    value={condominiumForm.subSyndicWhatsapp}
                    onChange={(event) => setCondominiumForm((current) => ({ ...current, subSyndicWhatsapp: event.target.value }))}
                  />
                </div>

                <div className="form-group" style={{ gridColumn: '1/-1' }}>
                  <label className="form-label" style={S.label}>Senha inicial *</label>
                  <input
                    className="input"
                    style={S.standardInput}
                    type="password"
                    placeholder="Minimo de 6 caracteres"
                    value={condominiumForm.password}
                    onChange={(event) => setCondominiumForm((current) => ({ ...current, password: event.target.value }))}
                    required
                  />
                </div>

                {/* Sem vitrine de planos no cadastro: o sindico nao precisa decidir nada agora.
                    A escolha fica dentro do sistema, em Meu perfil > Meu plano. */}
                <div className="planos-vitrine">
                  <div className="planos-vitrine-title">Planos</div>
                  <p className="planos-vitrine-sub">
                    Assim que voce confirmar o e-mail, o condominio entra em teste: {TRIAL_PERIOD_DAYS} dias gratis com
                    os recursos do plano ONE. Nada e cobrado agora: depois, se quiser, escolhe o plano dentro do
                    sistema em <strong>Meu perfil &gt; Meu plano</strong>.
                  </p>
                  <a
                    className="planos-vitrine-link"
                    href={whatsappUrl(MSG_PLANOS)}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Duvidas sobre os planos? Fale com a TSCBr no WhatsApp
                  </a>
                </div>
              </div>

              <p style={S.note}>
                <Info size={13} style={{ verticalAlign: '-2px', marginRight: 6 }} />
                Voce recebe um e-mail de boas-vindas com o botao <strong>Confirmar cadastro</strong>. Confirmado, voce
                entra com o e-mail e a senha acima e cadastra as unidades, os moradores e as cobrancas.
              </p>

              <button type="submit" disabled={loading} className="landing-secondary-button" style={{ ...S.btnBase, ...S.secondaryBtn, marginTop: 4 }}>
                {loading ? (
                  <>
                    <Loader2 size={15} style={{ animation: 'spin .6s linear infinite' }} /> Enviando cadastro...
                  </>
                ) : (
                  <>
                    <Building size={15} /> Cadastrar condominio
                  </>
                )}
              </button>
              <style>{'@keyframes spin{to{transform:rotate(360deg)}}'}</style>
            </form>
            {/* Informacoes do rodape (contato, redes, politicas): ficam aqui, no cadastro, e nao na tela inicial. */}
            <div className="landing-modal-footer">
              <SiteFooter />
            </div>
            </div>
          </div>
        )}

      </div>

      {tab !== 'condominio' && (
        <div style={S.miniFooter}>
          <span>© TSCBr · {APP_VERSION}</span>
          <Link to="/politicas/privacidade" style={S.miniFooterLink}>Privacidade</Link>
          <Link to="/politicas/seguranca" style={S.miniFooterLink}>Segurança</Link>
          <Link to="/politicas/cookies" style={S.miniFooterLink}>Cookies</Link>
          <InstallAppButton className="landing-install" label="Instalar o app" />
        </div>
      )}
      </div>
    </div>
  )
}

const RESPONSIVE_STYLES = `
  .landing-primary-button:hover,
  .landing-secondary-button:hover {
    background: #1B52A8 !important;
    border-color: #1B52A8 !important;
  }

  .landing-input-shell:focus-within {
    border-color: #2160C4 !important;
    box-shadow: 0 0 0 4px rgba(33,96,196,0.16);
  }

  .landing-input::placeholder {
    color: #8794A6;
  }

  /* Painel da marca so no computador; la o logo ja aparece, entao o do formulario some. */
  @media (max-width: 900px) {
    .landing-hero { display: none !important; }
  }
  @media (min-width: 901px) {
    .landing-form-logo { display: none !important; }
  }

  .landing-modal-footer { margin: 24px -28px -28px; border-top: 1px solid rgba(127,127,127,0.18); overflow: hidden; border-radius: 0 0 20px 20px; }
  .landing-modal-footer .site-footer { margin: 0; }

  @media (max-width: 860px) {
    .landing-condo-grid {
      grid-template-columns: 1fr !important;
    }
  }

  /* Celular: o cadastro vira uma tela inteira, sem bordas sobrando dos lados. */
  @media (max-width: 640px) {
    .landing-modal-overlay { padding: 0 !important; }
    .landing-modal-card { width: 100% !important; min-height: 100dvh; border-radius: 0 !important; padding: 20px 16px 0 !important; border: none !important; }
    .landing-modal-footer { margin: 24px -16px 0; border-radius: 0; }
  }
`

const PALETTES = {
  dark: {
    bg: '#0A101B',
    text: '#EEF2F8',
    muted: '#AFC0D3',
    dim: '#7184A0',
    surface: '#111A28',
    surface2: '#162030',
    accent: '#2160C4',
    green: '#66CD72',
    greenTint: 'rgba(61,174,74,.15)',
    brandBlue: '#2160C4',
    primaryText: '#82AEF5',
    border: '#1E2A3D',
    borderStrong: '#2A3950',
    overlay: 'rgba(2,6,12,.62)',
    errorBg: 'rgba(255,120,110,.13)',
    errorBorder: 'rgba(255,135,127,.45)',
    errorText: '#FF877F',
    shadow: 'none',
    shadowStrong: '0 30px 80px rgba(0,0,0,.55)',
    accentShadow: 'none',
  },
  light: {
    bg: '#F3F5F9',
    text: '#0E1624',
    muted: '#5B6878',
    dim: '#8794A6',
    surface: '#FFFFFF',
    surface2: '#F1F4F8',
    accent: '#2160C4',
    green: '#23813A',
    greenTint: '#E7F5E9',
    brandBlue: '#2160C4',
    primaryText: '#1D58B8',
    border: '#E4E9F0',
    borderStrong: '#D3DBE6',
    overlay: 'rgba(14,22,36,.42)',
    errorBg: '#FCEBEA',
    errorBorder: 'rgba(176,48,42,.35)',
    errorText: '#B0302A',
    shadow: 'none',
    shadowStrong: '0 30px 80px rgba(14,22,36,.22)',
    accentShadow: 'none',
  },
}

// A tela de entrada acompanha o tema claro/escuro escolhido no canto superior direito.
function buildStyles(p) {
  return {
  root: {
    minHeight: '100dvh',
    display: 'flex',
    background: p.bg,
    position: 'relative',
    overflow: 'hidden',
    fontFamily: "'Outfit', system-ui, sans-serif",
    color: p.text,
  },
  hero: {
    position: 'relative',
    overflow: 'hidden',
    flex: '0 0 46%',
    background: '#0E1624',
    color: '#fff',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'space-between',
    padding: '48px 56px',
  },
  heroWatermark: { position: 'absolute', right: -120, bottom: -110, width: 620, opacity: 0.16, pointerEvents: 'none' },
  heroLogo: { position: 'relative', width: 300, display: 'block' },
  heroTitle: { fontSize: 40, fontWeight: 600, letterSpacing: '-0.03em', lineHeight: 1.1, textWrap: 'balance' },
  heroText: { fontSize: 17, color: '#AFC0D3', marginTop: 14, lineHeight: 1.5 },
  heroFoot: { position: 'relative', fontSize: 13, color: '#AFC0D3' },
  formSide: {
    position: 'relative',
    flex: 1,
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    overflowY: 'auto',
  },
  center: {
    position: 'relative',
    zIndex: 1,
    width: '100%',
    maxWidth: 448,
    margin: '0 auto',
    padding: '64px 24px 24px',
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
  },
  miniFooter: {
    position: 'relative',
    zIndex: 1,
    display: 'flex',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: '4px 14px',
    padding: '12px 16px 18px',
    fontSize: 12,
    color: p.dim,
  },
  miniFooterLink: {
    color: p.dim,
    textDecoration: 'none',
  },
  brandBlue: { color: p.brandBlue },
  brandGreen: { color: p.green },
  pageText: { color: p.text },
  pageMuted: { color: p.muted },
  themeToggle: {
    position: 'absolute',
    top: 18,
    right: 18,
    zIndex: 2,
    width: 42,
    height: 42,
    borderRadius: 12,
    border: `1px solid ${p.border}`,
    background: p.surface,
    color: p.muted,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
  },
  brandArea: {
    width: '100%',
    maxWidth: 400,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    marginBottom: 22,
  },
  logoImage: {
    width: 250,
    maxWidth: '100%',
    display: 'block',
    margin: '0 auto 28px',
  },
  brandName: {
    fontSize: 30,
    lineHeight: 1.15,
    fontWeight: 600,
    letterSpacing: '-0.025em',
    margin: 0,
    color: p.text,
  },
  brandSubtitle: {
    marginTop: 4,
    color: p.muted,
    fontSize: 15,
    lineHeight: 1.5,
  },
  card: {
    width: '100%',
    maxWidth: 400,
  },
  err: {
    background: p.errorBg,
    border: '1px solid rgba(248,81,73,0.55)',
    color: p.errorText,
    borderRadius: 12,
    padding: '12px 14px',
    fontSize: 13,
    marginBottom: 18,
  },
  label: {
    color: p.muted,
    fontSize: 13,
    fontWeight: 500,
    textTransform: 'none',
    letterSpacing: 0,
    marginBottom: 6,
    display: 'block',
  },
  inputShell: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    minHeight: 54,
    borderRadius: 14,
    border: `1px solid ${p.borderStrong}`,
    background: p.surface,
    padding: '0 8px 0 16px',
    transition: 'border-color .15s ease, box-shadow .15s ease',
  },
  input: {
    flex: 1,
    background: 'transparent',
    border: 'none',
    outline: 'none',
    color: p.text,
    fontSize: 16,
    minWidth: 0,
    minHeight: 50,
  },
  standardInput: {
    minHeight: 48,
    background: p.surface,
    border: `1px solid ${p.borderStrong}`,
    color: p.text,
    borderRadius: 12,
  },
  btnBase: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: 54,
    padding: '0 20px',
    borderRadius: 14,
    border: '1px solid',
    fontSize: 16,
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'all .18s ease',
  },
  primaryBtn: {
    background: p.accent,
    borderColor: p.accent,
    color: '#fff',
  },
  secondaryBtn: {
    background: p.brandBlue,
    borderColor: p.brandBlue,
    color: '#fff',
  },
  eye: {
    background: 'none',
    border: 'none',
    color: p.muted,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 0,
  },
  modalOverlay: {
    position: 'fixed',
    inset: 0,
    zIndex: 50,
    background: p.overlay,
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'center',
    padding: '32px 16px',
    overflowY: 'auto',
  },
  modalCard: {
    width: 'min(92vw, 760px)',
    background: p.surface,
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 20,
    padding: 28,
    boxShadow: p.shadowStrong,
  },
  modalHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 16,
    marginBottom: 18,
  },
  modalTitle: {
    color: p.text,
    fontSize: 20,
    fontWeight: 700,
  },
  modalSub: {
    color: p.muted,
    fontSize: 13,
    lineHeight: 1.6,
    marginTop: 4,
  },
  modalClose: {
    background: 'transparent',
    border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: 10,
    color: p.muted,
    width: 36,
    height: 36,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    flexShrink: 0,
  },
  // Troca entre e-mail e CPF/CNPJ, logo abaixo do campo: discreto, mas facil de achar.
  switchLink: {
    marginTop: 6,
    padding: '4px 0',
    background: 'transparent',
    border: 'none',
    color: p.primaryText,
    fontSize: 13,
    fontWeight: 500,
    cursor: 'pointer',
    alignSelf: 'flex-end',
    textAlign: 'right',
  },
  ajudaSenha: {
    marginTop: 12,
    padding: '12px 14px',
    borderRadius: 14,
    background: p.surface2,
    border: `1px solid ${p.border}`,
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
    fontSize: 12.5,
    color: p.muted,
    lineHeight: 1.5,
  },
  ajudaSenhaBotao: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: '11px 14px',
    borderRadius: 10,
    border: 'none',
    background: '#1f9d55',
    color: '#fff',
    fontSize: 13.5,
    fontWeight: 600,
    cursor: 'pointer',
  },
  condoCard: {
    marginTop: 22,
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '14px 16px',
    borderRadius: 16,
    border: `1px dashed ${p.borderStrong}`,
  },
  condoCardIcon: {
    width: 38,
    height: 38,
    borderRadius: 11,
    background: p.greenTint,
    color: p.green,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  condoLink: {
    whiteSpace: 'nowrap',
    flexShrink: 0,
    padding: 0,
    background: 'transparent',
    border: 'none',
    color: p.primaryText,
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: 4,
  },
  condominiumGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 12,
  },
  sectionTag: {
    gridColumn: '1/-1',
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  note: {
    fontSize: 12,
    color: p.muted,
    margin: '12px 0',
    lineHeight: 1.7,
  },
  successCard: {
    background: p.surface,
    border: '1px solid rgba(67,160,71,0.22)',
    borderRadius: 16,
    padding: 40,
    maxWidth: 460,
    width: '100%',
    textAlign: 'center',
    boxShadow: p.shadow,
  },
  successLogo: {
    width: 220,
    maxWidth: '100%',
    display: 'block',
    margin: '0 auto 22px',
  },
  successTitle: {
    fontSize: 22,
    fontWeight: 600,
    color: p.text,
    marginBottom: 10,
  },
  successText: {
    fontSize: 14,
    color: p.muted,
    lineHeight: 1.75,
    marginBottom: 24,
  },
}

}
