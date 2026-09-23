import { useEffect, useMemo, useState } from 'react'
import { ArrowUpRight, Eye, EyeOff, KeyRound, Save } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import { useToast } from '../shared/Toast'
import SensitiveValue from '../shared/SensitiveValue'
import { changeOwnPassword, updateOwnProfile } from '../../lib/adminApi'
import { getCondominiumAccessState, getPlan, TRIAL_PERIOD_DAYS } from '../../lib/condominiumPlan'
import { getUserRoleLabel, normalizeRole } from '../../lib/auth'
import { APP_VERSION } from '../../lib/appVersion'

const INTERNAL_EMAIL = /@login\.webcond\.local$/i
const DAY_MS = 86400000

function formatDate(value) {
  return value ? new Date(value).toLocaleDateString('pt-BR') : '-'
}

function formatDuration(from) {
  if (!from) return '-'
  const days = Math.max(0, Math.floor((Date.now() - new Date(from).getTime()) / DAY_MS))
  if (days < 1) return 'menos de 1 dia'
  if (days < 60) return `${days} ${days === 1 ? 'dia' : 'dias'}`
  const months = Math.floor(days / 30)
  return `${months} ${months === 1 ? 'mes' : 'meses'}`
}

// Resumo do plano para o proprio sindico: o que ele tem, desde quando, ate quando e quanto custa.
function describePlan(state) {
  if (!state) return null
  const plan = getPlan(state.planName)
  const isTrial = state.subscriptionStatus !== 'active'
  const isPartner = Boolean(plan.partnership) && !isTrial

  let status = { label: 'Ativo', badge: 'badge-green' }
  if (state.planLocked) status = { label: isTrial ? 'Teste encerrado' : 'Vencido', badge: 'badge-red' }
  else if (isTrial) status = { label: 'Em teste', badge: 'badge-blue' }
  else if (state.planExpiringSoon) status = { label: 'Vence em breve', badge: 'badge-orange' }

  return {
    name: isTrial ? 'Teste gratuito' : plan.label,
    status,
    isTrial,
    isPartner,
    price: isTrial || isPartner ? 'Gratuito' : `${plan.priceLabel}/mes`,
    startedAt: isTrial ? state.trialStartedAt || state.approvedAt : state.subscriptionActivatedAt || state.approvedAt,
    endsAt: isPartner ? null : state.planEndsAt,
    daysLeft: isPartner ? null : state.planDaysLeft,
    documentLimit: plan.documentLimit,
    planId: plan.id,
  }
}

function Row({ label, children }) {
  return <div className="me-row"><span>{label}</span><strong>{children}</strong></div>
}

function DadosTab({ profile, refreshProfile }) {
  const { toast } = useToast()
  const [form, setForm] = useState({ nome: '', whatsapp: '', email: '' })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setForm({
      nome: profile?.nome || '',
      whatsapp: profile?.whatsapp || '',
      email: INTERNAL_EMAIL.test(profile?.email || '') ? '' : profile?.email || '',
    })
  }, [profile?.nome, profile?.whatsapp, profile?.email])

  const handleSave = async (event) => {
    event.preventDefault()
    setSaving(true)
    try {
      const result = await updateOwnProfile(form)
      await refreshProfile()
      toast(result.emailAlterado ? 'Dados salvos. O e-mail de acesso foi atualizado.' : 'Dados salvos.', 'success')
    } catch (error) {
      toast(error.message || 'Nao foi possivel salvar.', 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form className="me-panel" onSubmit={handleSave}>
      <div className="form-group">
        <label className="form-label" htmlFor="perfil-nome">Nome completo</label>
        <input id="perfil-nome" className="input" value={form.nome} maxLength={120} onChange={(event) => setForm({ ...form, nome: event.target.value })} />
      </div>
      <div className="me-grid">
        <div className="form-group">
          <label className="form-label" htmlFor="perfil-whatsapp">WhatsApp</label>
          <input id="perfil-whatsapp" className="input" value={form.whatsapp} inputMode="tel" onChange={(event) => setForm({ ...form, whatsapp: event.target.value })} placeholder="(81) 99999-9999" />
        </div>
        <div className="form-group">
          <label className="form-label">CPF</label>
          <div className="input profile-readonly"><SensitiveValue value={profile?.cpf} type="cpf" /></div>
        </div>
      </div>
      <div className="form-group">
        <label className="form-label" htmlFor="perfil-email">E-mail</label>
        <input id="perfil-email" className="input" type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} placeholder="voce@exemplo.com" />
        <span className="profile-hint">O CPF so muda pelo suporte: e ele que identifica o seu acesso.</span>
      </div>
      <div className="me-actions">
        <button type="submit" className="btn btn-primary" disabled={saving}><Save size={14} /> {saving ? 'Salvando...' : 'Salvar'}</button>
      </div>
    </form>
  )
}

