import { useEffect, useMemo, useState } from 'react'
import { BadgeCheck, CalendarClock, Eye, EyeOff, Info, KeyRound, Save, UserRound } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import { useToast } from '../shared/Toast'
import SensitiveValue from '../shared/SensitiveValue'
import { UpgradeButton } from '../shared/PlanUpgradeNotice'
import { changeOwnPassword, updateOwnProfile } from '../../lib/adminApi'
import { getCondominiumAccessState, getPlan, PUBLIC_PLAN_LIST, TRIAL_PERIOD_DAYS } from '../../lib/condominiumPlan'
import { normalizeRole } from '../../lib/auth'
import { APP_VERSION, APP_VERSION_INFO } from '../../lib/appVersion'
import Suporte from './Suporte'

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
  return `${months} ${months === 1 ? 'mes' : 'meses'} (${days} dias)`
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
    name: isTrial ? `Teste gratuito (recursos do ${plan.label})` : plan.label,
    status,
    isTrial,
    isPartner,
    price: isTrial || isPartner ? 'Gratuito' : `${plan.priceLabel}/mes`,
    startedAt: isTrial ? state.trialStartedAt || state.approvedAt : state.subscriptionActivatedAt || state.approvedAt,
    endsAt: isPartner ? null : state.planEndsAt,
    daysLeft: isPartner ? null : state.planDaysLeft,
    approvedAt: state.approvedAt,
    documentLimit: plan.documentLimit,
    planId: plan.id,
  }
}

