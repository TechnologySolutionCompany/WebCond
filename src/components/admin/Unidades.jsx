import { useCallback, useEffect, useMemo, useState } from 'react'
import { Bell, Home, Loader2, Plus, Search, Trash2, X } from 'lucide-react'
import WhatsAppIcon from '../shared/WhatsAppIcon'
import { supabase } from '../../lib/supabase'
import { deleteUnit, saveUnit } from '../../lib/adminApi'
import { formatCpf, normalizeCpf } from '../../lib/cpf'
import { maskCpf } from '../../lib/privacy'
import { useToast } from '../shared/Toast'
import { useAuth } from '../../hooks/useAuth'
import { useCondominiumSettings } from '../../hooks/useCondominiumSettings'
import { applyTenantFilter } from '../../lib/tenant'
import { buildResidentRequestSummary, isResidentRequestPending } from '../../lib/residentRequests'
import { compareUnitNumbers, getUnitStatusMeta, normalizeUnitNumber, UNIT_STATUSES } from '../../lib/units'

const emptyPerson = { id: null, nome: '', cpf: '', whatsapp: '', email: '', password: '' }
const emptyForm = { unitId: null, numero: '', situacao: 'ocupada', observacao: '', responsavel_financeiro: 'proprietario', proprietario: emptyPerson, inquilino: emptyPerson }

function toPersonForm(profile) {
  if (!profile) return emptyPerson
  return {
    id: profile.id,
    nome: profile.nome || '',
    cpf: profile.cpf || '',
    whatsapp: profile.whatsapp || '',
    email: String(profile.email || '').endsWith('@login.webcond.local') ? '' : profile.email || '',
    password: '',
  }
}

