import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../../hooks/useAuth'
import SensitiveValue from '../shared/SensitiveValue'
import { useToast } from '../shared/Toast'
import { User, Home, Phone, CreditCard, Send, FilePenLine, X, KeyRound, Mail, Wallet } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { withTenantFields } from '../../lib/tenant'
import { buildProfileUpdateTitle } from '../../lib/residentRequests'
import { compareUnitNumbers, describeResidentAccess, getUnitStatusMeta } from '../../lib/units'

export default function MoradorPerfil() {
  const { profile, condominiumId } = useAuth()
  const access = describeResidentAccess(profile)
  const { toast } = useToast()
  const [showRequestModal, setShowRequestModal] = useState(false)
  const [requestText, setRequestText] = useState('')
  const [history, setHistory] = useState([])
  const [saving, setSaving] = useState(false)
  const [units, setUnits] = useState([])
  const [passwordForm, setPasswordForm] = useState({
    password: '',
    confirmPassword: '',
    show: false,
  })

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

    setSaving(true)
    const { error } = await supabase.auth.updateUser({ password })
    setSaving(false)

    if (error) {
      toast(error.message || 'Nao foi possivel alterar sua senha.', 'error')
      return
    }

    setPasswordForm({
      password: '',
      confirmPassword: '',
      show: false,
    })
    toast('Senha atualizada com sucesso.', 'success')
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

        <div className="card" style={{ marginBottom: 20 }}>
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 18 }}>{access.label}: meus dados</div>
          <div className="profile-fields">
            <ProfileField icon={User} label="Nome completo" value={profile.nome} />
            <ProfileField icon={CreditCard} label="CPF" value={<SensitiveValue value={profile.cpf} type="cpf" />} />
            <ProfileField icon={Phone} label="WhatsApp" value={<SensitiveValue value={profile.whatsapp} type="phone" />} />
            <ProfileField icon={Mail} label="E-mail" value={profile.email && !profile.email.endsWith('@login.webcond.local') ? <SensitiveValue value={profile.email} type="email" /> : '-'} />
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
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 18 }}>Senha de acesso</div>
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
