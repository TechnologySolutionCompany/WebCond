import { useCallback, useEffect, useMemo, useState } from 'react'
import { UserPlus, Search, Edit2, X, Loader2, Home, User, Copy, KeyRound, MessageCircle, Trash2, Bell } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { createResident, deleteResident, updateResident } from '../../lib/adminApi'
import { formatCpf, normalizeCpf } from '../../lib/cpf'
import { buildProfileObservation, getMoradiaMeta } from '../../lib/profileMeta'
import { useToast } from '../shared/Toast'
import { useAuth } from '../../hooks/useAuth'
import { applyTenantFilter } from '../../lib/tenant'
import { buildResidentRequestSummary, isResidentRequestPending } from '../../lib/residentRequests'

const MORADIA_OPTIONS = [
  { value: 'morando', label: 'Morando', color: 'green' },
  { value: 'alugado', label: 'Alugado', color: 'orange' },
  { value: 'desocupado', label: 'Desocupado', color: 'red' },
]

const emptyForm = {
  nome: '',
  apartamento: '',
  cpf: '',
  whatsapp: '',
  nova_senha: '',
  status_moradia: 'morando',
  inquilino_nome: '',
  inquilino_telefone: '',
}

function buildResidentInternalEmail(cpf) {
  const normalizedCpf = normalizeCpf(cpf)
  return normalizedCpf ? `morador-${normalizedCpf}@login.webcond.local` : ''
}

function isBackendConfigError(message = '') {
  return message.includes('SUPABASE_SERVICE_ROLE_KEY')
    || message.includes('SUPABASE_URL')
    || message.toLowerCase().includes('service role')
    || message.includes('backend')
}

