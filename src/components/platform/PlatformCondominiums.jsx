import { useMemo, useState } from 'react'
import { Building2, CheckCircle2, Clock3, Edit2, Loader2, Search, ShieldBan, ShieldCheck, XCircle } from 'lucide-react'
import { useToast } from '../shared/Toast'
import { updatePlatformCondominium } from '../../lib/platformApi'

function formatCnpj(value = '') {
  const digits = String(value || '').replace(/\D/g, '')

  if (digits.length <= 2) return digits
  if (digits.length <= 5) return `${digits.slice(0, 2)}.${digits.slice(2)}`
  if (digits.length <= 8) return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5)}`
  if (digits.length <= 12) return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8)}`
  return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12, 14)}`
}

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

const emptyEditForm = {
  id: '',
  name: '',
  cnpj: '',
  address: '',
  zip_code: '',
  whatsapp: '',
  unit_count: '',
  status: 'pending',
  plan_name: '',
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
      plan_name: item.metadata?.plan_name || item.plan_name || '',
      platform_note: item.metadata?.platform_note || '',
    })
  }

  const closeEdit = () => {
    setEditing(null)
    setForm(emptyEditForm)
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
          plan_name: form.plan_name || 'Padrao',
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
            placeholder="Buscar por condominio, CNPJ ou sindico..."
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
                <th>Acoes</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((item) => (
                <tr key={item.id}>
                  <td>
                    <div style={{ fontWeight: 700 }}>{item.name}</div>
                    <div style={{ fontSize: 12, color: '#8b949e' }}>{formatCnpj(item.cnpj)}</div>
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
          <div className="modal" style={{ maxWidth: 760 }}>
            <div className="modal-header">
              <div className="modal-title">Editar condominio</div>
              <button className="btn btn-ghost btn-icon" onClick={closeEdit}>
                <XCircle size={16} />
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <div className="form-group" style={{ gridColumn: '1/-1' }}>
                <label className="form-label">Nome do condominio</label>
                <input className="input" value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} />
              </div>

              <div className="form-group">
                <label className="form-label">CNPJ</label>
                <input className="input" value={formatCnpj(form.cnpj)} onChange={(event) => setForm((current) => ({ ...current, cnpj: event.target.value.replace(/\D/g, '') }))} />
              </div>

              <div className="form-group">
                <label className="form-label">WhatsApp</label>
                <input className="input" value={form.whatsapp} onChange={(event) => setForm((current) => ({ ...current, whatsapp: event.target.value }))} />
              </div>

              <div className="form-group" style={{ gridColumn: '1/-1' }}>
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
                <input className="input" value={form.plan_name} onChange={(event) => setForm((current) => ({ ...current, plan_name: event.target.value }))} placeholder="Trial, Start, Pro..." />
              </div>

              <div className="form-group" style={{ gridColumn: '1/-1' }}>
                <label className="form-label">Nota interna da plataforma</label>
                <textarea className="input" rows={3} value={form.platform_note} onChange={(event) => setForm((current) => ({ ...current, platform_note: event.target.value }))} placeholder="Observacoes operacionais sem dados financeiros." />
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