function openWhatsApp(number, text) {
  window.open(`https://wa.me/55${String(number).replace(/\D/g, '')}?text=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer')
}

function PersonFields({ title, value, onChange, required, isExisting }) {
  const update = (patch) => onChange({ ...value, ...patch })
  const mark = required ? ' *' : ''
  // Cadastro existente: o CPF fica mascarado ate o sindico pedir para alterar.
  const [editCpf, setEditCpf] = useState(!isExisting)

  return (
    <>
      <div className="condo-section-title">{title}</div>
      <div className="form-group" style={{ gridColumn: '1/-1' }}>
        <label className="form-label">Nome{mark}</label>
        <input className="input" value={value.nome} onChange={(event) => update({ nome: event.target.value })} />
      </div>
      <div className="form-group">
        <label className="form-label">CPF{mark}</label>
        {isExisting && !editCpf ? (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input className="input" value={maskCpf(value.cpf)} readOnly style={{ flex: 1 }} />
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditCpf(true)}>Alterar</button>
          </div>
        ) : (
          <input className="input" inputMode="numeric" value={formatCpf(value.cpf)} onChange={(event) => update({ cpf: normalizeCpf(event.target.value) })} placeholder="000.000.000-00" />
        )}
      </div>
      <div className="form-group">
        <label className="form-label">Numero de contato (WhatsApp)</label>
        <input className="input" inputMode="tel" value={value.whatsapp} onChange={(event) => update({ whatsapp: event.target.value })} placeholder="(81) 90000-0000" />
      </div>
      <div className="form-group">
        <label className="form-label">E-mail (opcional)</label>
        <input className="input" type="email" value={value.email} onChange={(event) => update({ email: event.target.value })} />
      </div>
      <div className="form-group">
        <label className="form-label">{isExisting ? 'Nova senha de acesso' : `Senha de acesso${mark}`}</label>
        <input
          className="input"
          type="password"
          autoComplete="new-password"
          value={value.password}
          onChange={(event) => update({ password: event.target.value })}
          placeholder={isExisting ? 'Deixe em branco para manter' : 'Minimo de 6 caracteres'}
        />
      </div>
    </>
  )
}

export default function Unidades({ isActive = true }) {
  const { condominiumId } = useAuth()
  const { settings: condominiumSettings } = useCondominiumSettings(condominiumId)
  const { toast } = useToast()
  const [units, setUnits] = useState([])
  const [links, setLinks] = useState([])
  const [requests, setRequests] = useState([])
  const [loading, setLoading] = useState(true)
  const [tableMissing, setTableMissing] = useState(false)
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [form, setForm] = useState(null)
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState(null)
  const [notificationsOf, setNotificationsOf] = useState(null)

  const unitLimit = Number(condominiumSettings.unitCount || 0)

  const fetchUnits = useCallback(async () => {
    setLoading(true)
    const [unitsRes, linksRes, requestsRes] = await Promise.all([
      supabase.from('unidades').select('*').eq('condominium_id', condominiumId),
      supabase.from('unidade_vinculos').select('unidade_id, vinculo, profiles(id, nome, cpf, whatsapp, email, ativo)'),
      applyTenantFilter(supabase.from('ocorrencias_predio').select('*').order('created_at', { ascending: false }), condominiumId),
    ])

    const missing = unitsRes.error?.code === 'PGRST205' || unitsRes.error?.code === '42P01'
    setTableMissing(missing)
    if (unitsRes.error && !missing) toast(unitsRes.error.message || 'Erro ao carregar unidades.', 'error')
    setUnits((unitsRes.data || []).sort((a, b) => compareUnitNumbers(a.numero, b.numero)))
    setLinks((linksRes.data || []).filter((link) => link.profiles && link.profiles.ativo !== false))
    setRequests(requestsRes.data || [])
    setLoading(false)
  }, [condominiumId, toast])

  useEffect(() => {
    if (isActive) void fetchUnits()
  }, [fetchUnits, isActive])

  // Por unidade: proprietario, inquilino e quantas unidades cada pessoa tem.
  const peopleByUnit = useMemo(() => {
    const map = new Map()
    const unitsPerPerson = new Map()
    for (const link of links) unitsPerPerson.set(link.profiles.id, (unitsPerPerson.get(link.profiles.id) || 0) + 1)
    for (const link of links) {
      if (!map.has(link.unidade_id)) map.set(link.unidade_id, { owner: null, tenant: null, all: [] })
      const entry = map.get(link.unidade_id)
      const person = { ...link.profiles, unitsCount: unitsPerPerson.get(link.profiles.id) }
      entry.all.push(person)
      if (link.vinculo === 'inquilino') entry.tenant = person
      else entry.owner = person
    }
    return map
  }, [links])

  const pendingByPerson = useMemo(() => {
    const map = new Map()
    for (const item of requests) {
      if (isResidentRequestPending(item) && item.created_by) map.set(item.created_by, (map.get(item.created_by) || 0) + 1)
    }
    return map
  }, [requests])

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase()
    const digits = query.replace(/\D/g, '')
    return units.filter((unit) => {
      if (filterStatus && unit.situacao !== filterStatus) return false
      if (!query) return true
      const entry = peopleByUnit.get(unit.id)
      return String(unit.numero).toLowerCase().includes(query)
        || (entry?.all || []).some((person) => String(person.nome || '').toLowerCase().includes(query) || (digits && String(person.cpf || '').includes(digits)))
    })
  }, [units, search, filterStatus, peopleByUnit])

  const limitReached = unitLimit > 0 && units.length >= unitLimit

  const openCreate = () => setForm(emptyForm)

  const openEdit = (unit) => {
    const entry = peopleByUnit.get(unit.id)
    setForm({
      unitId: unit.id,
      numero: unit.numero,
      situacao: unit.situacao,
      observacao: unit.observacao || '',
      responsavel_financeiro: unit.responsavel_financeiro || 'proprietario',
      proprietario: toPersonForm(entry?.owner),
      inquilino: toPersonForm(entry?.tenant),
    })
  }

  const handleSave = async () => {
    const needsOwner = form.situacao === 'ocupada'
    const needsTenant = form.situacao === 'alugada'
    const personError = (person, label, required) => {
      const filled = person.nome || person.cpf
      if (!filled) return required ? `Informe o ${label}.` : null
      if (!person.nome || person.cpf.length !== 11) return `Informe nome e CPF completo do ${label}.`
      if (person.password && person.password.length < 6) return `A senha do ${label} precisa ter pelo menos 6 caracteres.`
      if (person.password && person.password.length < 6) return `A senha do ${label} precisa ter pelo menos 6 caracteres.`
      return null
    }

    const error = !normalizeUnitNumber(form.numero)
      ? 'Informe o numero da unidade.'
      : personError(form.proprietario, 'proprietario', needsOwner) || (needsTenant ? personError(form.inquilino, 'inquilino', true) : null)

    if (error) {
      toast(error, 'error')
      return
    }

    setSaving(true)
    const payload = {
      unitId: form.unitId,
      numero: form.numero,
      situacao: form.situacao,
      observacao: form.observacao,
      responsavel_financeiro: needsTenant ? form.responsavel_financeiro : 'proprietario',
      proprietario: form.proprietario.nome || form.proprietario.cpf ? { ...form.proprietario } : null,
      inquilino: needsTenant ? { ...form.inquilino } : null,
    }

    try {
      // O backend pede confirmacao quando o CPF ja pertence a alguem do condominio (varias unidades).
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          await saveUnit(payload)
          break
        } catch (saveError) {
          if (saveError.code !== 'NEEDS_LINK') throw saveError
          const { person: found, vinculo } = saveError.details
          const where = found.apartamento ? ' (unidade ' + found.apartamento + ')' : ''
          const confirmed = window.confirm('Este CPF ja esta cadastrado:\n\n' + found.nome + '\nCPF ' + formatCpf(found.cpf) + where + '\n\nVincular como ' + vinculo + ' desta unidade? A pessoa mantem a mesma senha de acesso.')
          if (!confirmed) return
          payload[vinculo] = { ...payload[vinculo], link_existing: true }
        }
      }
      toast(form.unitId ? 'Unidade atualizada.' : 'Unidade cadastrada.', 'success')
      setForm(null)
      await fetchUnits()
    } catch (saveError) {
      toast(saveError.message || 'Nao foi possivel salvar a unidade.', 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (unit) => {
    const confirmed = window.confirm(`Excluir a unidade ${unit.numero}? Os acessos do proprietario e do inquilino serao desativados. O historico de cobrancas e mantido.`)
    if (!confirmed) return

    setDeletingId(unit.id)
    try {
      await deleteUnit({ unitId: unit.id })
      toast(`Unidade ${unit.numero} excluida.`, 'success')
      await fetchUnits()
    } catch (deleteError) {
      toast(deleteError.message || 'Nao foi possivel excluir a unidade.', 'error')
    } finally {
      setDeletingId(null)
    }
  }

  const tenantBeingReplaced = form?.situacao !== 'alugada' && form?.inquilino?.id

  return (
    <div className="fade-in">
      <div className="page-header">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <div className="page-title">Unidades</div>
            <div className="page-subtitle">{units.length} de {unitLimit || '-'} unidades cadastradas</div>
          </div>
          <button className="btn btn-primary" onClick={openCreate} disabled={limitReached || tableMissing} title={limitReached ? 'Limite de unidades atingido. Solicite a ampliacao a plataforma.' : undefined}>
            <Plus size={15} /> Cadastrar unidade
          </button>
        </div>
      </div>

      {tableMissing && (
        <div className="plan-attention-banner" role="alert">
          <div>
            <strong>Banco de dados pendente</strong>
            A tabela de unidades ainda nao foi criada. Execute o arquivo <code>sql/2026-09-19_unidades_e_limite_documentos.sql</code> no Supabase.
          </div>
        </div>
      )}

      {limitReached && !tableMissing && (
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16 }}>
          Limite de {unitLimit} unidades atingido. Para ampliar, solicite a administracao da plataforma WebCond.
        </div>
      )}

      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 220 }}>
          <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#8b949e' }} />
          <input className="input" style={{ paddingLeft: 34 }} placeholder="Buscar por unidade, nome ou CPF..." value={search} onChange={(event) => setSearch(event.target.value)} />
        </div>
        <select className="input" style={{ width: 170 }} value={filterStatus} onChange={(event) => setFilterStatus(event.target.value)}>
          <option value="">Todas as situacoes</option>
          {UNIT_STATUSES.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}
        </select>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><div className="spinner" /></div>
      ) : filtered.length === 0 ? (
        <div className="empty-state">
          <Home size={40} />
          <p>{units.length ? 'Nenhuma unidade encontrada para os filtros.' : 'Nenhuma unidade cadastrada ainda. Clique em "Cadastrar unidade".'}</p>
        </div>
      ) : (
        <div className="unit-grid">
          {filtered.map((unit) => {
            const entry = peopleByUnit.get(unit.id) || { owner: null, tenant: null, all: [] }
            const status = getUnitStatusMeta(unit.situacao)
            const pending = entry.all.reduce((sum, person) => sum + (pendingByPerson.get(person.id) || 0), 0)
            const contact = unit.responsavel_financeiro === 'inquilino' && entry.tenant ? entry.tenant : entry.owner || entry.tenant

            return (
              <div
                key={unit.id}
                className="unit-card unit-card-clickable"
                role="button"
                tabIndex={0}
                aria-label={`Abrir unidade ${unit.numero}`}
                onClick={() => openEdit(unit)}
                onKeyDown={(event) => {
                  if (event.target !== event.currentTarget) return
                  if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openEdit(unit) }
                }}
              >
                <div className="unit-card-head">
                  <div className="unit-number">{unit.numero}</div>
                  <span className={`badge ${status.badge}`}>{status.label}</span>
                </div>

                <div className="unit-person">
                  <span className="unit-person-role">Proprietario{unit.responsavel_financeiro !== 'inquilino' && ' · resp. financeiro'}</span>
                  <span>{entry.owner?.nome || '-'}{entry.owner?.unitsCount > 1 && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}> ({entry.owner.unitsCount} unidades)</span>}</span>
                </div>
                {unit.situacao === 'alugada' && (
                  <div className="unit-person">
                    <span className="unit-person-role">Inquilino{unit.responsavel_financeiro === 'inquilino' && ' · resp. financeiro'}</span>
                    <span>{entry.tenant?.nome || '-'}</span>
                  </div>
                )}
                {unit.observacao && <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{unit.observacao}</div>}

                <div className="unit-actions" onClick={(event) => event.stopPropagation()}>
                  {contact?.whatsapp && (
                    <button className="btn btn-ghost btn-sm" onClick={() => openWhatsApp(contact.whatsapp, `Ola ${contact.nome}, aqui e a administracao do condominio (unidade ${unit.numero}).`)} aria-label={`WhatsApp da unidade ${unit.numero}`}>
                      <WhatsAppIcon size={14} />
                    </button>
                  )}
                  {pending > 0 && (
                    <button className="btn btn-ghost btn-sm" onClick={() => setNotificationsOf({ unit, items: requests.filter((item) => entry.all.some((person) => person.id === item.created_by)) })}>
                      <Bell size={13} color="var(--orange)" /> {pending}
                    </button>
                  )}
                  <button className="btn btn-ghost btn-sm" style={{ marginLeft: 'auto', color: 'var(--red)' }} onClick={() => handleDelete(unit)} disabled={deletingId === unit.id} aria-label={`Excluir unidade ${unit.numero}`}>
                    {deletingId === unit.id ? <Loader2 size={13} className="spin-icon" /> : <Trash2 size={13} />}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {form && (
        <div className="modal-overlay" onClick={(event) => event.target === event.currentTarget && !saving && setForm(null)}>
          <div className="modal" style={{ maxWidth: 720 }} role="dialog" aria-modal="true">
            <div className="modal-header">
              <div className="modal-title">{form.unitId ? `Editar unidade ${form.numero}` : 'Cadastrar unidade'}</div>
              <button className="btn btn-ghost btn-icon" onClick={() => setForm(null)} disabled={saving} aria-label="Fechar"><X size={16} /></button>
            </div>

            <div className="condo-form-grid">
              <div className="form-group">
                <label className="form-label">Numero da unidade *</label>
                <input className="input" value={form.numero} onChange={(event) => setForm({ ...form, numero: event.target.value.toUpperCase() })} placeholder="Ex.: 001, 101, 01B, A" maxLength={20} />
              </div>
              <div className="form-group">
                <label className="form-label">Situacao da unidade *</label>
                <select className="input" value={form.situacao} onChange={(event) => setForm({ ...form, situacao: event.target.value })}>
                  {UNIT_STATUSES.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}
                </select>
              </div>

              <PersonFields
                title={form.situacao === 'ocupada' ? 'Proprietario (obrigatorio)' : 'Proprietario'}
                value={form.proprietario}
                onChange={(proprietario) => setForm({ ...form, proprietario })}
                required={form.situacao === 'ocupada'}
                isExisting={Boolean(form.proprietario.id)}
              />

              {form.situacao === 'alugada' && (
                <>
                  <PersonFields
                    title="Inquilino (obrigatorio)"
                    value={form.inquilino}
                    onChange={(inquilino) => setForm({ ...form, inquilino })}
                    required
                    isExisting={Boolean(form.inquilino.id)}
                  />
                  <div className="form-group" style={{ gridColumn: '1/-1' }}>
                    <label className="form-label">Responsavel financeiro</label>
                    <select className="input" value={form.responsavel_financeiro} onChange={(event) => setForm({ ...form, responsavel_financeiro: event.target.value })}>
                      <option value="proprietario">Proprietario</option>
                      <option value="inquilino">Inquilino</option>
                    </select>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                      Novas cobrancas, lembretes e mensagens vao para o WhatsApp e o e-mail do responsavel escolhido.
                    </div>
                  </div>
                </>
              )}

              <div className="form-group" style={{ gridColumn: '1/-1' }}>
                <label className="form-label">Observacao</label>
                <textarea className="input" rows={2} value={form.observacao} onChange={(event) => setForm({ ...form, observacao: event.target.value })} placeholder="Ex.: vaga de garagem 12, interditada para reforma..." />
              </div>
            </div>

            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 12, lineHeight: 1.6 }}>
              Proprietario e inquilino entram com CPF + senha. Um CPF ja cadastrado pode ser vinculado a varias unidades (voce confirma antes). Trocar o CPF substitui a pessoa nesta unidade; quem ficar sem nenhuma unidade perde o acesso (o historico de cobrancas e mantido).
              {tenantBeingReplaced && <div style={{ color: 'var(--orange)' }}>Ao salvar, o inquilino atual perde o acesso porque a unidade deixa de estar alugada.</div>}
            </div>

            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setForm(null)} disabled={saving}>Cancelar</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? <><Loader2 size={14} className="spin-icon" /> Salvando...</> : 'Salvar unidade'}
              </button>
            </div>
          </div>
        </div>
      )}

      {notificationsOf && (
        <div className="modal-overlay" onClick={(event) => event.target === event.currentTarget && setNotificationsOf(null)}>
          <div className="modal" role="dialog" aria-modal="true">
            <div className="modal-header">
              <div className="modal-title">Avisos da unidade {notificationsOf.unit.numero}</div>
              <button className="btn btn-ghost btn-icon" onClick={() => setNotificationsOf(null)} aria-label="Fechar"><X size={16} /></button>
            </div>
            <div style={{ display: 'grid', gap: 10 }}>
              {notificationsOf.items.map((item) => {
                const summary = buildResidentRequestSummary(item)
                return (
                  <div key={item.id} style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 12, background: 'var(--bg-3)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 4 }}>
                      <strong>{summary.title}</strong>
                      {isResidentRequestPending(item) && <span className="badge badge-orange">Pendente</span>}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{summary.detail}</div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