export default function Moradores() {
  const [moradores, setMoradores] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState(null)
  const [showPassword, setShowPassword] = useState(false)
  const [senhaGerada, setSenhaGerada] = useState(null)
  const [showMessageModal, setShowMessageModal] = useState(false)
  const [messageTarget, setMessageTarget] = useState(null)
  const [messageText, setMessageText] = useState('')
  const [notifications, setNotifications] = useState([])
  const [selectedResidentNotifications, setSelectedResidentNotifications] = useState(null)
  const { condominiumId } = useAuth()
  const { toast } = useToast()

  const fetchMoradores = useCallback(async () => {
    setLoading(true)
    const [profilesRes, notificationsRes] = await Promise.all([
      applyTenantFilter(
        supabase
          .from('profiles')
          .select('*')
          .in('role', ['morador', 'RESIDENT'])
          .order('apartamento'),
        condominiumId,
      ),
      applyTenantFilter(
        supabase
          .from('ocorrencias_predio')
          .select('*')
          .order('created_at', { ascending: false }),
        condominiumId,
      ),
    ])

    setMoradores(profilesRes.data || [])
    setNotifications(notificationsRes.data || [])
    setLoading(false)
  }, [condominiumId])

  useEffect(() => {
    void fetchMoradores()
  }, [fetchMoradores])

  const openCreate = () => {
    setEditing(null)
    setForm(emptyForm)
    setSenhaGerada(null)
    setShowPassword(false)
    setShowModal(true)
  }

  const openEdit = (morador) => {
    const moradiaMeta = getMoradiaMeta(morador)
    setEditing(morador)
    setForm({
      nome: morador.nome || '',
      apartamento: morador.apartamento || '',
      cpf: morador.cpf || '',
      whatsapp: morador.whatsapp || '',
      nova_senha: '',
      status_moradia: moradiaMeta.status_moradia,
      inquilino_nome: moradiaMeta.inquilino_nome,
      inquilino_telefone: moradiaMeta.inquilino_telefone,
    })
    setSenhaGerada(null)
    setShowPassword(false)
    setShowModal(true)
  }

  const saveProfileFallback = async ({ keepAuthEmail }) => {
    const generatedEmail = buildResidentInternalEmail(form.cpf)
    const updatePayload = {
      nome: form.nome,
      telefone: '',
      apartamento: form.apartamento,
      cpf: normalizeCpf(form.cpf),
      whatsapp: String(form.whatsapp || '').replace(/\D/g, ''),
      data_entrada: null,
      observacao: buildProfileObservation(editing, form.status_moradia, {
        inquilino_nome: form.inquilino_nome,
        inquilino_telefone: form.inquilino_telefone,
      }),
      updated_at: new Date().toISOString(),
    }

    if (!keepAuthEmail) {
      updatePayload.email = generatedEmail
    }

    const { error } = await supabase
      .from('profiles')
      .update(updatePayload)
      .eq('id', editing.id)

    if (error) throw error
  }

  const handleSave = async () => {
    if (!form.nome || !form.whatsapp || !form.apartamento) {
      toast('Preencha nome, apartamento e WhatsApp.', 'error')
      return
    }

    if (normalizeCpf(form.cpf).length !== 11) {
      toast('Informe um CPF valido com 11 digitos.', 'error')
      return
    }

    if (!editing && String(form.nova_senha || '').trim().length < 6) {
      toast('Defina uma senha de acesso com pelo menos 6 caracteres.', 'error')
      return
    }

    if (form.status_moradia === 'alugado' && (!String(form.inquilino_nome || '').trim() || !String(form.inquilino_telefone || '').trim())) {
      toast('Informe nome e telefone do inquilino quando a unidade estiver alugada.', 'error')
      return
    }

    setSaving(true)

    try {
      if (editing) {
        let usedFallback = false
        let authFieldsChanged = false

        try {
          await updateResident({
            userId: editing.id,
            nome: form.nome,
            email: buildResidentInternalEmail(form.cpf),
            role: editing.role || 'morador',
            apartamento: form.apartamento,
            cpf: normalizeCpf(form.cpf),
            whatsapp: String(form.whatsapp || '').replace(/\D/g, ''),
            ativo: editing.ativo,
            password: form.nova_senha,
          })

          const { error: profileError } = await supabase
            .from('profiles')
            .update({
              observacao: buildProfileObservation(editing, form.status_moradia, {
                inquilino_nome: form.inquilino_nome,
                inquilino_telefone: form.inquilino_telefone,
              }),
              updated_at: new Date().toISOString(),
            })
            .eq('id', editing.id)

          if (profileError) throw profileError
        } catch (error) {
          if (!isBackendConfigError(error.message)) {
            throw error
          }

          authFieldsChanged = Boolean(form.nova_senha) || normalizeCpf(form.cpf) !== normalizeCpf(editing.cpf)
          await saveProfileFallback({ keepAuthEmail: authFieldsChanged })
          usedFallback = true
        }

        toast(
          usedFallback && authFieldsChanged
            ? 'Perfil atualizado. Para trocar a senha de acesso ou sincronizar o login interno apos mudar o CPF, informe a SUPABASE_SERVICE_ROLE_KEY real no backend.'
            : 'Morador atualizado com sucesso.',
          usedFallback && authFieldsChanged ? 'info' : 'success',
          usedFallback && authFieldsChanged ? 8000 : 4500,
        )

        setShowModal(false)
      } else {
        const result = await createResident({
          nome: form.nome,
          email: buildResidentInternalEmail(form.cpf),
          apartamento: form.apartamento,
          cpf: normalizeCpf(form.cpf),
          whatsapp: String(form.whatsapp || '').replace(/\D/g, ''),
          password: form.nova_senha,
          role: 'morador',
        })

        if (result.userId) {
          await supabase
            .from('profiles')
            .update({
              observacao: buildProfileObservation({}, form.status_moradia, {
                inquilino_nome: form.inquilino_nome,
                inquilino_telefone: form.inquilino_telefone,
              }),
              updated_at: new Date().toISOString(),
            })
            .eq('id', result.userId)
        }

        setSenhaGerada(result.temporaryPassword)
        toast(`Morador criado com sucesso. Senha de acesso: ${result.temporaryPassword}`, 'success', 10000)
      }

      void fetchMoradores()
    } catch (error) {
      toast(error.message || 'Erro ao salvar morador.', 'error')
    } finally {
      setSaving(false)
    }
  }

  const toggleAtivo = async (morador) => {
    const { error } = await supabase
      .from('profiles')
      .update({ ativo: !morador.ativo, updated_at: new Date().toISOString() })
      .eq('id', morador.id)

    if (error) {
      toast('Nao foi possivel alterar o status do morador.', 'error')
      return
    }

    toast(morador.ativo ? 'Morador desativado.' : 'Morador reativado.', 'success')
    void fetchMoradores()
  }

  const handleDelete = async (morador) => {
    const confirmed = window.confirm(
      `Deseja apagar definitivamente ${morador.nome}?\n\nIsso vai remover o login, o perfil, cobrancas, ocorrencias e solicitacoes vinculadas a este morador.`,
    )

    if (!confirmed) return

    setDeletingId(morador.id)

    try {
      await deleteResident({ userId: morador.id })
      toast('Morador apagado com sucesso.', 'success')

      if (editing?.id === morador.id) {
        setShowModal(false)
        setEditing(null)
        setForm(emptyForm)
      }

      void fetchMoradores()
    } catch (error) {
      toast(error.message || 'Nao foi possivel apagar o morador.', 'error')
    } finally {
      setDeletingId(null)
    }
  }

  const copiar = (texto) => {
    navigator.clipboard?.writeText(texto)
    toast('Copiado!', 'success')
  }

  const openMessageComposer = (morador) => {
    if (!morador?.whatsapp) {
      toast('Numero nao cadastrado.', 'error')
      return
    }

    setMessageTarget(morador)
    setMessageText(`Ola ${morador.nome}, aqui e a administracao do condominio${morador.apartamento ? ` do Apt. ${morador.apartamento}` : ''}.`)
    setShowMessageModal(true)
  }

  const abrirWhatsAppComTexto = (numero, mensagem) => {
    if (!numero) {
      toast('Numero nao cadastrado.', 'error')
      return
    }

    const url = `https://wa.me/55${numero.replace(/\D/g, '')}?text=${encodeURIComponent(mensagem)}`
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  const sendComposedMessage = () => {
    if (!messageTarget?.whatsapp) {
      toast('Numero nao cadastrado.', 'error')
      return
    }

    if (!String(messageText || '').trim()) {
      toast('Escreva a mensagem antes de enviar.', 'error')
      return
    }

    abrirWhatsAppComTexto(messageTarget.whatsapp, messageText)
    setShowMessageModal(false)
    setMessageTarget(null)
    setMessageText('')
  }

  const filtered = useMemo(() => moradores.filter((morador) =>
    morador.nome?.toLowerCase().includes(search.toLowerCase())
      || morador.apartamento?.includes(search)
      || String(morador.cpf || '').includes(normalizeCpf(search))
      || String(morador.whatsapp || '').includes(normalizeCpf(search))
  ), [moradores, search])

  const pendingNotificationsByResident = useMemo(() => {
    const result = new Map()

    for (const item of notifications) {
      if (!isResidentRequestPending(item)) continue
      const residentId = item.created_by
      if (!residentId) continue
      result.set(residentId, (result.get(residentId) || 0) + 1)
    }

    return result
  }, [notifications])

  const openResidentNotifications = (morador) => {
    const residentItems = notifications.filter((item) => item.created_by === morador.id)
    setSelectedResidentNotifications({
      morador,
      items: residentItems,
    })
  }

  return (
    <div className="fade-in">
      <div className="page-header">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <div className="page-title">Moradores</div>
            <div className="page-subtitle">{moradores.length} morador(es) cadastrados no sistema</div>
          </div>
          <button className="btn btn-primary" onClick={openCreate}>
            <UserPlus size={15} /> Cadastrar morador
          </button>
        </div>
      </div>

      <div style={{ position: 'relative', marginBottom: 20, maxWidth: 420 }}>
        <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#8b949e' }} />
        <input
          className="input"
          style={{ paddingLeft: 34 }}
          placeholder="Buscar por nome, apartamento, CPF ou WhatsApp..."
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><div className="spinner" /></div>
      ) : filtered.length === 0 ? (
        <div className="empty-state"><User size={40} /><p>Nenhum morador encontrado.</p></div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Morador</th>
                <th>Apartamento</th>
                <th>Status</th>
                <th>Moradia</th>
                <th>Contato</th>
                <th>Acoes</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((morador) => {
                const moradiaMeta = getMoradiaMeta(morador)
                const moradiaLabel = MORADIA_OPTIONS.find((option) => option.value === moradiaMeta.status_moradia) || MORADIA_OPTIONS[0]

                return (
                  <tr key={morador.id}>
                    <td>
                      <div style={{ fontWeight: 600 }}>{morador.nome}</div>
                      <div style={{ fontSize: 12, color: '#8b949e' }}>Login pelo CPF: {morador.cpf ? formatCpf(morador.cpf) : '-'}</div>
                    </td>
                    <td><span className="badge badge-blue"><Home size={10} /> Apt. {morador.apartamento || '-'}</span></td>
                    <td><span className={`badge ${morador.ativo ? 'badge-green' : 'badge-red'}`}>{morador.ativo ? 'Ativo' : 'Inativo'}</span></td>
                    <td>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <span className={`badge badge-${moradiaLabel.color}`}>{moradiaLabel.label}</span>
                        {moradiaMeta.status_moradia === 'alugado' && moradiaMeta.inquilino_nome && (
                          <div style={{ fontSize: 11, color: '#8b949e' }}>
                            Inquilino: {moradiaMeta.inquilino_nome}
                          </div>
                        )}
                      </div>
                    </td>
                    <td style={{ color: '#8b949e' }}>
                      <div>{morador.whatsapp || '-'}</div>
                      {moradiaMeta.status_moradia === 'alugado' && moradiaMeta.inquilino_telefone && (
                        <div style={{ fontSize: 11, marginTop: 4 }}>
                          Inquilino: {moradiaMeta.inquilino_telefone}
                        </div>
                      )}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        <button className="btn btn-ghost btn-sm btn-icon" onClick={() => openEdit(morador)}><Edit2 size={13} /></button>
                        <button className="btn btn-ghost btn-sm btn-icon" onClick={() => openResidentNotifications(morador)} title="Ver notificacoes deste morador" style={{ position: 'relative' }}>
                          <Bell size={13} />
                          {(pendingNotificationsByResident.get(morador.id) || 0) > 0 && (
                            <span style={{ position: 'absolute', top: -4, right: -4, minWidth: 16, height: 16, borderRadius: 999, background: '#f0883e', color: '#000', fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 4px' }}>
                              {pendingNotificationsByResident.get(morador.id)}
                            </span>
                          )}
                        </button>
                        <button className="btn btn-ghost btn-sm btn-icon" onClick={() => openMessageComposer(morador)} title="Enviar mensagem privada">
                          <MessageCircle size={13} style={{ color: '#25d366' }} />
                        </button>
                        <button className={`btn btn-sm ${morador.ativo ? 'btn-danger' : 'btn-ghost'}`} onClick={() => toggleAtivo(morador)}>
                          {morador.ativo ? 'Desativar' : 'Reativar'}
                        </button>
                        <button className="btn btn-danger btn-sm" onClick={() => handleDelete(morador)} disabled={deletingId === morador.id}>
                          {deletingId === morador.id ? <Loader2 size={13} style={{ animation: 'spin .6s linear infinite' }} /> : <Trash2 size={13} />}
                          Apagar
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <div className="modal-overlay" onClick={(event) => event.target === event.currentTarget && setShowModal(false)}>
          <div className="modal">
            <div className="modal-header">
              <div className="modal-title">{editing ? 'Editar morador' : 'Cadastrar morador'}</div>
              <button className="btn btn-ghost btn-icon" onClick={() => setShowModal(false)}><X size={16} /></button>
            </div>

            {senhaGerada && (
              <div style={{ background: '#1a3a24', border: '1px solid #3fb950', borderRadius: 10, padding: 16, marginBottom: 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <KeyRound size={16} color="#3fb950" />
                  <span style={{ fontWeight: 700, color: '#3fb950', fontSize: 13 }}>Morador criado com sucesso</span>
                </div>
                <div style={{ fontSize: 12, color: '#8b949e', marginBottom: 10 }}>
                  Informe esta senha ao morador. Ele podera altera-la depois.
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <div style={{ flex: 1, background: '#0d1117', border: '1px solid #30363d', borderRadius: 8, padding: '10px 14px', fontFamily: 'monospace', fontSize: 18, fontWeight: 700, color: '#e6edf3', letterSpacing: 2 }}>
                    {senhaGerada}
                  </div>
                  <button className="btn btn-ghost btn-sm" onClick={() => copiar(senhaGerada)}>
                    <Copy size={13} /> Copiar
                  </button>
                </div>
                <div style={{ marginTop: 10, fontSize: 12, color: '#8b949e' }}>
                  Login: <span style={{ color: '#e6edf3', fontFamily: 'monospace' }}>{formatCpf(form.cpf)}</span>
                </div>
                <button className="btn btn-ghost btn-sm" style={{ marginTop: 10, width: '100%', justifyContent: 'center' }} onClick={() => { setSenhaGerada(null); setShowModal(false) }}>
                  Fechar
                </button>
              </div>
            )}

            {!senhaGerada && (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                  <div className="form-group" style={{ gridColumn: '1/-1' }}>
                    <label className="form-label">Nome completo *</label>
                    <input className="input" value={form.nome} onChange={(event) => setForm((current) => ({ ...current, nome: event.target.value }))} placeholder="Joao da Silva" />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Apartamento *</label>
                    <input className="input" value={form.apartamento} onChange={(event) => setForm((current) => ({ ...current, apartamento: event.target.value }))} placeholder="Ex.: 101, Casa 2, Bloco B-03" />
                  </div>
                  <div className="form-group">
                    <label className="form-label">CPF *</label>
                    <input className="input" value={formatCpf(form.cpf)} onChange={(event) => setForm((current) => ({ ...current, cpf: normalizeCpf(event.target.value) }))} placeholder="000.000.000-00" />
                  </div>
                  <div className="form-group">
                    <label className="form-label">WhatsApp *</label>
                    <input className="input" value={form.whatsapp} onChange={(event) => setForm((current) => ({ ...current, whatsapp: event.target.value }))} placeholder="(81) 90000-0000" />
                  </div>
                  <div className="form-group">
                    <label className="form-label">{editing ? 'Nova senha de acesso' : 'Senha de acesso *'}</label>
                    <div style={{ position: 'relative' }}>
                      <input className="input" type={showPassword ? 'text' : 'password'} value={form.nova_senha} onChange={(event) => setForm((current) => ({ ...current, nova_senha: event.target.value }))} placeholder={editing ? 'Preencha apenas se quiser trocar' : 'Defina a senha inicial do morador'} />
                      <button type="button" className="btn btn-ghost btn-sm" style={{ position: 'absolute', right: 8, top: 7 }} onClick={() => setShowPassword(!showPassword)}>
                        {showPassword ? 'Ocultar' : 'Mostrar'}
                      </button>
                    </div>
                  </div>
                  <div className="form-group" style={{ gridColumn: '1/-1' }}>
                    <label className="form-label">Status da moradia</label>
                    <select className="input" value={form.status_moradia} onChange={(event) => setForm((current) => ({ ...current, status_moradia: event.target.value }))}>
                      {MORADIA_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  </div>

                  {form.status_moradia === 'alugado' && (
                    <>
                      <div className="form-group">
                        <label className="form-label">Nome do inquilino *</label>
                        <input className="input" value={form.inquilino_nome} onChange={(event) => setForm((current) => ({ ...current, inquilino_nome: event.target.value }))} placeholder="Nome do inquilino" />
                      </div>
                      <div className="form-group">
                        <label className="form-label">Telefone do inquilino *</label>
                        <input className="input" value={form.inquilino_telefone} onChange={(event) => setForm((current) => ({ ...current, inquilino_telefone: event.target.value }))} placeholder="(81) 90000-0000" />
                      </div>
                      <div className="form-group" style={{ gridColumn: '1/-1' }}>
                        <div style={{ fontSize: 12, color: '#8b949e' }}>
                          Apenas o proprietario tera acesso ao sistema. Os dados do inquilino ficam registrados somente para controle do sindico.
                        </div>
                      </div>
                    </>
                  )}
                </div>

                {editing && (
                  <div style={{ marginTop: 12, fontSize: 12, color: '#8b949e' }}>
                    Se a senha for preenchida, o acesso do morador sera atualizado com o novo valor.
                  </div>
                )}

                <div className="modal-footer">
                  <button className="btn btn-ghost" onClick={() => setShowModal(false)}>Cancelar</button>
                  <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                    {saving ? <><Loader2 size={14} style={{ animation: 'spin .6s linear infinite' }} /> Salvando...</> : editing ? 'Salvar' : 'Cadastrar'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {showMessageModal && (
        <div className="modal-overlay" onClick={(event) => event.target === event.currentTarget && setShowMessageModal(false)}>
          <div className="modal" style={{ maxWidth: 560 }}>
            <div className="modal-header">
              <div className="modal-title">Mensagem privada</div>
              <button className="btn btn-ghost btn-icon" onClick={() => setShowMessageModal(false)}><X size={16} /></button>
            </div>

            <div style={{ marginBottom: 16, color: '#8b949e', fontSize: 13 }}>
              Enviar mensagem para <strong style={{ color: '#e6edf3' }}>{messageTarget?.nome || '-'}</strong>
              {messageTarget?.apartamento ? ` - Apt. ${messageTarget.apartamento}` : ''}
            </div>

            <div className="form-group">
              <label className="form-label">Mensagem para o WhatsApp</label>
              <textarea
                className="input"
                rows={7}
                value={messageText}
                onChange={(event) => setMessageText(event.target.value)}
                placeholder="Escreva a mensagem que sera enviada..."
              />
            </div>

            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setShowMessageModal(false)}>Cancelar</button>
              <button className="btn btn-primary" onClick={sendComposedMessage}>
                <MessageCircle size={14} /> Abrir no WhatsApp
              </button>
            </div>
          </div>
        </div>
      )}

      {selectedResidentNotifications && (
        <div className="modal-overlay" onClick={(event) => event.target === event.currentTarget && setSelectedResidentNotifications(null)}>
          <div className="modal" style={{ maxWidth: 680 }}>
            <div className="modal-header">
              <div className="modal-title">Notificacoes do morador</div>
              <button className="btn btn-ghost btn-icon" onClick={() => setSelectedResidentNotifications(null)}><X size={16} /></button>
            </div>

            <div style={{ marginBottom: 16, color: '#8b949e', fontSize: 13 }}>
              {selectedResidentNotifications.morador.nome} {selectedResidentNotifications.morador.apartamento ? `- Apt. ${selectedResidentNotifications.morador.apartamento}` : ''}
            </div>

            {selectedResidentNotifications.items.length === 0 ? (
              <div style={{ fontSize: 13, color: '#8b949e' }}>Nenhuma notificacao enviada por este morador.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {selectedResidentNotifications.items.map((item) => {
                  const summary = buildResidentRequestSummary(item)
                  return (
                    <div key={item.id} style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 14, background: 'var(--bg-3)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', marginBottom: 6 }}>
                        <div style={{ fontWeight: 600 }}>{summary.title}</div>
                        <span className={`badge ${item.status === 'resolvido' ? 'badge-green' : 'badge-orange'}`}>
                          {item.status === 'resolvido' ? 'Resolvido' : 'Em analise'}
                        </span>
                      </div>
                      <div style={{ fontSize: 12, color: '#8b949e', lineHeight: 1.6 }}>{summary.detail}</div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
