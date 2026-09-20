import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  Building,
  CheckCircle,
  Eye,
  EyeOff,
  IdCard,
  Loader2,
  LockKeyhole,
  ShieldCheck,
  X,
} from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { getHomePathForRole } from '../lib/auth'
import { signInWithDocument } from '../lib/authApi'
import { formatCpf, normalizeCpf } from '../lib/cpf'
import { formatCpfCnpj, getCpfCnpjType, normalizeCpfCnpj } from '../lib/document'
import { registerCondominium } from '../lib/platformApi'
import AddressFields from '../components/shared/AddressFields'
import SiteFooter from '../components/shared/SiteFooter'
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
  const [searchParams, setSearchParams] = useSearchParams()
  const [tab, setTab] = useState(searchParams.get('cadastro') === 'condominio' ? 'condominio' : 'login')
  const [cpf, setCpf] = useState('')
  const [pass, setPass] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [condominiumForm, setCondominiumForm] = useState(emptyCondominiumForm)
  const [successMode, setSuccessMode] = useState('')
  const { user, loading: authLoading, resolvedRole, authIssue, signOut } = useAuth()
  const navigate = useNavigate()
  const hasBlockedSession = !authLoading && user && !resolvedRole && authIssue

  useEffect(() => {
    if (!authLoading && user && resolvedRole) {
      navigate(getHomePathForRole(resolvedRole), { replace: true })
    }
  }, [authLoading, user, resolvedRole, navigate])

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
      await registerCondominium(payload)
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
      <div style={S.root}>
        <div style={S.bg} />
        <div style={S.grid} />
        <div style={S.glowLeft} />
        <div style={S.glowRight} />
        <div style={S.center}>
          <style>{RESPONSIVE_STYLES}</style>
          <div style={S.successCard}>
            <img src="/logo.png" alt="WebCond" style={S.successLogo} />
            <CheckCircle size={48} color="#43A047" style={{ margin: '0 auto 18px' }} />
            <div style={S.successTitle}>Condominio cadastrado!</div>
            <div style={S.successText}>
              O cadastro inicial foi recebido. O acesso do sindico fica em analise ate a aprovacao do condominio pela plataforma.
            </div>
            <button
              className="landing-primary-button"
              style={{ ...S.btnBase, ...S.primaryBtn, width: '100%' }}
              onClick={() => {
                setSuccessMode('')
                setTab('login')
                setCondominiumForm(emptyCondominiumForm)
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
    <div style={S.root}>
      <div style={S.bg} />
      <div style={S.grid} />
      <div style={S.glowLeft} />
      <div style={S.glowRight} />

      <div style={S.center}>
        <style>{RESPONSIVE_STYLES}</style>

        <div style={S.brandArea}>
          <img src="/logo.png" alt="WebCond" style={S.logoImage} />
          <div style={S.brandName}>
            <span style={{ color: '#0D47A1' }}>Web</span>
            <span style={{ color: '#43A047' }}>Cond</span>
          </div>
          <div style={S.brandSubtitle}>Gestao condominial simples e completa</div>
        </div>

        <div style={S.heroText}>
          <h1 style={S.headline}>Acesse sua area do condominio</h1>
          <p style={S.sub}>
            Entre com seu CPF ou CNPJ e senha para visualizar cobrancas, comunicados e informacoes da sua unidade.
          </p>
        </div>

        <div style={S.card} className="landing-card">

          {error && tab === 'login' && <div style={S.err}>{error}</div>}

          {hasBlockedSession && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ color: '#F2F4F7', fontSize: 14, lineHeight: 1.7 }}>
                Seu acesso foi autenticado, mas a plataforma ainda nao liberou o ambiente para continuar.
              </div>
              <div style={{ color: '#9CA3AF', fontSize: 13, lineHeight: 1.7 }}>
                Use o aviso acima como referencia e, se necessario, entre em contato com a administracao ou com a plataforma para regularizar o acesso.
              </div>
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
              <div className="form-group">
                <label className="form-label" style={S.label}>CPF ou CNPJ</label>
                <div style={S.inputShell} className="landing-input-shell">
                  <IdCard size={17} color="#9CA3AF" />
                  <input
                    className="landing-input"
                    style={S.input}
                    type="text"
                    inputMode="numeric"
                    placeholder="000.000.000-00 ou 00.000.000/0000-00"
                    value={formatCpfCnpj(cpf)}
                    onChange={(event) => setCpf(normalizeCpfCnpj(event.target.value))}
                    required
                  />
                </div>
              </div>

              <div className="form-group" style={{ marginTop: 14 }}>
                <label className="form-label" style={S.label}>Senha</label>
                <div style={S.inputShell} className="landing-input-shell">
                  <LockKeyhole size={17} color="#9CA3AF" />
                  <input
                    className="landing-input"
                    style={{ ...S.input, paddingRight: 44 }}
                    type={showPass ? 'text' : 'password'}
                    placeholder="Digite sua senha"
                    value={pass}
                    onChange={(event) => setPass(event.target.value)}
                    required
                  />
                  <button type="button" onClick={() => setShowPass(!showPass)} style={S.eye}>
                    {showPass ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </div>

              <button type="submit" disabled={loading} className="landing-primary-button" style={{ ...S.btnBase, ...S.primaryBtn, marginTop: 20 }}>
                {loading ? (
                  <>
                    <Loader2 size={15} style={{ animation: 'spin .6s linear infinite' }} /> Entrando...
                  </>
                ) : 'Entrar'}
              </button>

              <button
                type="button"
                style={S.condoLink}
                onClick={() => {
                  setTab('condominio')
                  setError('')
                }}
              >
                E sindico? Cadastre seu condominio
              </button>

              <style>{'@keyframes spin{to{transform:rotate(360deg)}}'}</style>
            </form>
          )}

        </div>

        {!hasBlockedSession && tab === 'condominio' && (
          <div style={S.modalOverlay} onClick={(event) => event.target === event.currentTarget && !loading && closeCondominiumModal()}>
            <div style={S.modalCard} className="landing-card" role="dialog" aria-modal="true" aria-labelledby="condo-register-title">
              <div style={S.modalHeader}>
                <div>
                  <div id="condo-register-title" style={S.modalTitle}>Cadastre seu condominio</div>
                  <div style={S.modalSub}>Preencha os dados e envie a solicitacao. A administracao da WebCond analisa e libera o acesso.</div>
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
                  <ShieldCheck size={15} color="#43A047" />
                  <div style={{ fontSize: 12, color: '#9CA3AF' }}>Responsavel inicial pelo acesso administrativo</div>
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
              </div>

              <p style={S.note}>
                O ambiente do condominio sera criado em modo pendente e liberado somente depois da aprovacao do administrador da plataforma.
              </p>

              <button type="submit" disabled={loading} className="landing-secondary-button" style={{ ...S.btnBase, ...S.secondaryBtn, marginTop: 4 }}>
                {loading ? (
                  <>
                    <Loader2 size={15} style={{ animation: 'spin .6s linear infinite' }} /> Enviando cadastro...
                  </>
                ) : (
                  <>
                    <Building size={15} /> Solicitar novo condominio
                  </>
                )}
              </button>
              <style>{'@keyframes spin{to{transform:rotate(360deg)}}'}</style>
            </form>
            </div>
          </div>
        )}

      </div>

      <SiteFooter />
    </div>
  )
}

