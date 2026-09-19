import { useMemo, useState } from 'react'
import { Building2, KeyRound, Loader2, Search, XCircle, Check } from 'lucide-react'
import { useToast } from '../shared/Toast'
import { updatePlatformCondominium, updatePlatformSyndicPassword } from '../../lib/platformApi'
import { formatCpfCnpj, normalizeCpfCnpj } from '../../lib/document'

const PLAN_MODELS = [
  { 
    id: 'FREE', 
    name: 'FREE', 
    price: 'Grátis', 
    priceCents: 0, 
    color: '#8b949e',
    description: 'Plano de teste gratuito'
  },
  { 
    id: 'ONE', 
    name: 'ONE', 
    price: 'R$ 59,90', 
    priceCents: 5990, 
    color: '#3fb950',
    description: 'Plano iniciante'
  },
  { 
    id: 'PRO', 
    name: 'PRO', 
    price: 'R$ 79,90', 
    priceCents: 7990, 
    color: '#58a6ff',
    description: 'Plano profissional'
  },
  { 
    id: 'MAX', 
    name: 'MAX', 
    price: 'R$ 99,90', 
    priceCents: 9990, 
    color: '#bc8cff',
    description: 'Plano máximo'
  },
]

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

const emptyEditForm = {
  id: '',
  name: '',
  cnpj: '',
  address: '',
  zip_code: '',
  whatsapp: '',
  unit_count: '',
  status: 'pending',
  plan_name: 'FREE',
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
  const [planSelection, setPlanSelection] = useState(null)
  const [planConfig, setPlanConfig] = useState({})
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
      plan_name: item.metadata?.plan_name || item.plan_name || 'FREE',
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

  const openPlanSelection = (item) => {
    setPlanSelection(item)
    setPlanConfig({
      selectedPlan: item.plan_name || 'FREE',
      trialDays: 30,
      maxUsuarios: 100,
      maxMoradores: 500,
      maxDocumentos: 1000,
      maxAvisos: -1,
    })
  }

  const closePlanSelection = () => {
    setPlanSelection(null)
    setPlanConfig({})
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
          plan_name: form.plan_name || 'FREE',
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

  const handleSavePlanConfiguration = async () => {
    if (!planSelection || !planConfig.selectedPlan) return

    setSavingAction(`${planSelection.id}:plan`)

    try {
      await updatePlatformCondominium({
        condominiumId: planSelection.id,
        action: 'save',
        metadata: {
          plan_name: planConfig.selectedPlan,
          max_usuarios: planConfig.maxUsuarios,
          max_moradores: planConfig.maxMoradores,
          max_documentos: planConfig.maxDocumentos,
          max_avisos: planConfig.maxAvisos,
          trial_days: planConfig.trialDays,
        },
      })

      toast(`Plano ${planConfig.selectedPlan} configurado com sucesso!`, 'success')
      closePlanSelection()
      await reload()
    } catch (error) {
      toast(error.message || 'Erro ao salvar configuração do plano.', 'error')
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
                <th>Plano Atual</th>
                <th>Usuarios</th>
                <th>Sindico</th>
                <th>Criado em</th>
                <th>Assinatura</th>
                <th>Escolher Plano</th>
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
                  <td>{item.plan_name || 'FREE'}</td>
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
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <button className="btn btn-sm" onClick={() => openPlanSelection(item)} style={{ padding: '6px 12px', fontSize: '12px' }}>
                        <span style={{ color: '#0969da' }}>Planos</span>
                      </button>
                      <button className="btn btn-sm" onClick={() => openEdit(item)} style={{ padding: '6px 12px', fontSize: '12px' }}>
                        <span style={{ color: '#58a6ff' }}>Editar</span>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {planSelection && (
        <div className="modal-overlay" onClick={(event) => event.target === event.currentTarget && closePlanSelection()}>
          <div className="modal" style={{ maxWidth: 1100 }}>
            <div className="modal-header">
              <div>
                <div className="modal-title">{planSelection.name}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>{planSelection.cnpj ? formatCpfCnpj(planSelection.cnpj) : 'CNPJ não informado'} • {planSelection.address || 'Endereço não informado'}</div>
              </div>
              <button className="btn btn-ghost btn-icon" onClick={closePlanSelection}>
                <XCircle size={16} />
              </button>
            </div>

            <div style={{ padding: '20px', borderBottom: '1px solid var(--border-color)' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
                {PLAN_MODELS.map((plan) => (
                  <div
                    key={plan.id}
                    onClick={() => setPlanConfig((current) => ({ ...current, selectedPlan: plan.id }))}
                    style={{
                      padding: 16,
                      border: `2px solid ${planConfig.selectedPlan === plan.id ? plan.color : 'var(--border-color)'}`,
                      borderRadius: 8,
                      background: planConfig.selectedPlan === plan.id ? `${plan.color}11` : 'var(--bg-secondary)',
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 8 }}>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 14, color: plan.color }}>{plan.name}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{plan.description}</div>
                      </div>
                      {planConfig.selectedPlan === plan.id && (
                        <Check size={16} color={plan.color} />
                      )}
                    </div>
                    <div style={{ fontWeight: 600, fontSize: 13, marginTop: 8 }}>{plan.price}</div>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ padding: '20px', overflowY: 'auto', maxHeight: '400px' }}>
              <div style={{ marginBottom: 20 }}>
                <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>Configurações do Plano {planConfig.selectedPlan || 'FREE'}</h3>
                
                {planConfig.selectedPlan === 'FREE' && (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
                    <div className="form-group">
                      <label className="form-label">Dias de teste</label>
                      <input 
                        className="input" 
                        type="number" 
                        min="1" 
                        max="365"
                        value={planConfig.trialDays || 30} 
                        onChange={(event) => setPlanConfig((current) => ({ ...current, trialDays: Number(event.target.value) }))} 
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Máximo de usuários</label>
                      <input 
                        className="input" 
                        type="number" 
                        min="1"
                        value={planConfig.maxUsuarios || 100} 
                        onChange={(event) => setPlanConfig((current) => ({ ...current, maxUsuarios: Number(event.target.value) }))} 
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Máximo de moradores</label>
                      <input 
                        className="input" 
                        type="number" 
                        min="1"
                        value={planConfig.maxMoradores || 500} 
                        onChange={(event) => setPlanConfig((current) => ({ ...current, maxMoradores: Number(event.target.value) }))} 
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Máximo de documentos</label>
                      <input 
                        className="input" 
                        type="number" 
                        min="1"
                        value={planConfig.maxDocumentos || 1000} 
                        onChange={(event) => setPlanConfig((current) => ({ ...current, maxDocumentos: Number(event.target.value) }))} 
                      />
                    </div>
                  </div>
                )}

                {['ONE', 'PRO', 'MAX'].includes(planConfig.selectedPlan) && (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
                    <div className="form-group">
                      <label className="form-label">Máximo de usuários</label>
                      <input 
                        className="input" 
                        type="number" 
                        min="1"
                        value={planConfig.maxUsuarios || 100} 
                        onChange={(event) => setPlanConfig((current) => ({ ...current, maxUsuarios: Number(event.target.value) }))} 
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Máximo de moradores</label>
                      <input 
                        className="input" 
                        type="number" 
                        min="1"
                        value={planConfig.maxMoradores || 500} 
                        onChange={(event) => setPlanConfig((current) => ({ ...current, maxMoradores: Number(event.target.value) }))} 
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Máximo de documentos</label>
                      <input 
                        className="input" 
                        type="number" 
                        min="1"
                        value={planConfig.maxDocumentos || 1000} 
                        onChange={(event) => setPlanConfig((current) => ({ ...current, maxDocumentos: Number(event.target.value) }))} 
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Máximo de avisos (-1 = ilimitado)</label>
                      <input 
                        className="input" 
                        type="number" 
                        min="-1"
                        value={planConfig.maxAvisos !== undefined ? planConfig.maxAvisos : -1} 
                        onChange={(event) => setPlanConfig((current) => ({ ...current, maxAvisos: Number(event.target.value) }))} 
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={closePlanSelection}>Cancelar</button>
              <button className="btn btn-primary" onClick={handleSavePlanConfiguration} disabled={savingAction === `${planSelection?.id}:plan`}>
                {savingAction === `${planSelection?.id}:plan` ? <><Loader2 size={14} className="spin-icon" /> Salvando...</> : 'Salvar configuração'}
              </button>
            </div>
          </div>
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
