import { useMemo, useState } from 'react'
import { Building2, CheckCircle2, Edit2, KeyRound, Loader2, Search, ShieldBan, ShieldCheck, XCircle } from 'lucide-react'
import { useToast } from '../shared/Toast'
import { updatePlatformCondominium, updatePlatformSyndicPassword } from '../../lib/platformApi'
import { formatCpfCnpj, normalizeCpfCnpj } from '../../lib/document'

function formatDate(dateValue = '') {
  if (!dateValue) return '-'
  const date = new Date(dateValue)
  return Number.isNaN(date.getTime()) ? '-' : date.toLocaleDateString('pt-BR')
}

function getStatusBadge(status = '') {
  if (status === 'active') return 'badge-green'
  if (status === 'blocked') return 'badge-red'
  if (status === 'rejected') return 'badge-red'
  return 'badge-orange'
}

function toDateInputValue(dateValue = '') {
  if (!dateValue) return ''

  const normalized = String(dateValue)
  if (/^\d{4}-\d{2}-\d{2}/.test(normalized)) {
    return normalized.slice(0, 10)
  }

  const date = new Date(dateValue)
  if (Number.isNaN(date.getTime())) return ''

  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const PLAN_OPTIONS = [
  { value: 'Plano Padrao', label: 'Plano Padrao' },
  { value: 'Plano Plus', label: 'Plano Plus' },
]

const emptyEditForm = {
  id: '',
  name: '',
  cnpj: '',
  address: '',
  zip_code: '',
  whatsapp: '',
  unit_count: '',
  status: 'pending',
  plan_name: 'Plano Padrao',
  subscription_status: 'trial',
  trial_started_at: '',
  platform_note: '',
}

export default function PlatformCondominiums({
  condominiums,
  loading,
  error,
  reload,
}) {
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [savingAction, setSavingAction] = useState('')
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(emptyEditForm)
  const [syndicPassword, setSyndicPassword] = useState('')
  const { toast } = useToast()

  const filtered = useMemo(() => (condominiums || []).filter((item) => {
    const query = search.trim().toLowerCase()
    const matchSearch = !query
      || String(item.name || '').toLowerCase().includes(query)
      || String(item.cnpj || '').includes(query.replace(/\D/g, ''))
      || String(item.syndic?.nome || '').toLowerCase().includes(query)

    const matchStatus = !filterStatus || item.status === filterStatus
    return matchSearch && matchStatus
  }), [condominiums, filterStatus, search])

  const openEdit = (item) => {
    setEditing(item)
    setForm({
      id: item.id,
      name: item.name || '',
      cnpj: item.cnpj || '',
      address: item.address || '',
      zip_code: item.zip_code || '',
      whatsapp: item.whatsapp || '',
      unit_count: String(item.unit_count || ''),
      status: item.status || 'pending',
      plan_name: item.metadata?.plan_name || item.plan_name || 'Plano Padrao',
      subscription_status: item.metadata?.subscription_status || item.subscription_status || 'trial',
      trial_started_at: toDateInputValue(item.trial_started_at || item.metadata?.trial_started_at || new Date()),
      platform_note: item.metadata?.platform_note || '',
    })
    setSyndicPassword('')
  }

  const closeEdit = () => {
    setEditing(null)
    setForm(emptyEditForm)
    setSyndicPassword('')
  }

  const handleAction = async (item, action) => {
    const actionKey = `${item.id}:${action}`
    setSavingAction(actionKey)

    try {
      await updatePlatformCondominium({
        condominiumId: item.id,
        action,
      })
      toast('Condominio atualizado com sucesso.', 'success')
      await reload()
    } catch (actionError) {
      toast(actionError.message || 'Nao foi possivel atualizar o condominio.', 'error')
    } finally {
      setSavingAction('')
    }
  }

  const handleSave = async () => {
    setSavingAction(`${form.id}:save`)

    try {
      await updatePlatformCondominium({
        condominiumId: form.id,
        action: 'save',
        name: form.name,
        cnpj: form.cnpj,
        address: form.address,
        zip_code: form.zip_code,
        whatsapp: form.whatsapp,
        unit_count: Number(form.unit_count || 0),
        status: form.status,
        metadata: {
          plan_name: form.plan_name || 'Plano Padrao',
          subscription_status: form.subscription_status || 'trial',
          trial_started_at: form.trial_started_at || '',
          platform_note: form.platform_note || '',
        },
      })

      toast('Cadastro do condominio salvo com sucesso.', 'success')
      closeEdit()
      await reload()
    } catch (saveError) {
      toast(saveError.message || 'Nao foi possivel salvar o condominio.', 'error')
    } finally {
      setSavingAction('')
    }
  }

  const handleSyndicPasswordSave = async () => {
    if (!editing?.id) return

    if (syndicPassword.trim().length < 6) {
      toast('Informe uma senha com pelo menos 6 caracteres.', 'error')
      return
    }

    const actionKey = `${editing.id}:syndic-password`
    setSavingAction(actionKey)

    try {
      await updatePlatformSyndicPassword({
        condominiumId: editing.id,
        password: syndicPassword.trim(),
      })
      setSyndicPassword('')
      toast('Senha do sindico atualizada com sucesso.', 'success')
    } catch (passwordError) {
      toast(passwordError.message || 'Nao foi possivel atualizar a senha do sindico.', 'error')
    } finally {
      setSavingAction('')
    }
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
        <div className="spinner" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="card">
        <div style={{ fontWeight: 700, marginBottom: 8 }}>Falha ao listar condominios.</div>
        <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>{error}</div>
      </div>
    )
  }

  return (
    <div className="fade-in">
      <div className="page-header">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <div className="page-title">Condominios</div>
            <div className="page-subtitle">Aprovacao, bloqueio e edicao cadastral sem acesso aos dados financeiros internos</div>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 240 }}>
          <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#8b949e' }} />
          <input
            className="input"
            style={{ paddingLeft: 34 }}
            placeholder="Buscar por condominio, CPF/CNPJ ou sindico..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <select className="input" style={{ width: 180 }} value={filterStatus} onChange={(event) => setFilterStatus(event.target.value)}>
          <option value="">Todos os status</option>
          <option value="pending">Pendentes</option>
          <option value="active">Ativos</option>
          <option value="blocked">Bloqueados</option>
          <option value="rejected">Rejeitados</option>
        </select>
      </div>

      {filtered.length === 0 ? (
        <div className="empty-state">
          <Building2 size={40} />
          <p>Nenhum condominio encontrado para os filtros atuais.</p>
        </div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Condominio</th>
                <th>Status</th>
                <th>Plano</th>
                <th>Usuarios</th>
                <th>Sindico</th>
                <th>Criado em</th>
                <th>Assinatura</th>
                <th>Acoes</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((item) => (
                <tr key={item.id}>
                  <td>
                    <div style={{ fontWeight: 700 }}>{item.name}</div>
                    <div style={{ fontSize: 12, color: '#8b949e' }}>{item.cnpj ? formatCpfCnpj(item.cnpj) : '-'}</div>
                    <div style={{ fontSize: 12, color: '#8b949e' }}>{item.address || '-'}</div>
                  </td>
                  <td><span className={`badge ${getStatusBadge(item.status)}`}>{item.status}</span></td>
                  <td>{item.plan_name || 'Padrao'}</td>
                  <td>
                    <div style={{ fontWeight: 600 }}>{item.total_users || 0}</div>
                    <div style={{ fontSize: 12, color: '#8b949e' }}>{item.residents_count || 0} morador(es)</div>
                  </td>
                  <td>
                    <div style={{ fontWeight: 600 }}>{item.syndic?.nome || '-'}</div>
                    <div style={{ fontSize: 12, color: '#8b949e' }}>{item.syndic?.email || '-'}</div>
                  </td>
                  <td>{formatDate(item.created_at)}</td>
                  <td>
                    <div style={{ fontWeight: 600 }}>{item.subscription_status === 'active' ? 'Ativa' : 'Trial'}</div>
                    <div style={{ fontSize: 12, color: '#8b949e' }}>
                      {item.trial_ends_at ? `Vence em ${formatDate(item.trial_ends_at)}` : 'Aguardando aprovacao'}
                    </div>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      <button className="btn btn-ghost btn-sm" onClick={() => openEdit(item)}>
                        <Edit2 size={13} /> Editar
                      </button>
                      {item.status !== 'active' && (
                        <button className="btn btn-primary btn-sm" onClick={() => handleAction(item, 'approve')} disabled={savingAction === `${item.id}:approve`}>
                          {savingAction === `${item.id}:approve` ? <Loader2 size={13} className="spin-icon" /> : <CheckCircle2 size={13} />}
                          Aprovar
                        </button>
                      )}
                      {item.status === 'pending' && (
                        <button className="btn btn-danger btn-sm" onClick={() => handleAction(item, 'reject')} disabled={savingAction === `${item.id}:reject`}>
                          {savingAction === `${item.id}:reject` ? <Loader2 size={13} className="spin-icon" /> : <XCircle size={13} />}
                          Rejeitar
                        </button>
                      )}
                      {item.status === 'active' ? (
                        <button className="btn btn-danger btn-sm" onClick={() => handleAction(item, 'block')} disabled={savingAction === `${item.id}:block`}>
                          {savingAction === `${item.id}:block` ? <Loader2 size={13} className="spin-icon" /> : <ShieldBan size={13} />}
                          Bloquear
                        </button>
                      ) : item.status === 'blocked' ? (
                        <button className="btn btn-ghost btn-sm" onClick={() => handleAction(item, 'unblock')} disabled={savingAction === `${item.id}:unblock`}>
                          {savingAction === `${item.id}:unblock` ? <Loader2 size={13} className="spin-icon" /> : <ShieldCheck size={13} />}
                          Reativar
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <div className="modal-overlay" onClick={(event) => event.target === event.currentTarget && closeEdit()}>
          <div className="modal" style={{ maxWidth: 980 }}>
            <div className="modal-header">
              <div className="modal-title">Editar condominio</div>
              <button className="btn btn-ghost btn-icon" onClick={closeEdit}>
                <XCircle size={16} />
              </button>
            </div>

            <div className="platform-condo-edit-grid">
              <div className="platform-condo-edit-form">
                <div className="form-group" style={{ gridColumn: '1/-1' }}>
                  <label className="form-label">Nome do condominio</label>
                  <input className="input" value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} />
                </div>

                <div className="form-group">
                  <label className="form-label">CPF/CNPJ</label>
                  <input className="input" value={formatCpfCnpj(form.cnpj)} onChange={(event) => setForm((current) => ({ ...current, cnpj: normalizeCpfCnpj(event.target.value) }))} />
                </div>

                <div className="form-group">
                  <label className="form-label">WhatsApp do condominio e/ou sindico</label>
                  <input className="input" value={form.whatsapp} onChange={(event) => setForm((current) => ({ ...current, whatsapp: event.target.value }))} />
                </div>

                <div className="form-group">
                  <label className="form-label">Endereco</label>
                  <input className="input" value={form.address} onChange={(event) => setForm((current) => ({ ...current, address: event.target.value }))} />
                </div>

                <div className="form-group">
                  <label className="form-label">CEP</label>
                  <input className="input" value={form.zip_code} onChange={(event) => setForm((current) => ({ ...current, zip_code: event.target.value }))} />
                </div>

                <div className="form-group">
                  <label className="form-label">Unidades</label>
                  <input className="input" type="number" min="0" value={form.unit_count} onChange={(event) => setForm((current) => ({ ...current, unit_count: event.target.value }))} />
                </div>

                <div className="form-group">
                  <label className="form-label">Status</label>
                  <select className="input" value={form.status} onChange={(event) => setForm((current) => ({ ...current, status: event.target.value }))}>
                    <option value="pending">Pendente</option>
                    <option value="active">Ativo</option>
                    <option value="blocked">Bloqueado</option>
                    <option value="rejected">Rejeitado</option>
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">Plano</label>
                  <select className="input" value={form.plan_name} onChange={(event) => setForm((current) => ({ ...current, plan_name: event.target.value }))}>
                    {PLAN_OPTIONS.map((plan) => (
                      <option key={plan.value} value={plan.value}>{plan.label}</option>
                    ))}
                  </select>
                </div>

                <div className="form-group" style={{ gridColumn: '1/-1' }}>
                  <label className="form-label">Assinatura</label>
                  <div className={form.subscription_status === 'trial' ? 'platform-subscription-grid with-date' : 'platform-subscription-grid'}>
                    <select className="input" value={form.subscription_status} onChange={(event) => setForm((current) => ({ ...current, subscription_status: event.target.value }))}>
                      <option value="trial">Teste 30 dias</option>
                      <option value="active">Ativo</option>
                    </select>
                    {form.subscription_status === 'trial' && (
                      <div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>Valendo a partir de</div>
                        <input
                          className="input"
                          type="date"
                          value={form.trial_started_at}
                          onChange={(event) => setForm((current) => ({ ...current, trial_started_at: event.target.value }))}
                        />
                      </div>
                    )}
                  </div>
                </div>

                <div className="form-group" style={{ gridColumn: '1/-1' }}>
                  <label className="form-label">Nota interna da plataforma</label>
                  <textarea className="input" rows={3} value={form.platform_note} onChange={(event) => setForm((current) => ({ ...current, platform_note: event.target.value }))} placeholder="Observacoes operacionais sem dados financeiros." />
                </div>
              </div>

              <div className="platform-condo-password-panel">
                <div>
                  <div style={{ fontWeight: 700, marginBottom: 6 }}>Acesso do sindico</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6 }}>
                    {editing.syndic?.nome || 'Sindico ainda nao informado'}
                    <br />
                    {editing.syndic?.email || 'Sem e-mail vinculado'}
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Nova senha do sindico</label>
                  <input
                    className="input"
                    type="password"
                    value={syndicPassword}
                    onChange={(event) => setSyndicPassword(event.target.value)}
                    placeholder="Minimo de 6 caracteres"
                    disabled={!editing.syndic?.id}
                  />
                </div>

                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={handleSyndicPasswordSave}
                  disabled={!editing.syndic?.id || savingAction === `${editing.id}:syndic-password`}
                  style={{ justifyContent: 'center' }}
                >
                  {savingAction === `${editing.id}:syndic-password` ? (
                    <>
                      <Loader2 size={14} className="spin-icon" /> Salvando senha...
                    </>
                  ) : (
                    <>
                      <KeyRound size={14} /> Editar senha
                    </>
                  )}
                </button>
              </div>
            </div>

            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={closeEdit}>Cancelar</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={savingAction === `${form.id}:save`}>
                {savingAction === `${form.id}:save` ? <><Loader2 size={14} className="spin-icon" /> Salvando...</> : 'Salvar alteracoes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
