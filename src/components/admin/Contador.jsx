import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useToast } from '../shared/Toast'
import { useAuth } from '../../hooks/useAuth'
import { applyTenantFilter } from '../../lib/tenant'
import { Download, FileText, Home, DollarSign, AlertCircle, Calculator, Loader2, Trash2, UserPlus } from 'lucide-react'
import Papa from 'papaparse'
import { buildChargeStatusChartData, getChargePaymentStatus, getChargePaymentStatusMeta } from '../../lib/chargeStatus'
import { formatReferenceLabel } from '../../lib/billingShared'
import { compareUnitNumbers, getUnitStatusMeta } from '../../lib/units'
import { formatCpf, normalizeCpf } from '../../lib/cpf'
import SensitiveValue from '../shared/SensitiveValue'
import { createResident, deleteResident } from '../../lib/adminApi'
import { normalizeRole } from '../../lib/auth'
import ChargeTrendLine from '../shared/ChargeTrendLine'

const emptyAccountant = { nome: '', cpf: '', whatsapp: '', email: '', password: '' }

// CSV no padrao do Excel em portugues: separador ";" e BOM para manter os acentos.
function toCsv(rows) {
  return String.fromCharCode(0xfeff) + Papa.unparse(rows, { delimiter: ';' })
}

function formatMoney(value) {
  return Number(value || 0).toFixed(2).replace('.', ',')
}

function chargeUnit(charge) {
  return charge.unidade_numero || charge.profiles?.apartamento || ''
}

