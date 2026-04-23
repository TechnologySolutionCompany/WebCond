import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Building2, Eye, EyeOff, Loader2, UserPlus, CheckCircle, Building, ShieldCheck } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'
import { getHomePathForRole } from '../lib/auth'
import { signInWithCpf } from '../lib/authApi'
import { formatCpf, normalizeCpf } from '../lib/cpf'
import { registerCondominium } from '../lib/platformApi'
import { APARTMENT_OPTIONS } from '../lib/apartments'
import { COMPANY_COPY } from '../lib/condoConfig'

const emptyForm = {
  nome: '',
  email: '',
  cpf: '',
  whatsapp: '',
  apartamento: '',
  data_entrada: '',
  mensagem: '',
}

const emptyCondominiumForm = {
  name: '',
  cnpj: '',
  address: '',
  zipCode: '',
  whatsapp: '',
  unitCount: '',
  bankDetails: '',
  syndicName: '',
  syndicCpf: '',
  syndicEmail: '',
  password: '',
}

function normalizeCnpj(value = '') {
  return String(value || '').replace(/\D/g, '').slice(0, 14)
}

function formatCnpj(value = '') {
  const digits = normalizeCnpj(value)

  if (digits.length <= 2) return digits
  if (digits.length <= 5) return `${digits.slice(0, 2)}.${digits.slice(2)}`
  if (digits.length <= 8) return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5)}`
  if (digits.length <= 12) return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8)}`
  return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12, 14)}`
}

export default function Landing() {
  const [tab, setTab] = useState('login')
  const [cpf, setCpf] = useState('')
  const [pass, setPass] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState(emptyForm)
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
      const normalizedCpf = normalizeCpf(cpf)
      if (normalizedCpf.length !== 11) {
        setError('Informe um CPF valido.')
        return
      }

      await signInWithCpf(normalizedCpf, pass)
    } catch (loginError) {
      setError(loginError.message || 'Nao foi possivel entrar.')
    } finally {
      setLoading(false)
    }
  }

  const handleCadastro = async (event) => {
    event.preventDefault()

    if (!form.nome || !form.email || !form.cpf || !form.whatsapp || !form.apartamento || !form.data_entrada) {
      setError('Preencha nome, e-mail, CPF, WhatsApp, apartamento e data de entrada.')
      return
    }

    setLoading(true)
    setError('')

    try {
      const { error: insertError } = await supabase
        .from('solicitacoes_cadastro')
        .insert({
          ...form,
          cpf: normalizeCpf(form.cpf),
          whatsapp: String(form.whatsapp || '').replace(/\D/g, ''),
          status: 'pendente',
        })

      if (insertError) throw insertError

      setSuccessMode('cadastro')
    } catch (submissionError) {
      setError(submissionError.message || 'Erro ao enviar solicitacao.')
    } finally {
      setLoading(false)
    }
  }

  const handleCondominiumRegister = async (event) => {
    event.preventDefault()

    const payload = {
      name: condominiumForm.name,
      cnpj: normalizeCnpj(condominiumForm.cnpj),
      address: condominiumForm.address,
      zipCode: condominiumForm.zipCode,
      whatsapp: condominiumForm.whatsapp,
      unitCount: Number(condominiumForm.unitCount || 0),
      bankDetails: condominiumForm.bankDetails,
      syndicName: condominiumForm.syndicName,
      syndicCpf: normalizeCpf(condominiumForm.syndicCpf),
      syndicEmail: condominiumForm.syndicEmail,
      password: condominiumForm.password,
    }

    if (!payload.name || !payload.cnpj || !payload.address || !payload.zipCode || !payload.whatsapp || !payload.syndicName || !payload.syndicCpf || !payload.syndicEmail || !payload.password) {
      setError('Preencha os dados do condominio e do sindico responsavel.')
      return
    }

    if (payload.cnpj.length !== 14) {
      setError('Informe um CNPJ valido com 14 digitos.')
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

  if (successMode) {
    const isCondominiumFlow = successMode === 'condominio'

    return (
      <div style={S.root}>
        <div style={S.bg} />
        <div style={S.grid} />
        <div style={S.center}>
          <div style={S.successCard}>
            <CheckCircle size={48} color="#3fb950" style={{ margin: '0 auto 16px' }} />
            <div style={S.successTitle}>{isCondominiumFlow ? 'Condominio cadastrado!' : 'Solicitacao enviada!'}</div>
            <div style={S.successText}>
              {isCondominiumFlow
                ? 'O cadastro inicial foi recebido. O acesso do sindico fica em analise ate a aprovacao do condominio pela plataforma.'
                : 'A administracao foi notificada e vai analisar seus dados. Assim que o acesso for liberado, o login continuara sendo feito com CPF e senha.'}
            </div>
            <button
              style={{ ...S.btn, ...S.primaryBtn, width: '100%', justifyContent: 'center' }}
              onClick={() => {
                setSuccessMode('')
                setTab('login')
                setForm(emptyForm)
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
      <div style={S.center}>
        <div style={S.logo}>
          <Building2 size={36} color="#3fb950" />
          <div>
            <div style={S.logoTitle}>WebCond</div>
            <div style={S.logoSub}>Technology Solution Company BR</div>
          </div>
        </div>

        <h1 style={S.headline}>Acesso com CPF + senha</h1>
        <p style={S.sub}>
          Entre com seu CPF. O sistema identifica seu perfil automaticamente e redireciona para a area correta.
        </p>

        <div style={S.card}>
          {!hasBlockedSession && (
            <div style={S.tabs}>
              {[
                ['login', 'Entrar'],
                ['cadastro', 'Solicitar cadastro'],
                ['condominio', 'Cadastrar condominio'],
              ].map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => {
                    setTab(key)
                    setError('')
                  }}
                  style={{
                    ...S.tabButton,
                    color: tab === key ? '#3fb950' : '#8b949e',
                    borderBottomColor: tab === key ? '#3fb950' : 'transparent',
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          )}

          {error && <div style={S.err}>{error}</div>}

          {hasBlockedSession && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ color: '#c9d1d9', fontSize: 14, lineHeight: 1.6 }}>
                Seu acesso foi autenticado, mas a plataforma ainda nao liberou o ambiente para continuar.
              </div>
              <div style={{ color: '#8b949e', fontSize: 13, lineHeight: 1.6 }}>
                Use o aviso acima como referencia e, se necessario, entre em contato com a administracao ou com a plataforma para regularizar o acesso.
              </div>
              <button
                type="button"
                style={{ ...S.btn, ...S.secondaryBtn, justifyContent: 'center' }}
                onClick={() => {
                  setError('')
                  void signOut()
                }}
              >
                Encerrar sessao
              </button>
            </div>
          )}

          {!hasBlockedSession && tab === 'login' && (
            <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column' }}>
              <div className="form-group">
                <label className="form-label">CPF</label>
                <input
                  className="input"
                  type="text"
                  inputMode="numeric"
                  placeholder="000.000.000-00"
                  value={formatCpf(cpf)}
                  onChange={(event) => setCpf(normalizeCpf(event.target.value))}
                  required
                />
              </div>

              <div className="form-group" style={{ marginTop: 14 }}>
                <label className="form-label">Senha</label>
                <div style={{ position: 'relative' }}>
                  <input
                    className="input"
                    type={showPass ? 'text' : 'password'}
                    placeholder="********"
                    value={pass}
                    onChange={(event) => setPass(event.target.value)}
                    required
                    style={{ paddingRight: 40 }}
                  />
                  <button type="button" onClick={() => setShowPass(!showPass)} style={S.eye}>
                    {showPass ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </div>

              <button type="submit" disabled={loading} style={{ ...S.btn, ...S.primaryBtn, marginTop: 20 }}>
                {loading ? (
                  <>
                    <Loader2 size={15} style={{ animation: 'spin .6s linear infinite' }} /> Entrando...
                  </>
                ) : 'Entrar'}
              </button>
              <style>{'@keyframes spin{to{transform:rotate(360deg)}}'}</style>
            </form>
          )}

          {!hasBlockedSession && tab === 'cadastro' && (
            <form onSubmit={handleCadastro} style={{ display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-group" style={{ gridColumn: '1/-1' }}>
                  <label className="form-label">Nome completo *</label>
                  <input
                    className="input"
                    placeholder="Joao da Silva"
                    value={form.nome}
                    onChange={(event) => setForm((current) => ({ ...current, nome: event.target.value }))}
                    required
                  />
                </div>

                <div className="form-group" style={{ gridColumn: '1/-1' }}>
                  <label className="form-label">E-mail *</label>
                  <input
                    className="input"
                    type="email"
                    placeholder="joao@email.com"
                    value={form.email}
                    onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">CPF *</label>
                  <input
                    className="input"
                    placeholder="000.000.000-00"
                    value={formatCpf(form.cpf)}
                    onChange={(event) => setForm((current) => ({ ...current, cpf: normalizeCpf(event.target.value) }))}
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">WhatsApp *</label>
                  <input
                    className="input"
                    placeholder="(81) 90000-0000"
                    value={form.whatsapp}
                    onChange={(event) => setForm((current) => ({ ...current, whatsapp: event.target.value }))}
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Apartamento *</label>
                  <select
                    className="input"
                    value={form.apartamento}
                    onChange={(event) => setForm((current) => ({ ...current, apartamento: event.target.value }))}
                    required
                  >
                    <option value="">Selecione</option>
                    {APARTMENT_OPTIONS.map((apto) => <option key={apto} value={apto}>Apt. {apto}</option>)}
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">Data de entrada *</label>
                  <input
                    className="input"
                    type="date"
                    value={form.data_entrada}
                    onChange={(event) => setForm((current) => ({ ...current, data_entrada: event.target.value }))}
                    required
                  />
                </div>

                <div className="form-group" style={{ gridColumn: '1/-1' }}>
                  <label className="form-label">Mensagem</label>
                  <textarea
                    className="input"
                    rows={2}
                    placeholder="Alguma informacao adicional..."
                    value={form.mensagem}
                    onChange={(event) => setForm((current) => ({ ...current, mensagem: event.target.value }))}
                  />
                </div>
              </div>

              <p style={S.note}>
                Depois da aprovacao, o acesso sera feito pelo mesmo CPF informado acima.
              </p>

              <button type="submit" disabled={loading} style={{ ...S.btn, ...S.secondaryBtn, marginTop: 4 }}>
                {loading ? (
                  <>
                    <Loader2 size={15} style={{ animation: 'spin .6s linear infinite' }} /> Enviando...
                  </>
                ) : (
                  <>
                    <UserPlus size={15} /> Solicitar acesso
                  </>
                )}
              </button>
              <style>{'@keyframes spin{to{transform:rotate(360deg)}}'}</style>
            </form>
          )}

          {!hasBlockedSession && tab === 'condominio' && (
            <form onSubmit={handleCondominiumRegister} style={{ display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-group" style={{ gridColumn: '1/-1' }}>
                  <label className="form-label">Nome do condominio *</label>
                  <input
                    className="input"
                    placeholder="Condominio Solar das Palmeiras"
                    value={condominiumForm.name}
                    onChange={(event) => setCondominiumForm((current) => ({ ...current, name: event.target.value }))}
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">CNPJ *</label>
                  <input
                    className="input"
                    placeholder="00.000.000/0000-00"
                    value={formatCnpj(condominiumForm.cnpj)}
                    onChange={(event) => setCondominiumForm((current) => ({ ...current, cnpj: normalizeCnpj(event.target.value) }))}
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">WhatsApp do condominio *</label>
                  <input
                    className="input"
                    placeholder="(81) 90000-0000"
                    value={condominiumForm.whatsapp}
                    onChange={(event) => setCondominiumForm((current) => ({ ...current, whatsapp: event.target.value }))}
                    required
                  />
                </div>

                <div className="form-group" style={{ gridColumn: '1/-1' }}>
                  <label className="form-label">Endereco *</label>
                  <input
                    className="input"
                    placeholder="Rua Exemplo, 100 - Bairro - Cidade/UF"
                    value={condominiumForm.address}
                    onChange={(event) => setCondominiumForm((current) => ({ ...current, address: event.target.value }))}
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">CEP *</label>
                  <input
                    className="input"
                    placeholder="00000-000"
                    value={condominiumForm.zipCode}
                    onChange={(event) => setCondominiumForm((current) => ({ ...current, zipCode: event.target.value }))}
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Unidades *</label>
                  <input
                    className="input"
                    type="number"
                    min="1"
                    placeholder="24"
                    value={condominiumForm.unitCount}
                    onChange={(event) => setCondominiumForm((current) => ({ ...current, unitCount: event.target.value }))}
                    required
                  />
                </div>

                <div className="form-group" style={{ gridColumn: '1/-1' }}>
                  <label className="form-label">Dados bancarios ou observacoes financeiras</label>
                  <textarea
                    className="input"
                    rows={2}
                    placeholder="Banco, agencia, conta ou instrucoes iniciais para cobrancas."
                    value={condominiumForm.bankDetails}
                    onChange={(event) => setCondominiumForm((current) => ({ ...current, bankDetails: event.target.value }))}
                  />
                </div>

                <div style={{ gridColumn: '1/-1', display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                  <ShieldCheck size={15} color="#3fb950" />
                  <div style={{ fontSize: 12, color: '#8b949e' }}>Responsavel inicial pelo acesso administrativo</div>
                </div>

                <div className="form-group" style={{ gridColumn: '1/-1' }}>
                  <label className="form-label">Nome do sindico *</label>
                  <input
                    className="input"
                    placeholder="Maria Ferreira"
                    value={condominiumForm.syndicName}
                    onChange={(event) => setCondominiumForm((current) => ({ ...current, syndicName: event.target.value }))}
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">CPF do sindico *</label>
                  <input
                    className="input"
                    placeholder="000.000.000-00"
                    value={formatCpf(condominiumForm.syndicCpf)}
                    onChange={(event) => setCondominiumForm((current) => ({ ...current, syndicCpf: normalizeCpf(event.target.value) }))}
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">E-mail do sindico *</label>
                  <input
                    className="input"
                    type="email"
                    placeholder="sindico@condominio.com"
                    value={condominiumForm.syndicEmail}
                    onChange={(event) => setCondominiumForm((current) => ({ ...current, syndicEmail: event.target.value }))}
                    required
                  />
                </div>

                <div className="form-group" style={{ gridColumn: '1/-1' }}>
                  <label className="form-label">Senha inicial *</label>
                  <input
                    className="input"
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

              <button type="submit" disabled={loading} style={{ ...S.btn, ...S.secondaryBtn, marginTop: 4 }}>
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
          )}
        </div>

        <div style={S.footer}>
          <Building2 size={12} color="#484f58" />
          <span>{COMPANY_COPY}</span>
        </div>
      </div>
    </div>
  )
}

const S = {
  root: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#0d1117',
    position: 'relative',
    overflow: 'hidden',
  },
  bg: {
    position: 'absolute',
    inset: 0,
    background: 'radial-gradient(ellipse 80% 60% at 50% -10%, rgba(63,185,80,0.08) 0%, transparent 70%)',
    pointerEvents: 'none',
  },
  grid: {
    position: 'absolute',
    inset: 0,
    backgroundImage: 'linear-gradient(rgba(48,54,61,0.3) 1px,transparent 1px),linear-gradient(90deg,rgba(48,54,61,0.3) 1px,transparent 1px)',
    backgroundSize: '40px 40px',
    pointerEvents: 'none',
  },
  center: {
    position: 'relative',
    zIndex: 1,
    width: '100%',
    maxWidth: 700,
    padding: '0 20px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
  },
  logo: {
    display: 'flex',
    alignItems: 'center',
    gap: 14,
    marginBottom: 28,
  },
  logoTitle: {
    fontSize: 20,
    fontWeight: 700,
    color: '#e6edf3',
  },
  logoSub: {
    fontSize: 12,
    color: '#8b949e',
    marginTop: 2,
  },
  headline: {
    fontSize: 28,
    fontWeight: 700,
    color: '#e6edf3',
    marginBottom: 8,
    textAlign: 'center',
  },
  sub: {
    fontSize: 14,
    color: '#8b949e',
    marginBottom: 28,
    textAlign: 'center',
    maxWidth: 560,
    lineHeight: 1.6,
  },
  card: {
    background: '#161b22',
    border: '1px solid #30363d',
    borderRadius: 16,
    padding: 32,
    width: '100%',
    maxWidth: 720,
  },
  tabs: {
    display: 'flex',
    borderBottom: '1px solid #30363d',
    marginBottom: 24,
  },
  tabButton: {
    flex: 1,
    background: 'none',
    border: 'none',
    padding: '10px 0',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
    borderBottom: '2px solid transparent',
    marginBottom: -1,
    transition: 'all .15s',
  },
  err: {
    background: '#3a1010',
    border: '1px solid #f85149',
    color: '#f85149',
    borderRadius: 8,
    padding: '10px 14px',
    fontSize: 13,
    marginBottom: 16,
  },
  btn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: '11px 20px',
    borderRadius: 8,
    border: '1px solid',
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'all .15s',
  },
  primaryBtn: {
    background: '#3fb950',
    borderColor: '#3fb950',
    color: '#000',
  },
  secondaryBtn: {
    background: '#58a6ff',
    borderColor: '#58a6ff',
    color: '#fff',
  },
  eye: {
    position: 'absolute',
    right: 10,
    top: '50%',
    transform: 'translateY(-50%)',
    background: 'none',
    border: 'none',
    color: '#8b949e',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
  },
  note: {
    fontSize: 11,
    color: '#8b949e',
    margin: '10px 0',
    lineHeight: 1.5,
  },
  successCard: {
    background: '#161b22',
    border: '1px solid #3fb95040',
    borderRadius: 16,
    padding: 40,
    maxWidth: 440,
    width: '100%',
    textAlign: 'center',
  },
  successTitle: {
    fontSize: 20,
    fontWeight: 700,
    color: '#e6edf3',
    marginBottom: 8,
  },
  successText: {
    fontSize: 13,
    color: '#8b949e',
    lineHeight: 1.7,
    marginBottom: 24,
  },
  footer: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    fontSize: 11,
    color: '#484f58',
    marginTop: 32,
    textAlign: 'center',
  },
}
