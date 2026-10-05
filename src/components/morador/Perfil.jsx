import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../../hooks/useAuth'
import SensitiveValue from '../shared/SensitiveValue'
import { useToast } from '../shared/Toast'
import { User, Home, Phone, CreditCard, Send, FilePenLine, X, KeyRound, Mail, Wallet } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import NotificationSettings from '../shared/NotificationSettings'
import { withTenantFields } from '../../lib/tenant'
import { buildProfileUpdateTitle } from '../../lib/residentRequests'
import { compareUnitNumbers, describeResidentAccess, getUnitStatusMeta } from '../../lib/units'
import { changeMyLoginEmail, changeMyPassword } from '../../lib/tenantApi'
import { loginEmailForDisplay } from '../../lib/loginEmail'

export default function MoradorPerfil() {
  const { profile, condominiumId, refreshProfile } = useAuth()
  const access = describeResidentAccess(profile)
  const { toast } = useToast()
  const [showRequestModal, setShowRequestModal] = useState(false)
  const [requestText, setRequestText] = useState('')
  const [history, setHistory] = useState([])
  const [saving, setSaving] = useState(false)
  const [units, setUnits] = useState([])
  const [passwordForm, setPasswordForm] = useState({
    current: '',
    password: '',
    confirmPassword: '',
    show: false,
  })
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
      setPasswordForm({ current: '', password: '', confirmPassword: '', show: false })
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
    <div className="fade-in">
      <div className="page-header">
        <div className="page-title">Meu perfil</div>
        <div className="page-subtitle">Dados cadastrais e canal de solicitacao de alteracao</div>
      </div>

      <div style={{ maxWidth: 760 }}>
        <div className="card" style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: 20, fontWeight: 700 }}>{profile.nome}</div>
              <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                <span className={`badge ${access.isOwner ? 'badge-green' : 'badge-blue'}`}>{access.label}</span>
                <span className="badge badge-purple"><Home size={10} /> {access.unitsLabel}</span>
                <span className="badge badge-green">Cadastro gerenciado pelo sindico</span>
              </div>
            </div>

            {access.isOwner ? (
              <button className="btn btn-primary" onClick={() => setShowRequestModal(true)}>
                <FilePenLine size={14} /> Solicitar alteracao do cadastro
              </button>
            ) : (
              <div style={{ fontSize: 12, color: 'var(--text-muted)', maxWidth: 260 }}>
                Alteracoes de cadastro sao solicitadas pelo proprietario da unidade.
              </div>
            )}
          </div>
        </div>

        <div style={{ marginBottom: 20 }}>
          <NotificationSettings withChannels />
        </div>

        <div className="card" style={{ marginBottom: 20 }}>
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 18 }}>{access.label}: meus dados</div>
          <div className="profile-fields">
            <ProfileField icon={User} label="Nome completo" value={profile.nome} />
            <ProfileField icon={CreditCard} label="CPF" value={<SensitiveValue value={profile.cpf} type="cpf" />} />
            <ProfileField icon={Phone} label="WhatsApp" value={<SensitiveValue value={profile.whatsapp} type="phone" />} />
          </div>
        </div>

        {units.map((unit) => {
          const status = unit.situacao ? getUnitStatusMeta(unit.situacao) : null
          const tenantPays = unit.responsavel_financeiro === 'inquilino'
          return (
            <div key={unit.unidade_id || unit.unidade_numero} className="card" style={{ marginBottom: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 18, flexWrap: 'wrap' }}>
                <span style={{ fontWeight: 700, fontSize: 14 }}>Unidade {unit.unidade_numero}</span>
                {status && <span className={`badge ${status.badge}`}>{status.label}</span>}
                <span className="badge badge-blue">{unit.meu_vinculo === 'inquilino' ? 'Voce e o inquilino' : 'Voce e o proprietario'}</span>
              </div>
              <div className="profile-fields">
                {unit.responsavel_financeiro && (
                  <ProfileField icon={Wallet} label="Responsavel financeiro" value={tenantPays ? 'Inquilino' : 'Proprietario'} />
                )}
                {unit.pessoa_vinculo === 'inquilino' && (
                  <>
                    <ProfileField icon={User} label="Inquilino" value={unit.pessoa_nome || '-'} />
                    <ProfileField icon={Phone} label="WhatsApp do inquilino" value={<SensitiveValue value={unit.pessoa_whatsapp} type="phone" />} />
                  </>
                )}
              </div>
            </div>
          )
        })}

        <div className="card" style={{ marginBottom: 20 }}>
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 6 }}>Acesso ao WebCond</div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16, lineHeight: 1.5 }}>
            {loginEmail
              ? 'Voce entra com este e-mail ou com o seu CPF, sempre com a mesma senha.'
              : 'Hoje voce entra com o seu CPF. Cadastre um e-mail para entrar sem precisar digitar o CPF.'}
          </div>
          <div className="profile-fields">
            <ProfileField icon={Mail} label="E-mail de acesso" value={loginEmail ? <SensitiveValue value={loginEmail} type="email" /> : 'Nenhum cadastrado'} />
          </div>

          {emailForm.open ? (
            <form onSubmit={handleEmailSave} style={{ marginTop: 16 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
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
                    placeholder="Confirma que e voce"
                  />
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
                <button type="button" className="btn btn-ghost" onClick={() => setEmailForm({ open: false, email: '', senhaAtual: '' })} disabled={saving}>Cancelar</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  <Mail size={14} /> {saving ? 'Salvando...' : 'Salvar e-mail'}
                </button>
              </div>
            </form>
          ) : (
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
              <button type="button" className="btn btn-ghost" onClick={() => setEmailForm({ open: true, email: loginEmail, senhaAtual: '' })}>
                <Mail size={14} /> {loginEmail ? 'Alterar e-mail de acesso' : 'Cadastrar e-mail de acesso'}
              </button>
            </div>
          )}
        </div>

        <div className="card" style={{ marginBottom: 20 }}>
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 18 }}>Senha de acesso</div>
          <div className="form-group" style={{ marginBottom: 16 }}>
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
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div className="form-group">
              <label className="form-label">Nova senha</label>
              <div style={{ position: 'relative' }}>
                <input
                  className="input"
                  type={passwordForm.show ? 'text' : 'password'}
                  value={passwordForm.password}
                  onChange={(event) => setPasswordForm((current) => ({ ...current, password: event.target.value }))}
                  placeholder="Digite sua nova senha"
                />
                <button type="button" className="btn btn-ghost btn-sm" style={{ position: 'absolute', right: 8, top: 7 }} onClick={() => setPasswordForm((current) => ({ ...current, show: !current.show }))}>
                  {passwordForm.show ? 'Ocultar' : 'Mostrar'}
                </button>
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Confirmar nova senha</label>
              <input
                className="input"
                type={passwordForm.show ? 'text' : 'password'}
                value={passwordForm.confirmPassword}
                onChange={(event) => setPasswordForm((current) => ({ ...current, confirmPassword: event.target.value }))}
                placeholder="Repita a nova senha"
              />
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
            <button className="btn btn-primary" onClick={handlePasswordUpdate} disabled={saving}>
              <KeyRound size={14} /> {saving ? 'Salvando...' : 'Atualizar senha'}
            </button>
          </div>
        </div>

        <div className="card">
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 16 }}>Historico de solicitacoes</div>

          {history.length === 0 ? (
            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Nenhuma solicitacao de alteracao enviada ate o momento.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {history.map((item) => (
                <div key={item.id} style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 14, background: 'var(--bg-3)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', marginBottom: 6 }}>
                    <div style={{ fontWeight: 600 }}>Solicitacao enviada</div>
                    <span className={`badge ${item.status === 'resolvido' ? 'badge-green' : 'badge-orange'}`}>
                      {item.status === 'resolvido' ? 'Concluida' : 'Em analise'}
                    </span>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'pre-line' }}>{item.descricao}</div>
                </div>
              ))}
            </div>
          )}
        </div>
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

function ProfileField({ icon: Icon, label, value }) {
  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
      <div style={{ width: 36, height: 36, borderRadius: 8, background: 'var(--bg-3)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <Icon size={15} color="var(--text-muted)" />
      </div>
      <div>
        <div style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '.06em', fontWeight: 600 }}>{label}</div>
        <div style={{ fontSize: 13, fontWeight: 500, marginTop: 1 }}>{value}</div>
      </div>
    </div>
  )
}
