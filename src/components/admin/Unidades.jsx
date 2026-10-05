import { useCallback, useEffect, useMemo, useState } from 'react'
import { Ban, Bell, ChevronRight, DoorOpen, Home, KeyRound, LayoutGrid, Link2, List, Loader2, Plus, Search, Trash2, X } from 'lucide-react'
import SolicitacoesCadastro from './SolicitacoesCadastro'
import WhatsAppIcon from '../shared/WhatsAppIcon'
import { supabase } from '../../lib/supabase'
import { deleteUnit, saveUnit } from '../../lib/adminApi'
import { formatCpf, normalizeCpf } from '../../lib/cpf'
import { maskCpf } from '../../lib/privacy'
import { useToast } from '../shared/Toast'
import { useAuth } from '../../hooks/useAuth'
import { useCondominiumSettings } from '../../hooks/useCondominiumSettings'
import { applyTenantFilter } from '../../lib/tenant'
import { buildResidentRequestSummary, filterSyndicNotifications, isResidentPaymentConfirmation, isResidentRequestPending, parseResidentRequest } from '../../lib/residentRequests'
import { compareUnitNumbers, normalizeUnitNumber, UNIT_STATUSES } from '../../lib/units'
import { getChargePaymentStatus } from '../../lib/chargeStatus'
import { formatReferenceLong } from '../../lib/billingShared'

// Situacao do pagamento da unidade no mapa (redesign v2.10A3): cor do quadradinho.
const PAY_META = {
  paid: { label: 'Paga', tone: 'green' },
  informed: { label: 'Informada', tone: 'primary' },
  open: { label: 'Em aberto', tone: 'amber' },
  late: { label: 'Em atraso', tone: 'red' },
  none: { label: 'Sem cobrança', tone: 'neutral' },
}

const SITUACAO_META = {
  ocupada: { label: 'Ocupada', tone: 'neutral', Icon: Home },
  alugada: { label: 'Alugada', tone: 'primary', Icon: KeyRound },
  desocupada: { label: 'Desocupada', tone: 'amber', Icon: DoorOpen },
  interditada: { label: 'Interditada', tone: 'red', Icon: Ban },
}

// Andar pelo numero: 101 -> 1, 1203 -> 12, 001/01B -> terreo. Letras (A, B...) ficam em "Outras".
function floorOf(numero = '') {
  const digits = String(numero).match(/^\d+/)?.[0] || ''
  if (!digits) return { key: 9999, label: '—' }
  if (digits.length <= 2) return { key: 0, label: 'T' }
  const floor = Number(digits.slice(0, -2))
  return { key: floor, label: floor === 0 ? 'T' : `${floor}º` }
}

