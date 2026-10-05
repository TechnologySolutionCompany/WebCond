import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth } from '../../hooks/useAuth'
import SensitiveValue from '../shared/SensitiveValue'
import { useToast } from '../shared/Toast'
import { User, Home, Phone, CreditCard, Send, X, KeyRound, Mail, LockKeyhole, LifeBuoy, ShieldCheck, LogOut } from 'lucide-react'
import { AccountLinks, ProfileCard, ProfileHeader, ProfileRow, ThemeCard } from '../shared/ProfileCards'
import { supabase } from '../../lib/supabase'
import NotificationSettings from '../shared/NotificationSettings'
import { withTenantFields } from '../../lib/tenant'
import { buildProfileUpdateTitle } from '../../lib/residentRequests'
import { compareUnitNumbers, describeResidentAccess, getUnitStatusMeta } from '../../lib/units'
import { changeMyLoginEmail, changeMyPassword } from '../../lib/tenantApi'
import { loginEmailForDisplay } from '../../lib/loginEmail'

const emptyPassword = { open: false, current: '', password: '', confirmPassword: '', show: false }

export default function MoradorPerfil({ onNavigate = () => {} }) {
  const { profile, condominiumId, refreshProfile, signOut } = useAuth()
  const access = describeResidentAccess(profile)
  const { toast } = useToast()
  const [showRequestModal, setShowRequestModal] = useState(false)
  const [requestText, setRequestText] = useState('')
  const [history, setHistory] = useState([])
  const [saving, setSaving] = useState(false)
  const [units, setUnits] = useState([])
  const [passwordForm, setPasswordForm] = useState(emptyPassword)
  const passwordRef = useRef(null)
  const openPassword = () => {
    setPasswordForm((current) => ({ ...current, open: true }))
    window.setTimeout(() => passwordRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50)
  }
  const [emailForm, setEmailForm] = useState({ open: false, email: '', senhaAtual: '' })
  const loginEmail = loginEmailForDisplay(profile?.email)

  const fetchRequests = useCallback(async () => {
    const { data } = await supabase
      .from('ocorrencias_predio')
      .select('*')
      .eq('created_by', profile.id)
      .like('titulo', 'ALTERACAO_CADASTRAL|%')
      .order('created_at', { ascending: false })

    setHistory(data || [])
  }, [profile?.id])

  useEffect(() => {
    if (!profile?.id) return
    void fetchRequests()
  }, [fetchRequests, profile?.id])

  // Unidades da pessoa e, para o proprietario de unidade alugada, o inquilino (sem CPF e so "Nome Sobrenome").
  useEffect(() => {
    if (!profile?.id) return
    void (async () => {
      const { data, error } = await supabase.rpc('my_unit_people')
      if (error) {
        setUnits((profile.unit_links || []).map((link) => ({ unidade_numero: link.numero, meu_vinculo: link.vinculo })))
        return
      }
      setUnits([...(data || [])].sort((a, b) => compareUnitNumbers(a.unidade_numero, b.unidade_numero)))
    })()
  }, [profile?.id, profile?.unit_links])

  const handleRequest = async () => {
    if (!access.isOwner) {
      toast('Somente o proprietario pode solicitar alteracao do cadastro.', 'error')
      return
    }
    if (!String(requestText || '').trim()) {
      toast('Descreva quais dados voce deseja alterar.', 'error')
      return
    }

    setSaving(true)
    const { error } = await supabase
      .from('ocorrencias_predio')
      .insert(withTenantFields({
        titulo: buildProfileUpdateTitle(profile.id),
        descricao: `Solicitacao de alteracao cadastral:\n${requestText.trim()}`,
        categoria: 'geral',
        status: 'em_analise',
        apartamento: profile?.apartamento || '',
        created_by: profile.id,
      }, condominiumId))
    setSaving(false)

    if (error) {
      toast('Nao foi possivel enviar a solicitacao ao sindico.', 'error')
      return
    }

    toast('Solicitacao enviada ao sindico.', 'success')
    setRequestText('')
    setShowRequestModal(false)
    void fetchRequests()
  }

  const handlePasswordUpdate = async () => {
    const password = String(passwordForm.password || '')
    const confirmPassword = String(passwordForm.confirmPassword || '')

    if (password.length < 6) {
      toast('A nova senha precisa ter pelo menos 6 caracteres.', 'error')
      return
    }

    if (password !== confirmPassword) {
      toast('A confirmacao de senha nao confere.', 'error')
      return
    }

    if (!passwordForm.current) {
      toast('Informe a sua senha atual.', 'error')
      return
    }

    setSaving(true)
    try {
      const result = await changeMyPassword({ senhaAtual: passwordForm.current, novaSenha: password })
      // A troca encerra todas as sessoes; esta continua com a sessao nova que o servidor devolveu.
      if (result.session) await supabase.auth.setSession(result.session)
      setPasswordForm({ ...emptyPassword })
      toast(result.session
        ? 'Senha alterada. Outros aparelhos conectados foram desconectados.'
        : 'Senha alterada. Entre novamente com a nova senha.', 'success')
    } catch (error) {
      toast(error.message || 'Nao foi possivel alterar sua senha.', 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleEmailSave = async (event) => {
    event.preventDefault()
    if (!emailForm.email.trim() || !emailForm.senhaAtual) {
      toast('Informe o e-mail e a sua senha atual.', 'error')
      return
    }

    setSaving(true)
    try {
      const result = await changeMyLoginEmail({ email: emailForm.email, senhaAtual: emailForm.senhaAtual })
      await refreshProfile()
      setEmailForm({ open: false, email: '', senhaAtual: '' })
      toast(result.emailAlterado ? 'E-mail de acesso salvo. Voce ja pode entrar com ele.' : 'Este ja e o seu e-mail de acesso.', 'success')
    } catch (error) {
      toast(error.message || 'Nao foi possivel salvar o e-mail de acesso.', 'error')
    } finally {
      setSaving(false)
    }
  }

  if (!profile) return null

  return (
    <div className="fade-in screen">
      <ProfileHeader nome={profile.nome} subtitle={`${access.label} · ${access.unitsLabel}`} />

      <div className="pf-grid">
        <ProfileCard
          title="Dados pessoais"
          action={access.isOwner
            ? <button type="button" className="pf-action" onClick={() => setShowRequestModal(true)}>Pedir alteração</button>
            : null}
        >
          <ProfileRow icon={User} label="Nome completo" value={profile.nome} />
          <ProfileRow icon={CreditCard} label="CPF" value={<SensitiveValue value={profile.cpf} type="cpf" />} />
          <ProfileRow icon={Phone} label="WhatsApp" value={<SensitiveValue value={profile.whatsapp} type="phone" />} />
          <ProfileRow icon={Mail} label="E-mail de acesso" value={loginEmail ? <SensitiveValue value={loginEmail} type="email" /> : 'Nenhum cadastrado'} />
          {units.map((unit) => {
            const status = unit.situacao ? getUnitStatusMeta(unit.situacao) : null
            const tenantPays = unit.responsavel_financeiro === 'inquilino'
            const details = [
              unit.meu_vinculo === 'inquilino' ? 'Você é o inquilino' : 'Você é o proprietário',
              status?.label,
              unit.responsavel_financeiro ? `Resp. financeiro: ${tenantPays ? 'inquilino' : 'proprietário'}` : '',
            ].filter(Boolean).join(' · ')
            return (
              <ProfileRow
                key={unit.unidade_id || unit.unidade_numero}
                icon={Home}
                label={`Unidade ${unit.unidade_numero}`}
                value={
                  <>
                    <span style={{ whiteSpace: 'normal' }}>{details}</span>
                    {unit.pessoa_vinculo === 'inquilino' && (
                      <span className="list-sub" style={{ fontSize: 13, whiteSpace: 'normal' }}>
                        Inquilino: {unit.pessoa_nome || '-'} · <SensitiveValue value={unit.pessoa_whatsapp} type="phone" />
                      </span>
                    )}
                  </>
                }
              />
            )
          })}
          {!access.isOwner && <div className="pf-card-sub" style={{ paddingTop: 10 }}>Alterações de cadastro são pedidas pelo proprietário da unidade.</div>}
        </ProfileCard>

        <div className="pf-col">
          <NotificationSettings withChannels />
          <ThemeCard />
        </div>

        <ProfileCard
          title="Acesso ao WebCond"
          sub={loginEmail
            ? 'Você entra com este e-mail ou com o seu CPF, sempre com a mesma senha.'
            : 'Hoje você entra com o seu CPF. Cadastre um e-mail para entrar sem precisar digitar o CPF.'}
        >
          {emailForm.open ? (
            <form onSubmit={handleEmailSave} className="pf-form">
              <div className="form-group">
                <label className="form-label" htmlFor="acesso-email">{loginEmail ? 'Novo e-mail de acesso' : 'E-mail de acesso'}</label>
                <input
                  id="acesso-email"
                  className="input"
                  type="email"
                  autoComplete="email"
                  autoCapitalize="none"
                  spellCheck={false}
                  value={emailForm.email}
                  onChange={(event) => setEmailForm((current) => ({ ...current, email: event.target.value }))}
                  placeholder="voce@exemplo.com"
                />
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="acesso-senha">Sua senha atual</label>
                <input
                  id="acesso-senha"
                  className="input"
                  type="password"
                  autoComplete="current-password"
                  value={emailForm.senhaAtual}
                  onChange={(event) => setEmailForm((current) => ({ ...current, senhaAtual: event.target.value }))}
                  placeholder="Confirma que é você"
                />
              </div>
              <div className="me-actions">
                <button type="button" className="btn btn-ghost" onClick={() => setEmailForm({ open: false, email: '', senhaAtual: '' })} disabled={saving}>Cancelar</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  <Mail size={14} /> {saving ? 'Salvando...' : 'Salvar e-mail'}
                </button>
              </div>
            </form>
          ) : (
            <button type="button" className="btn btn-ghost" style={{ alignSelf: 'flex-start' }} onClick={() => setEmailForm({ open: true, email: loginEmail, senhaAtual: '' })}>
              <Mail size={14} /> {loginEmail ? 'Alterar e-mail de acesso' : 'Cadastrar e-mail de acesso'}
            </button>
          )}

          {passwordForm.open && (
            <div className="pf-form" ref={passwordRef} style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--line)' }}>
              <div className="pf-card-title">Trocar senha</div>
              <div className="form-group">
                <label className="form-label" htmlFor="senha-atual">Senha atual</label>
                <input
                  id="senha-atual"
                  className="input"
                  type={passwordForm.show ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={passwordForm.current}
                  onChange={(event) => setPasswordForm((current) => ({ ...current, current: event.target.value }))}
                  placeholder="Digite sua senha atual"
                />
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="senha-nova">Nova senha</label>
                <div style={{ position: 'relative' }}>
                  <input
                    id="senha-nova"
                    className="input"
                    type={passwordForm.show ? 'text' : 'password'}
                    autoComplete="new-password"
                    value={passwordForm.password}
                    onChange={(event) => setPasswordForm((current) => ({ ...current, password: event.target.value }))}
                    placeholder="Mínimo de 6 caracteres"
                  />
                  <button type="button" className="btn btn-ghost btn-sm" style={{ position: 'absolute', right: 8, top: 8 }} onClick={() => setPasswordForm((current) => ({ ...current, show: !current.show }))}>
                    {passwordForm.show ? 'Ocultar' : 'Mostrar'}
                  </button>
                </div>
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="senha-confirma">Confirmar nova senha</label>
                <input
                  id="senha-confirma"
                  className="input"
                  type={passwordForm.show ? 'text' : 'password'}
                  autoComplete="new-password"
                  value={passwordForm.confirmPassword}
                  onChange={(event) => setPasswordForm((current) => ({ ...current, confirmPassword: event.target.value }))}
                  placeholder="Repita a nova senha"
                />
              </div>
              <div className="me-actions">
                <button type="button" className="btn btn-ghost" onClick={() => setPasswordForm({ ...emptyPassword })} disabled={saving}>Cancelar</button>
                <button className="btn btn-primary" onClick={handlePasswordUpdate} disabled={saving}>
                  <KeyRound size={14} /> {saving ? 'Salvando...' : 'Atualizar senha'}
                </button>
              </div>
            </div>
          )}
        </ProfileCard>

        {history.length > 0 && (
          <ProfileCard title="Pedidos de alteração">
            {history.map((item) => (
              <div key={item.id} className="pf-row" style={{ alignItems: 'flex-start' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
                    <span className="pf-row-label">{new Date(item.created_at).toLocaleDateString('pt-BR')}</span>
                    <span className={`pill pill-sm ${item.status === 'resolvido' ? 'tone-green' : 'tone-amber'}`}>{item.status === 'resolvido' ? 'Concluído' : 'Em análise'}</span>
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--text-muted)', whiteSpace: 'pre-line', marginTop: 4, overflowWrap: 'anywhere' }}>{String(item.descricao || '').replace(/^Solicitacao de alteracao cadastral:\n/, '')}</div>
                </div>
              </div>
            ))}
          </ProfileCard>
        )}

        <AccountLinks
          items={[
            { label: 'Trocar senha', icon: LockKeyhole, onClick: openPassword },
            { label: 'Suporte e feedback', icon: LifeBuoy, onClick: () => onNavigate('suporte') },
            { label: 'Privacidade e segurança', icon: ShieldCheck, href: '/politicas/privacidade' },
            { label: 'Sair da conta', icon: LogOut, onClick: () => void signOut(), danger: true },
          ]}
        />
      </div>

      {showRequestModal && (
        <div className="modal-overlay" onClick={(event) => event.target === event.currentTarget && setShowRequestModal(false)}>
          <div className="modal" style={{ maxWidth: 620 }}>
            <div className="modal-header">
              <div className="modal-title">Solicitar alteracao do cadastro</div>
              <button className="btn btn-ghost btn-icon" onClick={() => setShowRequestModal(false)}>
                <X size={16} />
              </button>
            </div>

            <div className="form-group">
              <label className="form-label">Descreva o que precisa ser alterado</label>
              <textarea
                className="input"
                rows={7}
                value={requestText}
                onChange={(event) => setRequestText(event.target.value)}
                placeholder="Ex.: desejo corrigir meu WhatsApp, atualizar meu e-mail ou ajustar meu nome cadastrado."
              />
            </div>

            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setShowRequestModal(false)}>Cancelar</button>
              <button className="btn btn-primary" onClick={handleRequest} disabled={saving}>
                {saving ? 'Enviando...' : <><Send size={14} /> Enviar solicitacao</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
