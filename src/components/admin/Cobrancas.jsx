import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useToast } from '../shared/Toast'
import { useAuth } from '../../hooks/useAuth'
import { Plus, Search, CheckCircle, X, Loader2, DollarSign, Filter } from 'lucide-react'

const TIPOS = [
  { value: 'condominio', label: 'Condomínio', color: 'blue' },
  { value: 'agua', label: 'Água', color: 'blue' },
  { value: 'energia', label: 'Energia', color: 'orange' },
  { value: 'multa', label: 'Multa', color: 'red' },
  { value: 'outro', label: 'Outro', color: 'purple' },
]

const emptyForm = {
  morador_id: '', descricao: '', valor: '', tipo: 'condominio',
  mes_referencia: new Date().toISOString().slice(0, 7),
  vencimento: '', observacao: ''
}

export default function Cobrancas() {
  const [cobrancas, setCobrancas] = useState([])
  const [moradores, setMoradores] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterTipo, setFilterTipo] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const { profile } = useAuth()
  const { toast } = useToast()

  useEffect(() => {
    fetchAll()
  }, [])

  const fetchAll = async () => {
    setLoading(true)
    const [cobRes, morRes] = await Promise.all([
      supabase.from('cobrancas').select(`*, profiles:morador_id(nome, apartamento)`).order('created_at', { ascending: false }),
      supabase.from('profiles').select('id, nome, apartamento').eq('role', 'morador').eq('ativo', true).order('apartamento')
    ])
    setCobrancas(cobRes.data || [])
    setMoradores(morRes.data || [])
    setLoading(false)
  }

  const handleSave = async () => {
    if (!form.morador_id || !form.valor || !form.vencimento) {
      toast('Preencha morador, valor e vencimento.', 'error'); return
    }
    setSaving(true)
    const { error } = await supabase.from('cobrancas').insert({
      ...form,
      valor: parseFloat(form.valor.replace(',', '.')),
      created_by: profile.id,
    })
    setSaving(false)
    if (error) { toast('Erro ao lançar cobrança.', 'error'); return }
    toast('Cobrança lançada com sucesso!', 'success')
    setShowModal(false)
    setForm(emptyForm)
    fetchAll()
  }

  const marcarPago = async (id) => {
    const { error } = await supabase
      .from('cobrancas')
      .update({ pago: true, data_pagamento: new Date().toISOString().slice(0, 10) })
      .eq('id', id)
    if (error) { toast('Erro ao atualizar.', 'error'); return }
    toast('Pagamento confirmado!', 'success')
    fetchAll()
  }

  const badgeColor = (tipo) => TIPOS.find(t => t.value === tipo)?.color || 'blue'

  const filtered = cobrancas.filter(c => {
    const nome = c.profiles?.nome?.toLowerCase() || ''
    const apto = c.profiles?.apartamento || ''
    const matchSearch = nome.includes(search.toLowerCase()) || apto.includes(search)
    const matchTipo = !filterTipo || c.tipo === filterTipo
    const matchStatus = !filterStatus || (filterStatus === 'pago' ? c.pago : !c.pago)
    return matchSearch && matchTipo && matchStatus
  })

  const totalPendente = filtered.filter(c => !c.pago).reduce((s, c) => s + Number(c.valor), 0)
  const totalPago = filtered.filter(c => c.pago).reduce((s, c) => s + Number(c.valor), 0)

  return (
    <div className="fade-in">
      <div className="page-header">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div className="page-title">Cobranças</div>
            <div className="page-subtitle">Lance e gerencie cobranças dos moradores</div>
          </div>
          <button className="btn btn-primary" onClick={() => setShowModal(true)}>
            <Plus size={15} /> Nova Cobrança
          </button>
        </div>
      </div>

      {/* Resumo */}
      <div className="stats-grid" style={{ marginBottom: 20 }}>
        <div className="stat-card">
          <div className="label">Pendente</div>
          <div className="value" style={{ color: '#f0883e', fontSize: 20 }}>R$ {totalPendente.toFixed(2).replace('.', ',')}</div>
        </div>
        <div className="stat-card">
          <div className="label">Recebido</div>
          <div className="value" style={{ color: '#3fb950', fontSize: 20 }}>R$ {totalPago.toFixed(2).replace('.', ',')}</div>
        </div>
        <div className="stat-card">
          <div className="label">Total de Lançamentos</div>
          <div className="value" style={{ color: '#58a6ff', fontSize: 20 }}>{filtered.length}</div>
        </div>
      </div>

      {/* Filtros */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
          <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#8b949e' }} />
          <input className="input" style={{ paddingLeft: 34 }} placeholder="Buscar morador ou apto..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select className="input" style={{ width: 160 }} value={filterTipo} onChange={e => setFilterTipo(e.target.value)}>
          <option value="">Todos os tipos</option>
          {TIPOS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
        <select className="input" style={{ width: 140 }} value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          <option value="">Todos</option>
          <option value="pendente">Pendentes</option>
          <option value="pago">Pagos</option>
        </select>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><div className="spinner" /></div>
      ) : filtered.length === 0 ? (
        <div className="empty-state"><DollarSign size={40} /><p>Nenhuma cobrança encontrada.</p></div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Morador / Apto</th>
                <th>Descrição</th>
                <th>Tipo</th>
                <th>Referência</th>
                <th>Vencimento</th>
                <th>Valor</th>
                <th>Status</th>
                <th>Ação</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(c => (
                <tr key={c.id}>
                  <td>
                    <div style={{ fontWeight: 600 }}>{c.profiles?.nome || '—'}</div>
                    <div style={{ fontSize: 12, color: '#8b949e' }}>Apt. {c.profiles?.apartamento || '—'}</div>
                  </td>
                  <td>{c.descricao || '—'}</td>
                  <td><span className={`badge badge-${badgeColor(c.tipo)}`}>{TIPOS.find(t=>t.value===c.tipo)?.label || c.tipo}</span></td>
                  <td className="mono" style={{ color: '#8b949e' }}>{c.mes_referencia}</td>
                  <td style={{ color: '#8b949e' }}>{c.vencimento ? new Date(c.vencimento + 'T12:00:00').toLocaleDateString('pt-BR') : '—'}</td>
                  <td className="mono" style={{ fontWeight: 600 }}>R$ {Number(c.valor).toFixed(2).replace('.', ',')}</td>
                  <td><span className={`badge ${c.pago ? 'badge-green' : 'badge-orange'}`}>{c.pago ? 'Pago' : 'Pendente'}</span></td>
                  <td>
                    {!c.pago && (
                      <button className="btn btn-ghost btn-sm" onClick={() => marcarPago(c.id)} title="Marcar como pago">
                        <CheckCircle size={13} /> Pago
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowModal(false)}>
          <div className="modal">
            <div className="modal-header">
              <div className="modal-title">Nova Cobrança</div>
              <button className="btn btn-ghost btn-icon" onClick={() => setShowModal(false)}><X size={16} /></button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <div className="form-group" style={{ gridColumn: '1/-1' }}>
                <label className="form-label">Morador *</label>
                <select className="input" value={form.morador_id} onChange={e => setForm(f => ({...f, morador_id: e.target.value}))}>
                  <option value="">Selecione o morador</option>
                  {moradores.map(m => <option key={m.id} value={m.id}>Apt. {m.apartamento} – {m.nome}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Tipo *</label>
                <select className="input" value={form.tipo} onChange={e => setForm(f => ({...f, tipo: e.target.value}))}>
                  {TIPOS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Valor (R$) *</label>
                <input className="input" value={form.valor} onChange={e => setForm(f => ({...f, valor: e.target.value}))} placeholder="0,00" />
              </div>
              <div className="form-group" style={{ gridColumn: '1/-1' }}>
                <label className="form-label">Descrição</label>
                <input className="input" value={form.descricao} onChange={e => setForm(f => ({...f, descricao: e.target.value}))} placeholder="Ex: Taxa de condomínio março/2025" />
              </div>
              <div className="form-group">
                <label className="form-label">Mês de Referência *</label>
                <input className="input" type="month" value={form.mes_referencia} onChange={e => setForm(f => ({...f, mes_referencia: e.target.value}))} />
              </div>
              <div className="form-group">
                <label className="form-label">Vencimento *</label>
                <input className="input" type="date" value={form.vencimento} onChange={e => setForm(f => ({...f, vencimento: e.target.value}))} />
              </div>
              <div className="form-group" style={{ gridColumn: '1/-1' }}>
                <label className="form-label">Observação</label>
                <textarea className="input" rows={2} value={form.observacao} onChange={e => setForm(f => ({...f, observacao: e.target.value}))} placeholder="Observações adicionais..." />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setShowModal(false)}>Cancelar</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? <><Loader2 size={14} style={{animation:'spin .6s linear infinite'}}/> Salvando...</> : 'Lançar Cobrança'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
