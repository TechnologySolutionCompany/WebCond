import { useEffect, useMemo, useState } from 'react'
import { UserPlus, Search, Edit2, X, Loader2, Home, User, Copy, KeyRound, MessageCircle, Trash2 } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { createResident, deleteResident, updateResident } from '../../lib/adminApi'
import { APARTMENT_OPTIONS } from '../../lib/apartments'
import { formatCpf, normalizeCpf } from '../../lib/cpf'
import { buildProfileObservation, getMoradiaStatus } from '../../lib/profileMeta'
import { useToast } from '../shared/Toast'
import { useAuth } from '../../hooks/useAuth'
import { applyTenantFilter } from '../../lib/tenant'

const MORADIA_OPTIONS = [
  { value: 'morando', label: 'Morando', color: 'green' },
  { value: 'alugado', label: 'Alugado', color: 'orange' },
  { value: 'desocupado', label: 'Desocupado', color: 'red' },
]

const emptyForm = {
  nome: '',
  email: '',
  apartamento: '',
  cpf: '',
  whatsapp: '',
  data_entrada: '',
  nova_senha: '',
  status_moradia: 'morando',
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
  const { condominiumId } = useAuth()
  const { toast } = useToast()

  useEffect(() => {
    void fetchMoradores()
  }, [condominiumId])

  const fetchMoradores = async () => {
    setLoading(true)
    const query = supabase
      .from('profiles')
      .select('*')
      .in('role', ['morador', 'RESIDENT'])
      .order('apartamento')
    const { data } = await applyTenantFilter(query, condominiumId)

    setMoradores(data || [])
    setLoading(false)
  }

  const openCreate = () => {
    setEditing(null)
    setForm(emptyForm)
    setSenhaGerada(null)
    setShowPassword(false)
    setShowModal(true)
  }

  const openEdit = (morador) => {
    setEditing(morador)
    setForm({
      nome: morador.nome || '',
      email: morador.email || '',
      apartamento: morador.apartamento || '',
      cpf: morador.cpf || '',
      whatsapp: morador.whatsapp || '',
      data_entrada: morador.data_entrada || '',
      nova_senha: '',
      status_moradia: getMoradiaStatus(morador),
    })
    setSenhaGerada(null)
    setShowPassword(false)
    setShowModal(true)
  }

  const saveProfileFallback = async ({ keepAuthEmail }) => {
    const updatePayload = {
      nome: form.nome,
      telefone: '',
      apartamento: form.apartamento,
      cpf: normalizeCpf(form.cpf),
      whatsapp: String(form.whatsapp || '').replace(/\D/g, ''),
      data_entrada: form.data_entrada || null,
      observacao: buildProfileObservation(editing, form.status_moradia),
      updated_at: new Date().toISOString(),
    }

    if (!keepAuthEmail) {
      updatePayload.email = form.email
    }

    const { error } = await supabase
      .from('profiles')
      .update(updatePayload)
      .eq('id', editing.id)

    if (error) throw error
  }

  const handleSave = async () => {
    if (!form.nome || !form.email || !form.whatsapp || !form.apartamento || !form.data_entrada) {
      toast('Preencha nome, e-mail, WhatsApp, apartamento e data de entrada.', 'error')
      return
    }

    if (normalizeCpf(form.cpf).length !== 11) {
      toast('Informe um CPF valido com 11 digitos.', 'error')
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
            email: form.email,
            role: editing.role || 'morador',
            apartamento: form.apartamento,
            cpf: normalizeCpf(form.cpf),
            whatsapp: String(form.whatsapp || '').replace(/\D/g, ''),
            data_entrada: form.data_entrada || null,
            ativo: editing.ativo,
            password: form.nova_senha,
          })

          const { error: profileError } = await supabase
            .from('profiles')
            .update({
              observacao: buildProfileObservation(editing, form.status_moradia),
              updated_at: new Date().toISOString(),
            })
            .eq('id', editing.id)

          if (profileError) throw profileError
        } catch (error) {
          if (!isBackendConfigError(error.message)) {
            throw error
          }

          authFieldsChanged = Boolean(form.nova_senha) || form.email !== (editing.email || '')
          await saveProfileFallback({ keepAuthEmail: authFieldsChanged })
          usedFallback = true
        }

        toast(
          usedFallback && authFieldsChanged
            ? 'Perfil atualizado. Para trocar o e-mail de login ou a senha, informe a SUPABASE_SERVICE_ROLE_KEY real no backend.'
            : 'Morador atualizado com sucesso.',
          usedFallback && authFieldsChanged ? 'info' : 'success',
          usedFallback && authFieldsChanged ? 8000 : 4500,
        )

        setShowModal(false)
      } else {
        const result = await createResident({
          nome: form.nome,
          email: form.email,
          apartamento: form.apartamento,
          cpf: normalizeCpf(form.cpf),
          whatsapp: String(form.whatsapp || '').replace(/\D/g, ''),
          data_entrada: form.data_entrada || null,
          role: 'morador',
        })

        if (result.userId) {
          await supabase
            .from('profiles')
            .update({
              observacao: buildProfileObservation({}, form.status_moradia),
              updated_at: new Date().toISOString(),
            })
            .eq('id', result.userId)
        }

        setSenhaGerada(result.temporaryPassword)
        toast(`Morador criado com sucesso. Senha temporaria: ${result.temporaryPassword}`, 'success', 10000)
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
      || morador.email?.toLowerCase().includes(search.toLowerCase())
      || String(morador.cpf || '').includes(normalizeCpf(search))
      || String(morador.whatsapp || '').includes(normalizeCpf(search))
  ), [moradores, search])

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
          placeholder="Buscar por nome, apartamento, CPF, WhatsApp ou e-mail..."
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
                const moradia = getMoradiaStatus(morador)
                const moradiaLabel = MORADIA_OPTIONS.find((option) => option.value === moradia) || MORADIA_OPTIONS[0]

                return (
                  <tr key={morador.id}>
                    <td>
                      <div style={{ fontWeight: 600 }}>{morador.nome}</div>
                      <div style={{ fontSize: 12, color: '#8b949e' }}>{morador.email}</div>
                      <div style={{ fontSize: 12, color: '#8b949e' }}>CPF: {morador.cpf ? formatCpf(morador.cpf) : '-'}</div>
                    </td>
                    <td><span className="badge badge-blue"><Home size={10} /> Apt. {morador.apartamento || '-'}</span></td>
                    <td><span className={`badge ${morador.ativo ? 'badge-green' : 'badge-red'}`}>{morador.ativo ? 'Ativo' : 'Inativo'}</span></td>
                    <td><span className={`badge badge-${moradiaLabel.color}`}>{moradiaLabel.label}</span></td>
                    <td style={{ color: '#8b949e' }}>{morador.whatsapp || '-'}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        <button className="btn btn-ghost btn-sm btn-icon" onClick={() => openEdit(morador)}><Edit2 size={13} /></button>
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
                    <label className="form-label">E-mail *</label>
                    <input className="input" type="email" value={form.email} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} placeholder="joao@email.com" />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Apartamento *</label>
                    <select className="input" value={form.apartamento} onChange={(event) => setForm((current) => ({ ...current, apartamento: event.target.value }))}>
                      <option value="">Selecione</option>
                      {APARTMENT_OPTIONS.map((apto) => <option key={apto} value={apto}>Apt. {apto}</option>)}
                    </select>
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
                    <label className="form-label">Data de entrada *</label>
                    <input className="input" type="date" value={form.data_entrada} onChange={(event) => setForm((current) => ({ ...current, data_entrada: event.target.value }))} />
                  </div>
                  <div className="form-group" style={{ gridColumn: '1/-1' }}>
                    <label className="form-label">Status da moradia</label>
                    <select className="input" value={form.status_moradia} onChange={(event) => setForm((current) => ({ ...current, status_moradia: event.target.value }))}>
                      {MORADIA_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {editing && (
                  <div style={{ marginTop: 20, padding: 16, background: '#1c2333', borderRadius: 8 }}>
                    <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 12 }}>Alterar senha</div>
                    <div className="form-group">
                      <label className="form-label">Nova senha</label>
                      <div style={{ position: 'relative' }}>
                        <input
                          className="input"
                          type={showPassword ? 'text' : 'password'}
                          value={form.nova_senha}
                          onChange={(event) => setForm((current) => ({ ...current, nova_senha: event.target.value }))}
                          placeholder="Digite a nova senha"
                        />
                        <button type="button" className="btn btn-ghost btn-sm" style={{ position: 'absolute', right: 8, top: 7 }} onClick={() => setShowPassword(!showPassword)}>
                          {showPassword ? 'Ocultar' : 'Mostrar'}
                        </button>
                      </div>
                    </div>
                    <div style={{ fontSize: 12, color: '#8b949e', marginTop: 8 }}>
                      Sem a service role key real no backend, o sistema salva os demais dados, mas nao altera a senha ou o e-mail de login.
                    </div>
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
    </div>
  )
}
