import { useMemo, useState } from 'react'
import { AlertTriangle, Building2, CheckCircle2, Download, FileSpreadsheet, KeyRound, Loader2, Search, Upload, XCircle } from 'lucide-react'
import { useToast } from '../shared/Toast'
import AddressFields from '../shared/AddressFields'
import {
  exportPlatformCondominium,
  importPlatformResidents,
  updatePlatformCondominium,
  updatePlatformSyndicPassword,
} from '../../lib/platformApi'
import { formatCpfCnpj, normalizeCpfCnpj } from '../../lib/document'
import { PLAN_LIST, PLAN_PERIOD_DAYS, PLAN_WARNING_DAYS, TRIAL_PERIOD_DAYS } from '../../lib/condominiumPlan'
import { emptyAddress } from '../../lib/address'

const STATUS_LABELS = {
  pending: { label: 'Pendente', badge: 'badge-orange' },
  active: { label: 'Ativo', badge: 'badge-green' },
  blocked: { label: 'Bloqueado', badge: 'badge-red' },
  rejected: { label: 'Rejeitado', badge: 'badge-red' },
}

const TABS = [
  { key: 'config', label: 'Configuracoes do condominio' },
  { key: 'plan', label: 'Status / Plano' },
  { key: 'access', label: 'Acesso do sindico' },
  { key: 'data', label: 'Exportar / Importar' },
]

function formatDate(dateValue = '') {
  if (!dateValue) return '-'
  const date = new Date(dateValue)
  return Number.isNaN(date.getTime()) ? '-' : date.toLocaleDateString('pt-BR')
}

function getPlanChoice(item) {
  return item.subscription_status === 'active' ? item.plan_name : 'trial'
}

function toDateInput(dateValue) {
  if (!dateValue) return ''
  const date = new Date(dateValue)
  if (Number.isNaN(date.getTime())) return ''
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10)
}

function defaultExpiry() {
  const date = new Date()
  date.setDate(date.getDate() + PLAN_PERIOD_DAYS)
  return toDateInput(date)
}

function buildForm(item) {
  return {
    name: item.name || '',
    cnpj: item.cnpj || '',
    whatsapp: item.whatsapp || item.syndic?.whatsapp || '',
    unit_count: String(item.unit_count || ''),
    syndic_name: item.syndic?.nome || '',
    syndic_email: item.syndic?.email || '',
    sub_syndic: { name: item.sub_syndic?.name || '', whatsapp: item.sub_syndic?.whatsapp || '' },
    address_details: { ...emptyAddress, ...item.address_details },
    platform_note: item.platform_note || '',
    status: item.raw_status || item.status || 'pending',
    plan: getPlanChoice(item),
    plan_expires_at: toDateInput(item.plan_expires_at),
  }
}

function PlanSummary({ item }) {
  if (item.status === 'pending') return <span style={{ color: 'var(--text-muted)' }}>Aguardando aprovacao</span>
  if (item.plan_locked) {
    return <span className="badge badge-orange"><AlertTriangle size={10} /> {item.subscription_status === 'active' ? `Plano ${item.plan_name} vencido` : 'Teste encerrado'}</span>
  }
  if (item.subscription_status === 'active') {
    return (
      <div>
        <span className="badge badge-green">{item.plan_name === 'PARCERIA' ? 'Parceria' : `Plano ${item.plan_name}`}</span>
        {item.plan_ends_at && <div style={{ fontSize: 12, color: item.plan_expiring_soon ? 'var(--orange)' : 'var(--text-muted)', marginTop: 4 }}>Valido ate {formatDate(item.plan_ends_at)}</div>}
      </div>
    )
  }
  return (
    <div>
      <div style={{ fontWeight: 600 }}>Teste</div>
      <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Vence em {formatDate(item.trial_ends_at)}</div>
    </div>
  )
}