export default function Contador() {
  const [loading, setLoading] = useState(false)
  const [reference, setReference] = useState('')
  const [charges, setCharges] = useState([])
  const [accountants, setAccountants] = useState([])
  const [accountantForm, setAccountantForm] = useState(null)
  const [savingAccountant, setSavingAccountant] = useState(false)
  const { condominiumId, resolvedRole } = useAuth()
  const { toast } = useToast()
  const isSyndic = normalizeRole(resolvedRole) === 'admin'

  const fetchData = useCallback(async () => {
    const [chargesRes, accountantsRes] = await Promise.all([
      applyTenantFilter(
        supabase
          .from('cobrancas')
          .select('id, valor, pago, payment_status, vencimento, mes_referencia, data_pagamento, created_at')
          .order('created_at', { ascending: false }),
        condominiumId,
      ),
      applyTenantFilter(supabase.from('profiles').select('id, nome, cpf, whatsapp, email, ativo').eq('role', 'contador'), condominiumId),
    ])

    setCharges(chargesRes.data || [])
    setAccountants(accountantsRes.data || [])
  }, [condominiumId])

  useEffect(() => {
    void fetchData()
  }, [fetchData])

  const chartData = useMemo(() => buildChargeStatusChartData(charges, 6), [charges])

  const downloadCSV = (rows, filename) => {
    if (!rows.length) {
      toast('Nao ha dados para exportar.', 'info')
      return
    }
    const url = URL.createObjectURL(new Blob([toCsv(rows)], { type: 'text/csv;charset=utf-8' }))
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = filename
    anchor.click()
    URL.revokeObjectURL(url)
    toast('Arquivo baixado!', 'success')
  }

  const runExport = async (task) => {
    setLoading(true)
    try {
      await task()
    } catch (error) {
      toast(error.message || 'Nao foi possivel gerar o arquivo.', 'error')
    } finally {
      setLoading(false)
    }
  }

  const exportUnidades = () => runExport(async () => {
    const [unitsRes, linksRes] = await Promise.all([
      supabase.from('unidades').select('id, numero, situacao, responsavel_financeiro, observacao').eq('condominium_id', condominiumId),
      supabase.from('unidade_vinculos').select('unidade_id, vinculo, profiles(nome, cpf, whatsapp, email, ativo)'),
    ])
    if (unitsRes.error) throw new Error('Nao foi possivel carregar as unidades.')

    const people = new Map()
    for (const link of linksRes.data || []) {
      if (!link.profiles || link.profiles.ativo === false) continue
      if (!people.has(link.unidade_id)) people.set(link.unidade_id, {})
      people.get(link.unidade_id)[link.vinculo] = link.profiles
    }

    const rows = (unitsRes.data || [])
      .sort((a, b) => compareUnitNumbers(a.numero, b.numero))
      .map((unit) => {
        const entry = people.get(unit.id) || {}
        return {
          Unidade: unit.numero,
          Situacao: getUnitStatusMeta(unit.situacao).label,
          Proprietario: entry.proprietario?.nome || '',
          'CPF proprietario': entry.proprietario?.cpf ? formatCpf(entry.proprietario.cpf) : '',
          'WhatsApp proprietario': entry.proprietario?.whatsapp || '',
          Inquilino: entry.inquilino?.nome || '',
          'CPF inquilino': entry.inquilino?.cpf ? formatCpf(entry.inquilino.cpf) : '',
          'WhatsApp inquilino': entry.inquilino?.whatsapp || '',
          'Responsavel financeiro': unit.responsavel_financeiro === 'inquilino' ? 'Inquilino' : 'Proprietario',
          Observacao: unit.observacao || '',
        }
      })

    downloadCSV(rows, 'unidades.csv')
  })

  const exportCobrancas = () => runExport(async () => {
    let query = supabase.from('cobrancas').select('*, profiles:morador_id(nome, apartamento)')
    if (reference) query = query.eq('mes_referencia', reference)
    const { data, error } = await applyTenantFilter(query, condominiumId)
    if (error) throw new Error('Nao foi possivel carregar as cobrancas.')

    const rows = (data || [])
      .sort((a, b) => (a.mes_referencia || '').localeCompare(b.mes_referencia || '') || compareUnitNumbers(chargeUnit(a), chargeUnit(b)))
      .map((charge) => ({
        Competencia: formatReferenceLabel(charge.mes_referencia),
        Unidade: chargeUnit(charge),
        'Responsavel financeiro': charge.profiles?.nome || '',
        Descricao: charge.descricao,
        Tipo: charge.tipo,
        Valor: formatMoney(charge.valor),
        Vencimento: charge.vencimento,
        Status: getChargePaymentStatusMeta(charge).label,
        'Data do pagamento': charge.data_pagamento || '',
      }))

    downloadCSV(rows, reference ? `cobrancas-${reference}.csv` : 'cobrancas.csv')
  })

  const exportInadimplentes = () => runExport(async () => {
    const { data, error } = await applyTenantFilter(supabase.from('cobrancas').select('*, profiles:morador_id(nome, apartamento, whatsapp)'), condominiumId)
    if (error) throw new Error('Nao foi possivel carregar as cobrancas.')

    const today = new Date()
    const rows = (data || [])
      .filter((charge) => getChargePaymentStatus(charge) === 'OVERDUE')
      .sort((a, b) => compareUnitNumbers(chargeUnit(a), chargeUnit(b)))
      .map((charge) => ({
        Unidade: chargeUnit(charge),
        'Responsavel financeiro': charge.profiles?.nome || '',
        WhatsApp: charge.profiles?.whatsapp || '',
        Competencia: formatReferenceLabel(charge.mes_referencia),
        Descricao: charge.descricao,
        Valor: formatMoney(charge.valor),
        Vencimento: charge.vencimento,
        'Dias em atraso': Math.max(0, Math.floor((today - new Date(`${charge.vencimento}T12:00:00`)) / 86400000)),
      }))

    downloadCSV(rows, 'inadimplentes.csv')
  })

  // Status das cobrancas por competencia (mesma visao do grafico) em CSV.
  const exportStatusPorCompetencia = () => runExport(async () => {
    const groups = new Map()
    for (const charge of charges) {
      const key = charge.mes_referencia || ''
      if (!groups.has(key)) groups.set(key, { cobradas: 0, pagas: 0, abertas: 0, atrasadas: 0, total: 0, recebido: 0 })
      const group = groups.get(key)
      const status = getChargePaymentStatus(charge)
      group.cobradas += 1
      group.total += Number(charge.valor || 0)
      if (status === 'PAID') {
        group.pagas += 1
        group.recebido += Number(charge.valor || 0)
      } else if (status === 'OVERDUE') {
        group.atrasadas += 1
      } else if (status !== 'CANCELLED') {
        group.abertas += 1
      }
    }

    const rows = Array.from(groups.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([key, group]) => ({
        Competencia: key ? formatReferenceLabel(key) : 'Sem competencia',
        'Unidades cobradas': group.cobradas,
        Pagas: group.pagas,
        'Em aberto': group.abertas,
        Atrasadas: group.atrasadas,
        'Valor total': formatMoney(group.total),
        Recebido: formatMoney(group.recebido),
        'A receber': formatMoney(group.total - group.recebido),
      }))

    downloadCSV(rows, 'status-cobrancas-por-competencia.csv')
  })

  const handleSaveAccountant = async () => {
    const form = accountantForm
    if (!form.nome || normalizeCpf(form.cpf).length !== 11 || !form.whatsapp) {
      toast('Informe nome, CPF e WhatsApp do contador.', 'error')
      return
    }
    if (form.password.length < 6) {
      toast('Defina uma senha de acesso com pelo menos 6 caracteres.', 'error')
      return
    }

    setSavingAccountant(true)
    try {
      await createResident({ ...form, cpf: normalizeCpf(form.cpf), role: 'contador', apartamento: '' })
      toast('Acesso do contador criado. Ele entra com CPF + senha e ve apenas o Painel e os Relatorios.', 'success')
      setAccountantForm(null)
      await fetchData()
    } catch (error) {
      toast(error.message || 'Nao foi possivel criar o acesso do contador.', 'error')
    } finally {
      setSavingAccountant(false)
    }
  }

  const handleRemoveAccountant = async (accountant) => {
    if (!window.confirm(`Remover o acesso do contador ${accountant.nome}?`)) return
    try {
      await deleteResident({ userId: accountant.id })
      toast('Acesso do contador removido.', 'success')
      await fetchData()
    } catch (error) {
      toast(error.message || 'Nao foi possivel remover o contador.', 'error')
    }
  }

  const exportCards = [
    { icon: Home, color: '#58a6ff', title: 'Unidades', subtitle: 'Situacao, proprietario, inquilino e responsavel financeiro', action: exportUnidades },
    { icon: DollarSign, color: '#3fb950', title: 'Cobrancas', subtitle: 'Por unidade; filtre por competencia ou exporte todas', action: exportCobrancas, withReference: true },
    { icon: AlertCircle, color: '#f0883e', title: 'Inadimplentes', subtitle: 'Cobrancas vencidas e dias em atraso', action: exportInadimplentes },
  ]

  return (
    <div className="fade-in">
      <div className="page-header">
        <div className="page-title">Relatorios</div>
        <div className="page-subtitle">Exportacao das informacoes do condominio (CSV compativel com Excel)</div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 20 }}>
        {exportCards.map((card) => (
          <div key={card.title} className="card">
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
              <card.icon size={24} color={card.color} />
              <div>
                <div style={{ fontWeight: 600 }}>{card.title}</div>
                <div style={{ fontSize: 12, color: '#8b949e' }}>{card.subtitle}</div>
              </div>
            </div>
            {card.withReference && (
              <input className="input" type="month" style={{ marginBottom: 12 }} value={reference} onChange={(event) => setReference(event.target.value)} aria-label="Competencia" />
            )}
            <button className="btn btn-primary" onClick={card.action} disabled={loading}>
              <Download size={14} /> Exportar CSV
            </button>
          </div>
        ))}
      </div>

      <div className="card" style={{ marginTop: 24, maxWidth: 460 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <FileText size={20} color="#58a6ff" />
            <div>
              <div style={{ fontWeight: 600 }}>Status das cobrancas por competencia</div>
              <div style={{ fontSize: 12, color: '#8b949e' }}>Visao consolidada para acompanhamento financeiro</div>
            </div>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={exportStatusPorCompetencia} disabled={loading}>
            <Download size={13} /> Exportar CSV
          </button>
        </div>
        <ChargeTrendLine data={chartData} />
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8 }}>Ultimos 6 meses. O CSV traz todas as competencias.</div>
      </div>

      {isSyndic && (
        <div className="card" style={{ marginTop: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <Calculator size={20} color="#bc8cff" />
              <div>
                <div style={{ fontWeight: 600 }}>Acesso do contador</div>
                <div style={{ fontSize: 12, color: '#8b949e' }}>O contador ve somente o Painel e os Relatorios. Apenas o sindico cria ou remove este acesso.</div>
              </div>
            </div>
            {!accountantForm && (
              <button className="btn btn-ghost btn-sm" onClick={() => setAccountantForm(emptyAccountant)}>
                <UserPlus size={13} /> Adicionar contador
              </button>
            )}
          </div>

          {accountants.length === 0 && !accountantForm && (
            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Nenhum contador cadastrado.</div>
          )}

          {accountants.map((accountant) => (
            <div key={accountant.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: '10px 0', borderTop: '1px solid var(--border-subtle)' }}>
              <div>
                <div style={{ fontWeight: 600 }}>{accountant.nome}{accountant.ativo === false && <span className="badge badge-red" style={{ marginLeft: 8 }}>Inativo</span>}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  CPF <SensitiveValue value={accountant.cpf} type="cpf" /> · <SensitiveValue value={accountant.whatsapp} type="phone" />
                </div>
              </div>
              <button className="btn btn-ghost btn-sm" style={{ color: 'var(--red)' }} onClick={() => handleRemoveAccountant(accountant)} aria-label={`Remover ${accountant.nome}`}>
                <Trash2 size={13} />
              </button>
            </div>
          ))}

          {accountantForm && (
            <div className="condo-form-grid" style={{ marginTop: 12 }}>
              <div className="form-group" style={{ gridColumn: '1/-1' }}>
                <label className="form-label">Nome *</label>
                <input className="input" value={accountantForm.nome} onChange={(event) => setAccountantForm({ ...accountantForm, nome: event.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label">CPF *</label>
                <input className="input" inputMode="numeric" value={formatCpf(accountantForm.cpf)} onChange={(event) => setAccountantForm({ ...accountantForm, cpf: normalizeCpf(event.target.value) })} />
              </div>
              <div className="form-group">
                <label className="form-label">WhatsApp *</label>
                <input className="input" inputMode="tel" value={accountantForm.whatsapp} onChange={(event) => setAccountantForm({ ...accountantForm, whatsapp: event.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label">E-mail (opcional)</label>
                <input className="input" type="email" value={accountantForm.email} onChange={(event) => setAccountantForm({ ...accountantForm, email: event.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label">Senha de acesso *</label>
                <input className="input" type="password" autoComplete="new-password" value={accountantForm.password} onChange={(event) => setAccountantForm({ ...accountantForm, password: event.target.value })} placeholder="Minimo de 6 caracteres" />
              </div>
              <div style={{ gridColumn: '1/-1', display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button className="btn btn-ghost" onClick={() => setAccountantForm(null)} disabled={savingAccountant}>Cancelar</button>
                <button className="btn btn-primary" onClick={handleSaveAccountant} disabled={savingAccountant}>
                  {savingAccountant ? <><Loader2 size={14} className="spin-icon" /> Salvando...</> : 'Criar acesso'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
