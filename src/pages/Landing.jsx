import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Building2, Eye, EyeOff, Loader2, Shield, User, UserPlus, ArrowLeft, CheckCircle } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'

export default function Landing() {
  const [mode, setMode] = useState(null) // null | 'morador' | 'admin' | 'cadastro'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const { signIn } = useAuth()
  const navigate = useNavigate()

  const handleLogin = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    const { error: signInError } = await signIn(email, password)
    setLoading(false)
    if (signInError) { setError('E-mail ou senha incorretos.'); return }
    navigate(mode === 'admin' ? '/admin' : '/morador')
  }

  const reset = () => { setMode(null); setError(''); setEmail(''); setPassword('') }

  // Tela inicial
  if (!mode) {
    return (
      <div style={S.root}>
        <div style={S.bg} />
        <div style={S.grid} />
        <div style={S.center}>
          <div style={S.logo}>
            <Building2 size={36} color="#3fb950" />
            <div>
              <div style={S.logoTitle}>WebCond</div>
              <div style={S.logoSub}>Eco Living Residência III</div>
            </div>
          </div>
          <h1 style={S.headline}>Como deseja acessar?</h1>
          <p style={S.sub}>Selecione seu tipo de acesso para continuar</p>
          <div style={S.cards}>
            <button style={S.card} onClick={() => setMode('morador')}>
              <div style={{ ...S.cardIcon, background: '#1a2a3a', border: '2px solid #58a6ff' }}>
                <User size={28} color="#58a6ff" />
              </div>
              <div style={S.cardTitle}>Morador</div>
              <div style={S.cardDesc}>Acesse suas cobranças, avisos e documentos do apartamento</div>
              <div style={{ ...S.cardTag, background: '#1a2a3a', color: '#58a6ff' }}>Área do Morador →</div>
            </button>
            <button style={{ ...S.card, borderColor: '#3fb950' }} onClick={() => setMode('admin')}>
              <div style={{ ...S.cardIcon, background: '#1a3a24', border: '2px solid #3fb950' }}>
                <Shield size={28} color="#3fb950" />
              </div>
              <div style={S.cardTitle}>Administrador</div>
              <div style={S.cardDesc}>Gerencie moradores, cobranças e toda a administração</div>
              <div style={{ ...S.cardTag, background: '#1a3a24', color: '#3fb950' }}>Área do Admin →</div>
            </button>
          </div>
          <button style={S.registerLink} onClick={() => setMode('cadastro')}>
            <UserPlus size={14} /> Ainda não tem acesso? Solicitar cadastro
          </button>
          <div style={S.footer}><Building2 size={12} color="#484f58" /><span>Fragoso, Olinda · Pernambuco</span></div>
        </div>
      </div>
    )
  }

  // Formulário de cadastro
  if (mode === 'cadastro') {
    return <FormCadastro onBack={reset} />
  }

  // Login admin ou morador
  const isAdmin = mode === 'admin'
  const accent = isAdmin ? '#3fb950' : '#58a6ff'
  const accentDim = isAdmin ? '#1a3a24' : '#1a2a3a'

  return (
    <div style={S.root}>
      <div style={S.bg} /><div style={S.grid} />
      <div style={S.center}>
        <button onClick={reset} style={S.back}><ArrowLeft size={14} /> Voltar</button>
        <div style={S.logo}>
          <div style={{ ...S.loginIcon, background: accentDim, border: `2px solid ${accent}` }}>
            {isAdmin ? <Shield size={24} color={accent} /> : <User size={24} color={accent} />}
          </div>
          <div>
            <div style={S.logoTitle}>{isAdmin ? 'Administrador' : 'Morador'}</div>
            <div style={S.logoSub}>Eco Living Residência III</div>
          </div>
        </div>
        <div style={{ ...S.loginCard, borderColor: accent + '40' }}>
          <h2 style={S.loginTitle}>Entrar</h2>
          {error && <div style={S.errorBox}>{error}</div>}
          <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label style={S.label}>E-mail</label>
              <input className="input" type="email" placeholder="seu@email.com"
                value={email} onChange={e => setEmail(e.target.value)} required
                style={{ width: '100%', background: '#1c2333', border: `1px solid ${accent}40`, borderRadius: 8, padding: '9px 12px', color: '#e6edf3', fontSize: 13, outline: 'none' }} />
            </div>
            <div>
              <label style={S.label}>Senha</label>
              <div style={{ position: 'relative' }}>
                <input type={showPass ? 'text' : 'password'} placeholder="••••••••"
                  value={password} onChange={e => setPassword(e.target.value)} required
                  style={{ width: '100%', background: '#1c2333', border: `1px solid ${accent}40`, borderRadius: 8, padding: '9px 40px 9px 12px', color: '#e6edf3', fontSize: 13, outline: 'none' }} />
                <button type="button" onClick={() => setShowPass(!showPass)} style={S.eyeBtn}>
                  {showPass ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>
            <button type="submit" disabled={loading}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '11px 20px', borderRadius: 8, border: 'none', fontSize: 14, fontWeight: 600, cursor: 'pointer', background: accent, color: isAdmin ? '#000' : '#fff', marginTop: 4 }}>
              {loading ? <><Loader2 size={15} style={{ animation: 'spin .6s linear infinite' }} /> Entrando...</> : 'Entrar'}
            </button>
          </form>
          {!isAdmin && (
            <div style={{ marginTop: 16, textAlign: 'center' }}>
              <button onClick={() => setMode('cadastro')} style={{ background: 'none', border: 'none', color: '#58a6ff', fontSize: 13, cursor: 'pointer', textDecoration: 'underline' }}>
                Não tem acesso? Solicitar cadastro
              </button>
            </div>
          )}
        </div>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}