export default function Perfil() {
  const { profile, condominiumId, refreshProfile } = useAuth()
  const { toast } = useToast()
  const isSyndic = normalizeRole(profile?.role) === 'admin'
  const [form, setForm] = useState({ nome: '', whatsapp: '', email: '' })
  const [savingData, setSavingData] = useState(false)
  const [pass, setPass] = useState({ atual: '', nova: '', confirma: '', show: false })
  const [savingPass, setSavingPass] = useState(false)
  const [condo, setCondo] = useState(null)

  useEffect(() => {
    setForm({
      nome: profile?.nome || '',
      whatsapp: profile?.whatsapp || '',
      email: INTERNAL_EMAIL.test(profile?.email || '') ? '' : profile?.email || '',
    })
  }, [profile?.nome, profile?.whatsapp, profile?.email])

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
  const version = APP_VERSION_INFO

  const handleSaveData = async (event) => {
    event.preventDefault()
    setSavingData(true)
    try {
      const result = await updateOwnProfile(form)
      await refreshProfile()
      toast(result.emailAlterado ? 'Dados salvos. O e-mail de acesso foi atualizado.' : 'Dados salvos.', 'success')
    } catch (error) {
      toast(error.message || 'Nao foi possivel salvar.', 'error')
    } finally {
      setSavingData(false)
    }
  }

  const handleSavePassword = async (event) => {
    event.preventDefault()
    if (pass.nova.length < 6) { toast('A nova senha precisa ter pelo menos 6 caracteres.', 'error'); return }
    if (pass.nova !== pass.confirma) { toast('A confirmacao nao confere com a nova senha.', 'error'); return }
    setSavingPass(true)
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
      setSavingPass(false)
    }
  }

  const passType = pass.show ? 'text' : 'password'

  return (
    <div className="fade-in">
      <div className="page-header">
        <div className="page-title">Meu perfil</div>
        <div className="page-subtitle">Seus dados de acesso{isSyndic ? ', o plano do condominio e o suporte da WebCond' : ''}.</div>
      </div>

      <div className="profile-grid">
        <div className="profile-col">
          <form className="card" onSubmit={handleSaveData}>
            <div className="profile-card-title"><UserRound size={16} /> Meus dados</div>
            <div className="profile-fields">
              <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                <label className="form-label" htmlFor="perfil-nome">Nome completo</label>
                <input id="perfil-nome" className="input" value={form.nome} maxLength={120} onChange={(event) => setForm({ ...form, nome: event.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="perfil-whatsapp">WhatsApp</label>
                <input id="perfil-whatsapp" className="input" value={form.whatsapp} inputMode="tel" onChange={(event) => setForm({ ...form, whatsapp: event.target.value })} placeholder="(81) 99999-9999" />
              </div>
              <div className="form-group">
                <label className="form-label">CPF</label>
                <div className="input profile-readonly"><SensitiveValue value={profile?.cpf} type="cpf" /></div>
              </div>
              <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                <label className="form-label" htmlFor="perfil-email">E-mail</label>
                <input id="perfil-email" className="input" type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} placeholder="voce@exemplo.com" />
                <span className="profile-hint">E o e-mail da sua conta. O CPF so muda pelo suporte, porque e ele que identifica o seu acesso.</span>
              </div>
            </div>
            <div style={{ marginTop: 16 }}>
              <button type="submit" className="btn btn-primary" disabled={savingData}><Save size={14} /> {savingData ? 'Salvando...' : 'Salvar dados'}</button>
            </div>
          </form>

          <form className="card" onSubmit={handleSavePassword}>
            <div className="profile-card-title"><KeyRound size={16} /> Senha de acesso</div>
            <div className="profile-fields">
              <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                <label className="form-label" htmlFor="perfil-senha-atual">Senha atual</label>
                <input id="perfil-senha-atual" className="input" type={passType} autoComplete="current-password" value={pass.atual} onChange={(event) => setPass({ ...pass, atual: event.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="perfil-senha-nova">Nova senha</label>
                <input id="perfil-senha-nova" className="input" type={passType} autoComplete="new-password" value={pass.nova} onChange={(event) => setPass({ ...pass, nova: event.target.value })} placeholder="Minimo de 6 caracteres" />
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="perfil-senha-confirma">Repita a nova senha</label>
                <input id="perfil-senha-confirma" className="input" type={passType} autoComplete="new-password" value={pass.confirma} onChange={(event) => setPass({ ...pass, confirma: event.target.value })} />
              </div>
            </div>
            <div style={{ marginTop: 16, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button type="submit" className="btn btn-primary" disabled={savingPass || !pass.atual}><KeyRound size={14} /> {savingPass ? 'Alterando...' : 'Alterar senha'}</button>
              <button type="button" className="btn btn-ghost" onClick={() => setPass({ ...pass, show: !pass.show })}>
                {pass.show ? <EyeOff size={14} /> : <Eye size={14} />} {pass.show ? 'Ocultar' : 'Mostrar'}
              </button>
            </div>
          </form>

          <div className="card">
            <div className="profile-card-title"><Info size={16} /> Sobre o sistema</div>
            <div className="profile-rows">
              <div><span>Versao do App</span><strong>{APP_VERSION}</strong></div>
              <div><span>Tipo da atualizacao</span><strong>{version.tipo}</strong></div>
              <div><span>Mes da atualizacao</span><strong>{version.mes}</strong></div>
              <div><span>Ajuste</span><strong>{version.ajuste}</strong></div>
            </div>
          </div>
        </div>

        {isSyndic && (
          <div className="profile-col">
            <div className="card">
              <div className="profile-card-title"><BadgeCheck size={16} /> Meu plano</div>
              {!plan ? <div className="spinner" /> : (
                <>
                  <div className="plan-summary">
                    <div>
                      <div className="plan-summary-name">{plan.name}</div>
                      <div className="plan-summary-price">{plan.price}</div>
                    </div>
                    <span className={`badge ${plan.status.badge}`}>{plan.status.label}</span>
                  </div>
                  <div className="profile-rows">
                    <div><span>Aprovado pela plataforma em</span><strong>{formatDate(plan.approvedAt)}</strong></div>
                    <div><span>{plan.isTrial ? 'Teste iniciado em' : 'Plano ativo desde'}</span><strong>{formatDate(plan.startedAt)}</strong></div>
                    <div><span>Tempo de uso</span><strong>{formatDuration(plan.startedAt)}</strong></div>
                    <div><span>{plan.isTrial ? 'Teste termina em' : 'Valido ate'}</span><strong>{plan.isPartner ? 'Sem vencimento (parceria)' : formatDate(plan.endsAt)}</strong></div>
                    {plan.daysLeft !== null && plan.daysLeft !== undefined && (
                      <div><span>Dias restantes</span><strong style={{ color: plan.daysLeft <= 5 ? 'var(--orange)' : undefined }}>{Math.max(0, plan.daysLeft)}</strong></div>
                    )}
                    <div><span>Documentos por mes</span><strong>{plan.documentLimit}</strong></div>
                  </div>
                  {plan.isTrial && (
                    <p className="profile-hint" style={{ marginTop: 10 }}>
                      O teste dura {TRIAL_PERIOD_DAYS} dias contados da aprovacao do condominio e ja inclui os recursos do ONE.
                    </p>
                  )}
                  <div style={{ marginTop: 12 }}><UpgradeButton small /></div>
                </>
              )}
            </div>

            <div className="card">
              <div className="profile-card-title"><CalendarClock size={16} /> Planos e valores</div>
              <div className="plan-table">
                {PUBLIC_PLAN_LIST.map((item) => (
                  <div key={item.id} className={`plan-table-row ${plan?.planId === item.id && !plan?.isTrial ? 'plan-table-current' : ''}`}>
                    <div>
                      <strong>{item.label}</strong>
                      {!item.available && <span className="badge badge-blue" style={{ marginLeft: 8 }}>Em desenvolvimento</span>}
                      {plan?.planId === item.id && !plan?.isTrial && <span className="badge badge-green" style={{ marginLeft: 8 }}>Seu plano</span>}
                      <div className="plan-table-summary">{item.summary}</div>
                    </div>
                    <div className="plan-table-price">{item.priceLabel}<span>/mes</span></div>
                  </div>
                ))}
              </div>
            </div>

            <Suporte />
          </div>
        )}
      </div>
    </div>
  )
}