export default function PlatformCondominiums({ condominiums, loading, error, reload }) {
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [selected, setSelected] = useState(null)
  const [tab, setTab] = useState('config')
  const [form, setForm] = useState(null)
  const [syndicPassword, setSyndicPassword] = useState('')
  const [busy, setBusy] = useState('')
  const [importRows, setImportRows] = useState(null)
  const [importFileName, setImportFileName] = useState('')
  const [importResult, setImportResult] = useState(null)
  const { toast } = useToast()

  const filtered = useMemo(() => (condominiums || []).filter((item) => {
    const query = search.trim().toLowerCase()
    const digits = query.replace(/\D/g, '')
    const matchSearch = !query
      || String(item.name || '').toLowerCase().includes(query)
      || (digits && String(item.cnpj || '').includes(digits))
      || String(item.syndic?.nome || '').toLowerCase().includes(query)

    return matchSearch && (!filterStatus || item.status === filterStatus)
  }), [condominiums, filterStatus, search])

  const updateForm = (patch) => setForm((current) => ({ ...current, ...patch }))

  const openCondominium = (item) => {
    setSelected(item)
    setForm(buildForm(item))
    setTab('config')
    setSyndicPassword('')
    setImportRows(null)
    setImportFileName('')
    setImportResult(null)
  }

  const closeCondominium = () => {
    if (busy) return
    setSelected(null)
    setForm(null)
  }

  const handleSave = async () => {
    const password = syndicPassword.trim()
    if (password && password.length < 6) {
      setTab('access')
      toast('A nova senha do sindico precisa ter pelo menos 6 caracteres.', 'error')
      return
    }

    setBusy('save')
    try {
      await updatePlatformCondominium({
        condominiumId: selected.id,
        action: 'save',
        name: form.name,
        cnpj: form.cnpj,
        whatsapp: form.whatsapp,
        unit_count: Number(form.unit_count),
        syndic_name: form.syndic_name,
        syndic_email: form.syndic_email,
        sub_syndic: form.sub_syndic,
        address_details: form.address_details,
        platform_note: form.platform_note,
        status: form.status,
        plan: form.plan,
        plan_expires_at: form.plan === 'trial' ? '' : form.plan_expires_at,
      })

      // A senha e aplicada no mesmo "Salvar": antes ela exigia um botao separado e era ignorada ao salvar.
      if (password) {
        await updatePlatformSyndicPassword({ condominiumId: selected.id, password })
      }

      toast(password ? 'Condominio salvo e senha do sindico atualizada.' : 'Condominio salvo com sucesso.', 'success')
      setSelected(null)
      setForm(null)
      await reload()
    } catch (saveError) {
      toast(saveError.message || 'Nao foi possivel salvar o condominio.', 'error')
    } finally {
      setBusy('')
    }
  }

  const handleQuickAction = async (action) => {
    setBusy(action)
    try {
      await updatePlatformCondominium({ condominiumId: selected.id, action })
      toast(action === 'approve' ? `Condominio aprovado. Teste de ${TRIAL_PERIOD_DAYS} dias iniciado hoje.` : 'Cadastro rejeitado.', 'success')
      setSelected(null)
      setForm(null)
      await reload()
    } catch (actionError) {
      toast(actionError.message || 'Nao foi possivel concluir a acao.', 'error')
    } finally {
      setBusy('')
    }
  }

  const handleExport = async () => {
    setBusy('export')
    try {
      const data = await exportPlatformCondominium(selected.id)
      const { downloadResidentsWorkbook } = await import('../../lib/residentSpreadsheet')
      await downloadResidentsWorkbook(data)
      toast(`Planilha exportada com ${data.residents.length} cadastro(s).`, 'success')
    } catch (exportError) {
      toast(exportError.message || 'Nao foi possivel exportar os dados.', 'error')
    } finally {
      setBusy('')
    }
  }

  const handleImportFile = async (file) => {
    setImportRows(null)
    setImportResult(null)
    setImportFileName(file?.name || '')
    if (!file) return

    try {
      const { readResidentsWorkbook } = await import('../../lib/residentSpreadsheet')
      setImportRows(await readResidentsWorkbook(file))
    } catch (readError) {
      toast(readError.message || 'Nao foi possivel ler a planilha.', 'error')
      setImportFileName('')
    }
  }

  const handleImport = async () => {
    setBusy('import')
    try {
      const result = await importPlatformResidents({ condominiumId: selected.id, rows: importRows })
      setImportResult(result)
      setImportRows(null)
      toast('Importacao concluida. Confira o resultado abaixo.', 'success')
      await reload()
    } catch (importError) {
      toast(importError.message || 'Nao foi possivel importar os cadastros.', 'error')
    } finally {
      setBusy('')
    }
  }

  const handleDownloadReport = async () => {
    const { downloadImportReport } = await import('../../lib/residentSpreadsheet')
    await downloadImportReport(importResult.results)
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

  const selectedPlan = PLAN_LIST.find((plan) => plan.id === (form?.plan === 'trial' ? 'ONE' : form?.plan))

  return (
    <div className="fade-in">
      <div className="page-header">
        <div className="page-title">Condominios</div>
        <div className="page-subtitle">Clique em um condominio para ver e editar todos os dados, status e plano</div>
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
          {Object.entries(STATUS_LABELS).map(([value, { label }]) => <option key={value} value={value}>{label}</option>)}
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
                <th>Situacao</th>
                <th>Plano</th>
                <th>Unidades</th>
                <th>Documentos</th>
                <th>Sindico</th>
                <th>Criado em</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((item) => (
                <tr
                  key={item.id}
                  className="platform-condo-row"
                  tabIndex={0}
                  onClick={() => openCondominium(item)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      openCondominium(item)
                    }
                  }}
                >
                  <td>
                    <div style={{ fontWeight: 700 }}>{item.name}</div>
                    <div style={{ fontSize: 12, color: '#8b949e' }}>{item.cnpj ? formatCpfCnpj(item.cnpj) : '-'}</div>
                    <div style={{ fontSize: 12, color: '#8b949e' }}>{item.address || '-'}</div>
                  </td>
                  <td><span className={`badge ${STATUS_LABELS[item.status]?.badge || 'badge-orange'}`}>{STATUS_LABELS[item.status]?.label || item.status}</span></td>
                  <td><PlanSummary item={item} /></td>
                  <td>{item.apartments_count || 0} / {item.unit_count || '-'}</td>
                  <td>{item.documents_count || 0} / {item.document_limit}</td>
                  <td>
                    <div style={{ fontWeight: 600 }}>{item.syndic?.nome || '-'}</div>
                    <div style={{ fontSize: 12, color: '#8b949e' }}>{item.sub_syndic?.name ? `Sub.: ${item.sub_syndic.name}` : item.syndic?.email || '-'}</div>
                  </td>
                  <td>{formatDate(item.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selected && form && (
        <div className="modal-overlay" onClick={(event) => event.target === event.currentTarget && closeCondominium()}>
          <div className="modal condo-modal" role="dialog" aria-modal="true" aria-label={`Condominio ${selected.name}`}>
            <div className="modal-header" style={{ alignItems: 'flex-start', gap: 12 }}>
              <div>
                <div className="modal-title">{selected.name}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                  <span className={`badge ${STATUS_LABELS[selected.status]?.badge}`}>{STATUS_LABELS[selected.status]?.label}</span>
                  {' '}Cadastrado em {formatDate(selected.created_at)}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                {selected.status === 'pending' && (
                  <>
                    <button className="btn btn-primary btn-sm" onClick={() => handleQuickAction('approve')} disabled={Boolean(busy)}>
                      {busy === 'approve' ? <Loader2 size={14} className="spin-icon" /> : <CheckCircle2 size={14} />} Aprovar
                    </button>
                    <button className="btn btn-danger btn-sm" onClick={() => handleQuickAction('reject')} disabled={Boolean(busy)}>
                      Rejeitar
                    </button>
                  </>
                )}
                <button className="btn btn-ghost btn-icon" onClick={closeCondominium} aria-label="Fechar">
                  <XCircle size={16} />
                </button>
              </div>
            </div>

            <div className="condo-tabs" role="tablist">
              {TABS.map((item) => (
                <button key={item.key} className="condo-tab" role="tab" aria-selected={tab === item.key} onClick={() => setTab(item.key)}>
                  {item.label}
                </button>
              ))}
            </div>

            {tab === 'config' && (
              <div className="condo-form-grid">
                <div className="form-group" style={{ gridColumn: '1/-1' }}>
                  <label className="form-label">Nome do condominio</label>
                  <input className="input" value={form.name} onChange={(event) => updateForm({ name: event.target.value })} />
                </div>

                <div className="condo-section-title">Responsaveis</div>
                <div className="form-group">
                  <label className="form-label">Sindico</label>
                  <input className="input" value={form.syndic_name} onChange={(event) => updateForm({ syndic_name: event.target.value })} disabled={!selected.syndic?.id} />
                </div>
                <div className="form-group">
                  <label className="form-label">E-mail do condominio / sindico</label>
                  <input className="input" type="email" value={form.syndic_email} onChange={(event) => updateForm({ syndic_email: event.target.value })} disabled={!selected.syndic?.id} />
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Corrige o e-mail cadastrado. O login continua pelo CNPJ e a senha nao muda.</span>
                </div>
                <div className="form-group">
                  <label className="form-label">Contato do sindico (WhatsApp)</label>
                  <input className="input" value={form.whatsapp} onChange={(event) => updateForm({ whatsapp: event.target.value })} />
                </div>
                <div className="form-group">
                  <label className="form-label">Subsindico (opcional)</label>
                  <input className="input" value={form.sub_syndic.name} onChange={(event) => updateForm({ sub_syndic: { ...form.sub_syndic, name: event.target.value } })} />
                </div>
                <div className="form-group">
                  <label className="form-label">Contato do subsindico (opcional)</label>
                  <input className="input" value={form.sub_syndic.whatsapp} onChange={(event) => updateForm({ sub_syndic: { ...form.sub_syndic, whatsapp: event.target.value } })} />
                </div>

                <div className="condo-section-title">Documento e unidades</div>
                <div className="form-group">
                  <label className="form-label">CNPJ ou CPF administrativo</label>
                  <input className="input" value={formatCpfCnpj(form.cnpj)} onChange={(event) => updateForm({ cnpj: normalizeCpfCnpj(event.target.value) })} />
                </div>
                <div className="form-group">
                  <label className="form-label">Quantidade de unidades</label>
                  <input
                    className="input"
                    type="number"
                    min={Math.max(selected.apartments_count || 0, 1)}
                    step="1"
                    value={form.unit_count}
                    onChange={(event) => updateForm({ unit_count: event.target.value })}
                  />
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                    {selected.apartments_count || 0} ocupadas. Somente a plataforma altera este limite; o sindico nao tem acesso.
                  </div>
                </div>

                <div className="condo-section-title">Endereco completo</div>
                <AddressFields value={form.address_details} onChange={(address_details) => updateForm({ address_details })} />

                <div className="form-group" style={{ gridColumn: '1/-1' }}>
                  <label className="form-label">Nota interna da plataforma</label>
                  <textarea className="input" rows={3} value={form.platform_note} onChange={(event) => updateForm({ platform_note: event.target.value })} placeholder="Visivel apenas para o administrador da plataforma." />
                </div>
              </div>
            )}

            {tab === 'plan' && (
              <div style={{ display: 'grid', gap: 18 }}>
                <div className="form-group" style={{ maxWidth: 280 }}>
                  <label className="form-label">Situacao do cadastro</label>
                  <select className="input" value={form.status} onChange={(event) => updateForm({ status: event.target.value })}>
                    {Object.entries(STATUS_LABELS).map(([value, { label }]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                </div>

                <div>
                  <div className="form-label" style={{ marginBottom: 8 }}>Plano</div>
                  <div className="plan-grid">
                    <button type="button" className="plan-card" aria-pressed={form.plan === 'trial'} onClick={() => updateForm({ plan: 'trial' })}>
                      <span className="plan-card-name">Teste</span>
                      <span className="plan-card-meta">{TRIAL_PERIOD_DAYS} dias a partir da aprovacao</span>
                      <span className="plan-card-meta">Recursos do ONE</span>
                    </button>
                    {PLAN_LIST.map((plan) => (
                      <button
                        key={plan.id}
                        type="button"
                        className="plan-card"
                        aria-pressed={form.plan === plan.id}
                        disabled={!plan.available}
                        onClick={() => updateForm({ plan: plan.id, plan_expires_at: form.plan_expires_at || defaultExpiry() })}
                      >
                        <span className="plan-card-name">{plan.label}</span>
                        <span className="plan-card-meta">{plan.partnership ? '100% gratuito, sem vencimento' : `${plan.priceLabel}/mes`}</span>
                        <span className="plan-card-meta">{plan.partnership ? 'Todas as funcionalidades' : `Ate ${plan.documentLimit} documentos`}</span>
                        {!plan.available && <span className="plan-card-dev">Em desenvolvimento</span>}
                      </button>
                    ))}
                  </div>
                </div>

                {form.plan !== 'trial' && !selectedPlan?.partnership && (
                  <div className="form-group" style={{ maxWidth: 280 }}>
                    <label className="form-label">Plano valido ate</label>
                    <input className="input" type="date" value={form.plan_expires_at} onChange={(event) => updateForm({ plan_expires_at: event.target.value })} />
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Para renovar, altere a data. Faltando {PLAN_WARNING_DAYS} dias o sindico ve o aviso "Atualize seu plano".</span>
                  </div>
                )}

                <div className="condo-readonly" style={{ display: 'grid', gap: 4 }}>
                  {selected.metadata?.requested_plan && (
                    <div>Plano que o sindico marcou no cadastro: <strong>{selected.metadata.requested_plan}</strong> (intencao, nao contratacao)</div>
                  )}
                  <div>Aprovado em: <strong>{formatDate(selected.approved_at)}</strong></div>
                  <div>Teste: {formatDate(selected.trial_started_at)} ate <strong>{formatDate(selected.trial_ends_at)}</strong></div>
                  <div>Limite de documentos: <strong>{selectedPlan?.documentLimit}</strong> ({selected.documents_count || 0} usados)</div>
                  {selected.subscription_status === 'active' && <div>Plano valido ate: <strong>{selected.plan_name === 'PARCERIA' ? 'sem vencimento (parceria)' : formatDate(selected.plan_ends_at)}</strong></div>}
                  {selected.plan_locked && (
                    <div style={{ color: 'var(--orange)', display: 'flex', gap: 6, alignItems: 'center' }}>
                      <AlertTriangle size={14} /> {selected.subscription_status === 'active' ? 'Plano vencido' : 'Teste encerrado'}: o painel do condominio esta somente para visualizacao ate a renovacao.
                    </div>
                  )}
                </div>
              </div>
            )}

            {tab === 'access' && (
              <div style={{ display: 'grid', gap: 14, maxWidth: 420 }}>
                <div className="condo-readonly">
                  <div style={{ fontWeight: 700 }}>{selected.syndic?.nome || 'Sindico nao encontrado'}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{selected.syndic?.email || 'Sem e-mail vinculado'}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Entra com o proprio CPF ou com o CNPJ do condominio.</div>
                </div>
                <div className="form-group">
                  <label className="form-label"><KeyRound size={12} /> Nova senha do sindico</label>
                  <input
                    className="input"
                    type="password"
                    autoComplete="new-password"
                    value={syndicPassword}
                    onChange={(event) => setSyndicPassword(event.target.value)}
                    placeholder="Minimo de 6 caracteres. Deixe em branco para manter."
                    disabled={!selected.syndic?.id}
                  />
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>A senha e aplicada ao clicar em "Salvar alteracoes".</div>
                </div>
              </div>
            )}

            {tab === 'data' && (
              <div style={{ display: 'grid', gap: 18 }}>
                <div className="card" style={{ margin: 0 }}>
                  <div style={{ fontWeight: 700, marginBottom: 4 }}>Exportar dados</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
                    Gera uma planilha .xlsx com todos os moradores e contadores deste condominio (resumo geral ou migracao).
                  </div>
                  <button className="btn btn-ghost" onClick={handleExport} disabled={Boolean(busy)}>
                    {busy === 'export' ? <Loader2 size={14} className="spin-icon" /> : <Download size={14} />} Exportar planilha
                  </button>
                </div>

                <div className="card" style={{ margin: 0 }}>
                  <div style={{ fontWeight: 700, marginBottom: 4 }}>Importar cadastros</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12, lineHeight: 1.6 }}>
                    Envie a planilha exportada do condominio antigo (.xls ou .xlsx). Quem ja tem acesso e transferido para este condominio e mantem a senha;
                    cadastros novos recebem senha temporaria. O limite de {selected.unit_count || '-'} unidades e respeitado.
                  </div>
                  <label className="btn btn-ghost" style={{ display: 'inline-flex' }}>
                    <FileSpreadsheet size={14} /> {importFileName || 'Escolher planilha'}
                    <input
                      type="file"
                      accept=".xls,.xlsx,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                      className="sr-only"
                      onChange={(event) => { void handleImportFile(event.target.files?.[0]); event.target.value = '' }}
                    />
                  </label>

                  {importRows && (
                    <div style={{ marginTop: 12, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 13 }}>{importRows.length} cadastro(s) encontrados na planilha.</span>
                      <button className="btn btn-primary" onClick={handleImport} disabled={Boolean(busy)}>
                        {busy === 'import' ? <Loader2 size={14} className="spin-icon" /> : <Upload size={14} />} Importar {importRows.length} cadastro(s)
                      </button>
                    </div>
                  )}

                  {importResult && (
                    <div className="condo-readonly" style={{ marginTop: 12 }}>
                      <div style={{ marginBottom: 8 }}>
                        Criados: <strong>{importResult.summary.criado || 0}</strong> · Transferidos: <strong>{importResult.summary.transferido || 0}</strong> ·
                        Atualizados: <strong>{importResult.summary.atualizado || 0}</strong> · Erros: <strong>{importResult.summary.erro || 0}</strong>
                      </div>
                      {importResult.results.filter((item) => item.status === 'erro').slice(0, 5).map((item) => (
                        <div key={item.linha} style={{ fontSize: 12, color: 'var(--red)' }}>Linha {item.linha} ({item.nome || item.cpf}): {item.detalhe}</div>
                      ))}
                      <button className="btn btn-ghost btn-sm" style={{ marginTop: 8 }} onClick={handleDownloadReport}>
                        <Download size={12} /> Baixar relatorio completo
                      </button>
                      {(importResult.summary.criado || 0) > 0 && (
                        <div style={{ fontSize: 12, color: 'var(--orange)', marginTop: 6 }}>
                          O relatorio contem as senhas temporarias dos novos acessos: entregue a cada morador e apague o arquivo depois.
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}

            {tab !== 'data' && (
              <div className="modal-footer">
                <button className="btn btn-ghost" onClick={closeCondominium} disabled={Boolean(busy)}>Cancelar</button>
                <button className="btn btn-primary" onClick={handleSave} disabled={Boolean(busy)}>
                  {busy === 'save' ? <><Loader2 size={14} className="spin-icon" /> Salvando...</> : 'Salvar alteracoes'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