// =============================================
// FORMULÁRIO DE CADASTRO DO MORADOR
// =============================================
function FormCadastro({ onBack }) {
  const [form, setForm] = useState({ nome: '', email: '', telefone: '', whatsapp: '', apartamento: '', cpf: '', mensagem: '' })
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')

  const APTOS = Array.from({ length: 16 }, (_, i) => {
    const floor = Math.floor(i / 4) + 1
    const unit = (i % 4) + 1
    return `${floor}0${unit}`
  })

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.nome || !form.email) { setError('Nome e e-mail são obrigatórios.'); return }
    setLoading(true)
    setError('')
    try {
      const { error: err } = await supabase
        .from('solicitacoes_cadastro')
        .insert([{ ...form, status: 'pendente' }])
      if (err) throw err
      setSent(true)
    } catch (e) {
      setError(e.message || 'Erro ao enviar solicitação.')
    } finally {
      setLoading(false)
    }
  }

  if (sent) {
    return (
      <div style={S.root}>
        <div style={S.bg} /><div style={S.grid} />
        <div style={S.center}>
          <div style={{ textAlign: 'center', maxWidth: 420 }}>
            <div style={{ width: 64, height: 64, borderRadius: '50%', background: '#1a3a24', border: '2px solid #3fb950', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
              <CheckCircle size={32} color="#3fb950" />
            </div>
            <div style={{ fontSize: 20, fontWeight: 700, color: '#e6edf3', marginBottom: 12 }}>Solicitação enviada!</div>
            <div style={{ fontSize: 13, color: '#8b949e', lineHeight: 1.7, marginBottom: 24 }}>
              Sua solicitação foi registrada. O administrador será notificado e irá liberar seu acesso em breve.<br /><br />
              Você receberá suas credenciais de acesso após a aprovação.
            </div>
            <button onClick={onBack} style={{ background: '#3fb950', border: 'none', borderRadius: 8, padding: '10px 24px', color: '#000', fontWeight: 600, fontSize: 14, cursor: 'pointer' }}>
              Voltar ao início
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={S.root}>
      <div style={S.bg} /><div style={S.grid} />
      <div style={{ ...S.center, maxWidth: 520 }}>
        <button onClick={onBack} style={S.back}><ArrowLeft size={14} /> Voltar</button>
        <div style={S.logo}>
          <div style={{ ...S.loginIcon, background: '#1a2a3a', border: '2px solid #58a6ff' }}>
            <UserPlus size={22} color="#58a6ff" />
          </div>
          <div>
            <div style={S.logoTitle}>Solicitar Cadastro</div>
            <div style={S.logoSub}>Eco Living Residência III</div>
          </div>
        </div>

        <div style={{ ...S.loginCard, borderColor: '#58a6ff40', maxWidth: 480 }}>
          <div style={{ fontSize: 12, color: '#8b949e', marginBottom: 20, lineHeight: 1.5, background: '#1a2a3a', borderRadius: 8, padding: '10px 12px', border: '1px solid #58a6ff30' }}>
            Preencha o formulário abaixo. O administrador receberá sua solicitação e liberará seu acesso.
          </div>
          {error && <div style={S.errorBox}>{error}</div>}
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div style={{ gridColumn: '1/-1' }}>
                <label style={S.label}>Nome completo *</label>
                <input style={S.inp} value={form.nome} onChange={e => setForm(f => ({...f, nome: e.target.value}))} placeholder="João da Silva" required />
              </div>
              <div style={{ gridColumn: '1/-1' }}>
                <label style={S.label}>E-mail *</label>
                <input style={S.inp} type="email" value={form.email} onChange={e => setForm(f => ({...f, email: e.target.value}))} placeholder="joao@email.com" required />
              </div>
              <div>
                <label style={S.label}>Apartamento</label>
                <select style={S.inp} value={form.apartamento} onChange={e => setForm(f => ({...f, apartamento: e.target.value}))}>
                  <option value="">Selecione</option>
                  {APTOS.map(a => <option key={a} value={a}>Apt. {a}</option>)}
                </select>
              </div>
              <div>
                <label style={S.label}>CPF</label>
                <input style={S.inp} value={form.cpf} onChange={e => setForm(f => ({...f, cpf: e.target.value}))} placeholder="000.000.000-00" />
              </div>
              <div>
                <label style={S.label}>Telefone</label>
                <input style={S.inp} value={form.telefone} onChange={e => setForm(f => ({...f, telefone: e.target.value}))} placeholder="(81) 9 0000-0000" />
              </div>
              <div>
                <label style={S.label}>WhatsApp</label>
                <input style={S.inp} value={form.whatsapp} onChange={e => setForm(f => ({...f, whatsapp: e.target.value}))} placeholder="(81) 9 0000-0000" />
              </div>
              <div style={{ gridColumn: '1/-1' }}>
                <label style={S.label}>Mensagem (opcional)</label>
                <textarea style={{ ...S.inp, resize: 'vertical' }} rows={2} value={form.mensagem} onChange={e => setForm(f => ({...f, mensagem: e.target.value}))} placeholder="Alguma informação adicional..." />
              </div>
            </div>
            <button type="submit" disabled={loading}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '11px', borderRadius: 8, border: 'none', fontSize: 14, fontWeight: 600, cursor: 'pointer', background: '#58a6ff', color: '#fff', marginTop: 4 }}>
              {loading ? <><Loader2 size={15} style={{ animation: 'spin .6s linear infinite' }} /> Enviando...</> : <><UserPlus size={15} /> Enviar Solicitação</>}
            </button>
          </form>
        </div>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}

const inp = { width: '100%', background: '#1c2333', border: '1px solid #30363d', borderRadius: 8, padding: '9px 12px', color: '#e6edf3', fontSize: 13, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }

const S = {
  root: { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0d1117', position: 'relative', overflow: 'hidden' },
  bg: { position: 'absolute', inset: 0, background: 'radial-gradient(ellipse 80% 60% at 50% -10%, rgba(63,185,80,0.08) 0%, transparent 70%)', pointerEvents: 'none' },
  grid: { position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(rgba(48,54,61,0.3) 1px, transparent 1px), linear-gradient(90deg, rgba(48,54,61,0.3) 1px, transparent 1px)', backgroundSize: '40px 40px', pointerEvents: 'none' },
  center: { position: 'relative', zIndex: 1, width: '100%', maxWidth: 700, padding: '40px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center' },
  logo: { display: 'flex', alignItems: 'center', gap: 14, marginBottom: 32 },
  logoTitle: { fontSize: 20, fontWeight: 700, color: '#e6edf3' },
  logoSub: { fontSize: 12, color: '#8b949e', marginTop: 2 },
  loginIcon: { width: 48, height: 48, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  headline: { fontSize: 26, fontWeight: 700, color: '#e6edf3', marginBottom: 8, textAlign: 'center' },
  sub: { fontSize: 14, color: '#8b949e', marginBottom: 36, textAlign: 'center' },
  cards: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, width: '100%' },
  card: { background: '#161b22', border: '1px solid #30363d', borderRadius: 16, padding: '28px 24px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, cursor: 'pointer', transition: 'all 0.2s', color: '#e6edf3', textAlign: 'center' },
  cardIcon: { width: 60, height: 60, borderRadius: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  cardTitle: { fontSize: 18, fontWeight: 700 },
  cardDesc: { fontSize: 13, color: '#8b949e', lineHeight: 1.6 },
  cardTag: { padding: '6px 14px', borderRadius: 20, fontSize: 12, fontWeight: 600, marginTop: 4 },
  registerLink: { display: 'flex', alignItems: 'center', gap: 7, marginTop: 24, background: 'none', border: '1px solid #30363d', borderRadius: 8, padding: '8px 16px', color: '#8b949e', fontSize: 13, cursor: 'pointer' },
  footer: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#484f58', marginTop: 24 },
  back: { alignSelf: 'flex-start', background: 'none', border: 'none', color: '#8b949e', fontSize: 13, cursor: 'pointer', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 6 },
  loginCard: { background: '#161b22', border: '1px solid', borderRadius: 16, padding: 28, width: '100%', maxWidth: 420 },
  loginTitle: { fontSize: 18, fontWeight: 700, marginBottom: 20, color: '#e6edf3' },
  errorBox: { background: '#3a1010', border: '1px solid #f85149', color: '#f85149', borderRadius: 8, padding: '10px 14px', fontSize: 13, marginBottom: 14 },
  label: { display: 'block', fontSize: 11, fontWeight: 600, color: '#8b949e', letterSpacing: '.05em', textTransform: 'uppercase', marginBottom: 6 },
  inp,
  eyeBtn: { position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: '#8b949e', cursor: 'pointer', display: 'flex', alignItems: 'center' },
}