function shortName(nome = '') {
  const parts = String(nome).trim().split(/\s+/).filter(Boolean)
  if (parts.length <= 1) return parts[0] || ''
  return `${parts[0]} ${parts[parts.length - 1][0]}.`
}

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
        <label className="form-label">E-mail de acesso{mark}</label>
        <input className="input" type="email" inputMode="email" autoCapitalize="none" spellCheck={false} value={value.email} onChange={(event) => update({ email: event.target.value })} placeholder="pessoa@exemplo.com" />
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
  const [view, setView] = useState('mapa')
  const [charges, setCharges] = useState([])
  const [form, setForm] = useState(null)
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState(null)
  const [notificationsOf, setNotificationsOf] = useState(null)
  // Importacao por planilha continua pronta em ImportarUnidades.jsx, fora do menu por ora.
  const [signupOpen, setSignupOpen] = useState(false)
  const [pendingSignups, setPendingSignups] = useState(0)

  const unitLimit = Number(condominiumSettings.unitCount || 0)

  const fetchUnits = useCallback(async () => {
    setLoading(true)
    const [unitsRes, linksRes, requestsRes, signupRes, chargesRes] = await Promise.all([
      supabase.from('unidades').select('*').eq('condominium_id', condominiumId),
      supabase.from('unidade_vinculos').select('unidade_id, vinculo, profiles(id, nome, cpf, whatsapp, email, ativo)'),
      applyTenantFilter(supabase.from('ocorrencias_predio').select('*').order('created_at', { ascending: false }), condominiumId),
      supabase.from('solicitacoes_cadastro').select('id', { count: 'exact', head: true }).eq('condominium_id', condominiumId).eq('status', 'pendente'),
      applyTenantFilter(supabase.from('cobrancas').select('id, unidade_id, unidade_numero, mes_referencia, vencimento, pago, payment_status'), condominiumId),
    ])

    const missing = unitsRes.error?.code === 'PGRST205' || unitsRes.error?.code === '42P01'
    setTableMissing(missing)
    if (unitsRes.error && !missing) toast(unitsRes.error.message || 'Erro ao carregar unidades.', 'error')
    setUnits((unitsRes.data || []).sort((a, b) => compareUnitNumbers(a.numero, b.numero)))
    setLinks((linksRes.data || []).filter((link) => link.profiles && link.profiles.ativo !== false))
    // Confirmacao de pagamento de cobranca excluida nao aparece mais no sino da unidade.
    setRequests(filterSyndicNotifications(requestsRes.data || [], {
      chargeIds: new Set((chargesRes.data || []).map((item) => item.id)),
    }))
    setCharges(chargesRes.data || [])
    setPendingSignups(signupRes.count || 0)
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

  // Competencia mais recente lancada: e ela que o mapa mostra (paga / informada / em aberto).
  const currentReference = useMemo(() => charges.reduce((latest, charge) => (
    String(charge.mes_referencia || '') > latest ? String(charge.mes_referencia || '') : latest
  ), ''), [charges])

  const payByUnit = useMemo(() => {
    const informedCharges = new Set(requests
      .filter((item) => isResidentPaymentConfirmation(item) && isResidentRequestPending(item))
      .map((item) => parseResidentRequest(item).chargeId))
    const map = new Map()
    for (const unit of units) {
      const own = charges.filter((charge) => charge.unidade_id === unit.id || (!charge.unidade_id && normalizeUnitNumber(charge.unidade_numero) === normalizeUnitNumber(unit.numero)))
      const late = own.some((charge) => getChargePaymentStatus(charge) === 'OVERDUE' && !informedCharges.has(charge.id))
      const current = own.filter((charge) => charge.mes_referencia === currentReference)
      let key = 'none'
      if (late) key = 'late'
      else if (current.length) {
        const statuses = current.map((charge) => (informedCharges.has(charge.id) ? 'UNDER_REVIEW' : getChargePaymentStatus(charge)))
        if (statuses.every((status) => status === 'PAID' || status === 'CANCELLED')) key = 'paid'
        else if (statuses.some((status) => status === 'UNDER_REVIEW')) key = 'informed'
        else key = 'open'
      }
      map.set(unit.id, key)
    }
    return map
  }, [units, charges, requests, currentReference])

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase()
    const digits = query.replace(/\D/g, '')
    return units.filter((unit) => {
      if (filterStatus === 'atraso' ? payByUnit.get(unit.id) !== 'late' : filterStatus && unit.situacao !== filterStatus) return false
      if (!query) return true
      const entry = peopleByUnit.get(unit.id)
      return String(unit.numero).toLowerCase().includes(query)
        || (entry?.all || []).some((person) => String(person.nome || '').toLowerCase().includes(query) || (digits && String(person.cpf || '').includes(digits)))
    })
  }, [units, search, filterStatus, peopleByUnit, payByUnit])

  const floors = useMemo(() => {
    const groups = new Map()
    for (const unit of filtered) {
      const floor = floorOf(unit.numero)
      if (!groups.has(floor.key)) groups.set(floor.key, { ...floor, units: [] })
      groups.get(floor.key).units.push(unit)
    }
    return Array.from(groups.values()).sort((a, b) => (a.key === 9999 ? 1 : b.key === 9999 ? -1 : b.key - a.key))
  }, [filtered])

  const countBy = (situacao) => units.filter((unit) => unit.situacao === situacao).length
  const lateCount = units.filter((unit) => payByUnit.get(unit.id) === 'late').length
  const chips = [
    ['', `Todas · ${units.length}`],
    ...UNIT_STATUSES.map((status) => [status.value, `${status.label}s · ${countBy(status.value)}`]),
    ...(lateCount ? [['atraso', `Em atraso · ${lateCount}`]] : []),
  ]

  const unitInfo = (unit) => {
    const entry = peopleByUnit.get(unit.id) || { owner: null, tenant: null, all: [] }
    const pending = entry.all.reduce((sum, person) => sum + (pendingByPerson.get(person.id) || 0), 0)
    const contact = unit.responsavel_financeiro === 'inquilino' && entry.tenant ? entry.tenant : entry.owner || entry.tenant
    return { entry, pending, contact, pay: PAY_META[payByUnit.get(unit.id) || 'none'], sit: SITUACAO_META[unit.situacao] || SITUACAO_META.desocupada }
  }

  const openNotifications = (unit, entry) => setNotificationsOf({ unit, items: requests.filter((item) => entry.all.some((person) => person.id === item.created_by)) })

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

  // Ocupada tambem pode ter morador que nao e o proprietario; so desocupada/interditada libera a unidade.
  const showTenantFields = form?.situacao === 'alugada' || (form?.situacao === 'ocupada' && Boolean(form?.inquilino?.id))
  const tenantBeingReplaced = form?.inquilino?.id && form?.situacao !== 'alugada' && form?.situacao !== 'ocupada'

  return (
    <div className="fade-in">
      {signupOpen && (
        <SolicitacoesCadastro
          onClose={() => { setSignupOpen(false); void fetchUnits() }}
          onApproved={fetchUnits}
        />
      )}

      <div className="screen">
        <div className="screen-head">
          <div>
            <h1 className="screen-title">Unidades</h1>
            <div className="screen-sub">{units.length} de {unitLimit || '-'} unidades cadastradas</div>
          </div>
          <div className="screen-actions">
            <button className="btn btn-ghost" onClick={() => setSignupOpen(true)} disabled={tableMissing}>
              <Link2 size={16} /> Link de autocadastro
              {pendingSignups > 0 && <span className="nav-badge">{pendingSignups}</span>}
            </button>
            <button className="btn btn-primary" onClick={openCreate} disabled={limitReached || tableMissing} title={limitReached ? 'Limite de unidades atingido. Solicite a ampliacao a plataforma.' : undefined}>
              <Plus size={17} /> Nova unidade
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
          <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            Limite de {unitLimit} unidades atingido. Para ampliar, solicite a administracao da plataforma WebCond.
          </div>
        )}

        <div className="toolbar">
          <label className="search-box">
            <Search size={18} />
            <input className="input" placeholder="Buscar unidade, morador ou CPF" value={search} onChange={(event) => setSearch(event.target.value)} aria-label="Buscar unidade" />
          </label>
          <div className="seg" role="tablist" aria-label="Forma de ver as unidades">
            <button type="button" role="tab" aria-selected={view === 'mapa'} className={view === 'mapa' ? 'active' : ''} onClick={() => setView('mapa')}><LayoutGrid size={16} />Mapa</button>
            <button type="button" role="tab" aria-selected={view === 'lista'} className={view === 'lista' ? 'active' : ''} onClick={() => setView('lista')}><List size={16} />Lista</button>
          </div>
        </div>

        <div className="chips" role="group" aria-label="Filtrar unidades">
          {chips.map(([value, label]) => (
            <button key={value || 'todas'} type="button" className={`chip${filterStatus === value ? ' active' : ''}`} onClick={() => setFilterStatus(value)}>{label}</button>
          ))}
        </div>

        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><div className="spinner" /></div>
        ) : filtered.length === 0 ? (
          <div className="empty-card">
            <Home size={36} />
            <span>{units.length ? 'Nenhuma unidade encontrada para os filtros.' : 'Nenhuma unidade cadastrada ainda. Toque em "Nova unidade".'}</span>
          </div>
        ) : view === 'mapa' ? (
          <div className="unit-map">
            <div className="unit-map-legend">
              <strong>{currentReference ? formatReferenceLong(currentReference) : 'Sem cobranças lançadas'}</strong>
              <span><i style={{ background: 'var(--green-solid)' }} />Paga</span>
              <span><i style={{ background: 'var(--primary)' }} />Informada</span>
              <span><i style={{ background: 'var(--amber-solid)' }} />Em aberto</span>
              <span><i style={{ background: 'var(--red-solid)' }} />Em atraso</span>
            </div>
            {floors.map((floor) => (
              <div key={floor.key} className="floor-row">
                <div className="floor-label">{floor.label}</div>
                <div className="floor-units">
                  {floor.units.map((unit) => {
                    const { entry, pending, pay, sit } = unitInfo(unit)
                    const SitIcon = sit.Icon
                    const person = unit.situacao === 'alugada' && entry.tenant ? entry.tenant : entry.owner || entry.tenant
                    return (
                      <button key={unit.id} type="button" className={`unit-tile tone-${pay.tone}`} onClick={() => openEdit(unit)} title={`Unidade ${unit.numero} · ${pay.label} · ${sit.label}`} aria-label={`Abrir unidade ${unit.numero}, ${pay.label}, ${sit.label}`}>
                        <span className="unit-tile-top">
                          <span className="unit-tile-num">{unit.numero}</span>
                          <span className="unit-tile-icons">
                            {pending > 0 && <><Bell size={13} />{pending}</>}
                            {unit.situacao !== 'ocupada' && <SitIcon size={14} />}
                          </span>
                        </span>
                        <span className="unit-tile-name">{shortName(person?.nome) || sit.label}</span>
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="list-card">
            <div className="list-head unit-list-grid"><span>Unidade</span><span>Situação</span><span>Proprietário</span><span>Inquilino</span><span>{currentReference ? formatReferenceLong(currentReference) : 'Pagamento'}</span><span /></div>
            {filtered.map((unit) => {
              const { entry, pending, contact, pay, sit } = unitInfo(unit)
              return (
                <div
                  key={unit.id}
                  className="list-row list-row-click unit-list-grid"
                  role="button"
                  tabIndex={0}
                  aria-label={`Abrir unidade ${unit.numero}`}
                  onClick={() => openEdit(unit)}
                  onKeyDown={(event) => {
                    if (event.target !== event.currentTarget) return
                    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openEdit(unit) }
                  }}
                >
                  <span className={`unit-tag tone-${pay.tone}`}>{unit.numero}</span>
                  <span className="list-hide-m"><span className={`pill pill-sm tone-${sit.tone}`}>{sit.label}</span></span>
                  <span className="list-grow" style={{ minWidth: 0 }}>
                    <span className="list-ellipsis">{entry.owner?.nome || '-'}{entry.owner?.unitsCount > 1 && <span className="list-sub" style={{ display: 'inline' }}> · {entry.owner.unitsCount} unidades</span>}</span>
                    <span className="list-sub">{unit.responsavel_financeiro !== 'inquilino' ? 'Resp. financeiro' : 'Proprietário'}<span className="list-only-m"> · {sit.label} · {pay.label}</span></span>
                  </span>
                  <span className="list-hide-m" style={{ minWidth: 0 }}>
                    <span className="list-ellipsis" style={{ color: 'var(--text-muted)' }}>{unit.situacao === 'alugada' || entry.tenant ? entry.tenant?.nome || '-' : '—'}</span>
                    {unit.responsavel_financeiro === 'inquilino' && <span className="list-sub">Resp. financeiro</span>}
                  </span>
                  <span className="list-hide-m"><span className={`pill pill-sm tone-${pay.tone}`}>{pay.label}</span></span>
                  <span className="list-actions" onClick={(event) => event.stopPropagation()}>
                    {contact?.whatsapp && (
                      <button type="button" className="mini-btn mini-btn-icon" onClick={() => openWhatsApp(contact.whatsapp, `Ola ${contact.nome}, aqui e a administracao do condominio (unidade ${unit.numero}).`)} aria-label={`WhatsApp da unidade ${unit.numero}`}>
                        <WhatsAppIcon size={15} />
                      </button>
                    )}
                    {pending > 0 && (
                      <button type="button" className="mini-btn" onClick={() => openNotifications(unit, entry)} aria-label={`${pending} pedidos da unidade ${unit.numero}`}>
                        <Bell size={14} color="var(--orange)" /> {pending}
                      </button>
                    )}
                    <ChevronRight size={16} color="var(--text-dim)" className="list-hide-m" />
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </div>

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

              {showTenantFields && (
                <>
                  <PersonFields
                    title={form.situacao === 'alugada' ? 'Inquilino (obrigatorio)' : 'Morador (nao e o proprietario)'}
                    value={form.inquilino}
                    onChange={(inquilino) => setForm({ ...form, inquilino })}
                    required={form.situacao === 'alugada'}
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
              {tenantBeingReplaced && <div style={{ color: 'var(--orange)' }}>Ao salvar, o morador atual perde o acesso porque a unidade deixa de ter alguem morando.</div>}
            </div>

            <div className="modal-footer">
              {form.unitId && (
                <button
                  className="btn btn-ghost"
                  style={{ marginRight: 'auto', color: 'var(--red)' }}
                  onClick={() => { const unit = units.find((item) => item.id === form.unitId); if (unit) { setForm(null); void handleDelete(unit) } }}
                  disabled={saving || deletingId === form.unitId}
                >
                  {deletingId === form.unitId ? <Loader2 size={14} className="spin-icon" /> : <Trash2 size={14} />} Excluir unidade
                </button>
              )}
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