function SenhaTab() {
  const { toast } = useToast()
  const [pass, setPass] = useState({ atual: '', nova: '', confirma: '', show: false })
  const [saving, setSaving] = useState(false)
  const type = pass.show ? 'text' : 'password'

  const handleSave = async (event) => {
    event.preventDefault()
    if (pass.nova.length < 6) { toast('A nova senha precisa ter pelo menos 6 caracteres.', 'error'); return }
    if (pass.nova !== pass.confirma) { toast('A confirmacao nao confere com a nova senha.', 'error'); return }
    setSaving(true)
    try {
      const result = await changeOwnPassword({ senhaAtual: pass.atual, novaSenha: pass.nova })
      // A troca encerra todas as sessoes; esta continua com a sessao nova que o servidor devolveu.
      if (result.session) await supabase.auth.setSession(result.session)
      setPass({ atual: '', nova: '', confirma: '', show: false })
      toast(result.session
        ? 'Senha alterada. Outros aparelhos conectados foram desconectados.'
        : 'Senha alterada. Entre novamente com a nova senha.', 'success')
    } catch (error) {
      toast(error.message || 'Nao foi possivel alterar a senha.', 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form className="me-panel" onSubmit={handleSave}>
      <div className="form-group">
        <label className="form-label" htmlFor="perfil-senha-atual">Senha atual</label>
        <input id="perfil-senha-atual" className="input" type={type} autoComplete="current-password" value={pass.atual} onChange={(event) => setPass({ ...pass, atual: event.target.value })} />
      </div>
      <div className="me-grid">
        <div className="form-group">
          <label className="form-label" htmlFor="perfil-senha-nova">Nova senha</label>
          <input id="perfil-senha-nova" className="input" type={type} autoComplete="new-password" value={pass.nova} onChange={(event) => setPass({ ...pass, nova: event.target.value })} placeholder="Minimo de 6 caracteres" />
        </div>
        <div className="form-group">
          <label className="form-label" htmlFor="perfil-senha-confirma">Repita a nova senha</label>
          <input id="perfil-senha-confirma" className="input" type={type} autoComplete="new-password" value={pass.confirma} onChange={(event) => setPass({ ...pass, confirma: event.target.value })} />
        </div>
      </div>
      <span className="profile-hint">Ao trocar a senha, os outros aparelhos conectados saem da conta.</span>
      <div className="me-actions">
        <button type="button" className="btn btn-ghost" onClick={() => setPass({ ...pass, show: !pass.show })}>
          {pass.show ? <EyeOff size={14} /> : <Eye size={14} />} {pass.show ? 'Ocultar' : 'Mostrar'}
        </button>
        <button type="submit" className="btn btn-primary" disabled={saving || !pass.atual}><KeyRound size={14} /> {saving ? 'Alterando...' : 'Alterar senha'}</button>
      </div>
    </form>
  )
}

function PlanoTab({ plan, onNavigate }) {
  if (!plan) return <div className="me-panel"><div className="spinner" /></div>

  return (
    <div className="me-panel">
      <div className="plan-summary">
        <div>
          <div className="plan-summary-name">{plan.name}</div>
          <div className="plan-summary-price">{plan.price}</div>
        </div>
        <span className={`badge ${plan.status.badge}`}>{plan.status.label}</span>
      </div>
      <div className="me-rows">
        <Row label={plan.isTrial ? 'Teste iniciado em' : 'Ativo desde'}>{formatDate(plan.startedAt)}</Row>
        <Row label="Tempo de uso">{formatDuration(plan.startedAt)}</Row>
        <Row label={plan.isTrial ? 'Teste termina em' : 'Valido ate'}>{plan.isPartner ? 'Sem vencimento' : formatDate(plan.endsAt)}</Row>
        {plan.daysLeft !== null && plan.daysLeft !== undefined && (
          <Row label="Dias restantes"><span style={{ color: plan.daysLeft <= 5 ? 'var(--orange)' : undefined }}>{Math.max(0, plan.daysLeft)}</span></Row>
        )}
        <Row label="Documentos por mes">{plan.documentLimit}</Row>
      </div>
      {plan.isTrial && <span className="profile-hint">O teste dura {TRIAL_PERIOD_DAYS} dias a partir da aprovacao e inclui os recursos do ONE.</span>}
      <div className="me-actions">
        <button type="button" className="btn btn-primary" onClick={() => onNavigate?.('planos')}>
          <ArrowUpRight size={14} /> Melhorar meu plano
        </button>
      </div>
    </div>
  )
}

// Perfil do sindico (e do contador): uma coluna, uma aba por assunto.
export default function Perfil({ onNavigate }) {
  const { profile, condominiumId, refreshProfile } = useAuth()
  const isSyndic = normalizeRole(profile?.role) === 'admin'
  const [tab, setTab] = useState('dados')
  const [condo, setCondo] = useState(null)

  useEffect(() => {
    if (!condominiumId) return
    void (async () => {
      const { data } = await supabase
        .from('condominiums')
        .select('id, name, nome, status, metadata, created_at, updated_at')
        .eq('id', condominiumId)
        .maybeSingle()
      setCondo(data || null)
    })()
  }, [condominiumId])

  const plan = useMemo(() => describePlan(condo ? getCondominiumAccessState(condo) : null), [condo])

  const tabs = [
    { key: 'dados', label: 'Dados' },
    { key: 'senha', label: 'Senha' },
    ...(isSyndic ? [{ key: 'plano', label: 'Meu plano' }] : []),
  ]
  const initial = String(profile?.nome || '?').trim().charAt(0).toUpperCase()

  return (
    <div className="fade-in me-shell">
      <div className="page-header">
        <div className="page-title">Meu perfil</div>
      </div>

      <div className="me-head">
        <div className="me-avatar" aria-hidden="true">{initial}</div>
        <div className="me-head-text">
          <strong>{profile?.nome || '-'}</strong>
          <span>{getUserRoleLabel(profile?.role)}{condo ? ` · ${condo.name || condo.nome}` : ''}</span>
        </div>
        {isSyndic && plan && <span className={`badge ${plan.status.badge}`}>{plan.name}</span>}
      </div>

      <div className="condo-tabs" role="tablist">
        {tabs.map((item) => (
          <button key={item.key} type="button" className="condo-tab" role="tab" aria-selected={tab === item.key} onClick={() => setTab(item.key)}>
            {item.label}
          </button>
        ))}
      </div>

      {tab === 'dados' && <DadosTab profile={profile} refreshProfile={refreshProfile} />}
      {tab === 'senha' && <SenhaTab />}
      {tab === 'plano' && isSyndic && <PlanoTab plan={plan} onNavigate={onNavigate} />}

      <div className="me-version">
        <img src="/logo.svg" alt="" aria-hidden="true" className="marca-mini marca-mini-sm" />
        WebCond · Versao do App {APP_VERSION}
      </div>
    </div>
  )
}