const RESPONSIVE_STYLES = `
  .landing-primary-button:hover {
    background: #2e7d32;
    border-color: #2e7d32;
    transform: translateY(-1px);
  }

  .landing-secondary-button:hover {
    background: #0b3b84;
    border-color: #0b3b84;
    transform: translateY(-1px);
  }

  .landing-input-shell:focus-within {
    border-color: rgba(67,160,71,0.85) !important;
    box-shadow: 0 0 0 4px rgba(67,160,71,0.12);
  }

  .landing-input::placeholder {
    color: #6B7280;
  }

  @media (max-width: 860px) {
    .landing-card {
      width: min(92vw, 720px) !important;
      padding: 24px !important;
    }

    .landing-condo-grid {
      grid-template-columns: 1fr !important;
    }
  }
`

const S = {
  root: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#0B1117',
    position: 'relative',
    overflow: 'hidden',
  },
  bg: {
    position: 'absolute',
    inset: 0,
    background: 'radial-gradient(circle at top, rgba(13,71,161,0.16), transparent 42%)',
    pointerEvents: 'none',
  },
  grid: {
    position: 'absolute',
    inset: 0,
    backgroundImage: 'linear-gradient(rgba(255,255,255,0.03) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,0.03) 1px,transparent 1px)',
    backgroundSize: '42px 42px',
    pointerEvents: 'none',
    maskImage: 'linear-gradient(to bottom, rgba(0,0,0,0.88), rgba(0,0,0,0.2))',
  },
  glowLeft: {
    position: 'absolute',
    width: 420,
    height: 420,
    borderRadius: '50%',
    background: 'rgba(13,71,161,0.12)',
    filter: 'blur(80px)',
    top: -120,
    left: -120,
    pointerEvents: 'none',
  },
  glowRight: {
    position: 'absolute',
    width: 320,
    height: 320,
    borderRadius: '50%',
    background: 'rgba(67,160,71,0.12)',
    filter: 'blur(80px)',
    bottom: -80,
    right: -80,
    pointerEvents: 'none',
  },
  center: {
    position: 'relative',
    zIndex: 1,
    width: '100%',
    maxWidth: 860,
    padding: '40px 20px 32px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
  },
  brandArea: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    textAlign: 'center',
    marginBottom: 22,
  },
  logoImage: {
    width: 88,
    height: 88,
    objectFit: 'contain',
    marginBottom: 14,
    filter: 'drop-shadow(0 16px 30px rgba(0,0,0,0.35))',
  },
  brandName: {
    display: 'flex',
    gap: 2,
    fontSize: 34,
    lineHeight: 1,
    fontWeight: 800,
    letterSpacing: '-0.04em',
  },
  brandSubtitle: {
    marginTop: 10,
    color: '#9CA3AF',
    fontSize: 14,
    lineHeight: 1.6,
  },
  heroText: {
    textAlign: 'center',
    marginBottom: 26,
    maxWidth: 640,
  },
  headline: {
    fontSize: 34,
    lineHeight: 1.1,
    fontWeight: 800,
    color: '#F2F4F7',
    margin: 0,
    letterSpacing: '-0.04em',
  },
  sub: {
    fontSize: 15,
    color: '#9CA3AF',
    margin: '12px 0 0',
    lineHeight: 1.75,
  },
  card: {
    background: '#111821',
    border: '1px solid rgba(67,160,71,0.22)',
    borderRadius: 16,
    padding: 30,
    width: '100%',
    maxWidth: 720,
    boxShadow: '0 28px 70px rgba(0,0,0,0.34)',
    backdropFilter: 'blur(10px)',
  },
  err: {
    background: 'rgba(127,29,29,0.38)',
    border: '1px solid rgba(248,81,73,0.55)',
    color: '#FCA5A5',
    borderRadius: 12,
    padding: '12px 14px',
    fontSize: 13,
    marginBottom: 18,
  },
  label: {
    color: '#F2F4F7',
    fontSize: 12,
    marginBottom: 8,
    display: 'block',
  },
  inputShell: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    minHeight: 52,
    borderRadius: 14,
    border: '1px solid rgba(255,255,255,0.08)',
    background: 'rgba(255,255,255,0.03)',
    padding: '0 14px',
    transition: 'all .18s ease',
  },
  input: {
    flex: 1,
    background: 'transparent',
    border: 'none',
    outline: 'none',
    color: '#F2F4F7',
    fontSize: 14,
    minHeight: 50,
  },
  standardInput: {
    minHeight: 48,
    background: 'rgba(255,255,255,0.03)',
    border: '1px solid rgba(255,255,255,0.08)',
    color: '#F2F4F7',
    borderRadius: 12,
  },
  btnBase: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: '13px 20px',
    borderRadius: 12,
    border: '1px solid',
    fontSize: 14,
    fontWeight: 700,
    cursor: 'pointer',
    transition: 'all .18s ease',
  },
  primaryBtn: {
    background: '#43A047',
    borderColor: '#43A047',
    color: '#F2F4F7',
  },
  secondaryBtn: {
    background: '#0D47A1',
    borderColor: '#0D47A1',
    color: '#F2F4F7',
  },
  eye: {
    background: 'none',
    border: 'none',
    color: '#9CA3AF',
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
    background: 'rgba(3, 7, 12, 0.72)',
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'center',
    padding: '32px 16px',
    overflowY: 'auto',
  },
  modalCard: {
    width: 'min(92vw, 760px)',
    background: '#111820',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 20,
    padding: 28,
    boxShadow: '0 24px 60px rgba(0,0,0,0.45)',
  },
  modalHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 16,
    marginBottom: 18,
  },
  modalTitle: {
    color: '#F2F4F7',
    fontSize: 20,
    fontWeight: 700,
  },
  modalSub: {
    color: '#9CA3AF',
    fontSize: 13,
    lineHeight: 1.6,
    marginTop: 4,
  },
  modalClose: {
    background: 'transparent',
    border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: 10,
    color: '#9CA3AF',
    width: 36,
    height: 36,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    flexShrink: 0,
  },
  condoLink: {
    marginTop: 14,
    background: 'transparent',
    border: 'none',
    color: '#9CA3AF',
    fontSize: 13,
    cursor: 'pointer',
    alignSelf: 'center',
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
    color: '#9CA3AF',
    margin: '12px 0',
    lineHeight: 1.7,
  },
  successCard: {
    background: '#111821',
    border: '1px solid rgba(67,160,71,0.22)',
    borderRadius: 16,
    padding: 40,
    maxWidth: 460,
    width: '100%',
    textAlign: 'center',
    boxShadow: '0 28px 70px rgba(0,0,0,0.34)',
  },
  successLogo: {
    width: 72,
    height: 72,
    objectFit: 'contain',
    marginBottom: 20,
  },
  successTitle: {
    fontSize: 22,
    fontWeight: 800,
    color: '#F2F4F7',
    marginBottom: 10,
  },
  successText: {
    fontSize: 14,
    color: '#9CA3AF',
    lineHeight: 1.75,
    marginBottom: 24,
  },
}
