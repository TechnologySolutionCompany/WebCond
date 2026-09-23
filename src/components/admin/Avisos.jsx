import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useToast } from '../shared/Toast'
import { isNoticeCurrent, noticeDaysLeft, NOTICE_RETENTION_DAYS } from '../../lib/avisos'
import { useAuth } from '../../hooks/useAuth'
import { applyTenantFilter, withTenantFields } from '../../lib/tenant'
import { Plus, Bell, X, Loader2, AlertTriangle, Info, Wrench, Megaphone, Trash2 } from 'lucide-react'
import { compareUnitNumbers } from '../../lib/units'
import { notifyAvisos } from '../../lib/adminApi'
import { describeNotifyResult } from '../../lib/notifications'

const TIPOS = [
  { value: 'informativo', label: 'Informativo', icon: Info, color: 'blue' },
  { value: 'aviso', label: 'Aviso', icon: Bell, color: 'yellow' },
  { value: 'urgente', label: 'Urgente', icon: AlertTriangle, color: 'red' },
  { value: 'manutencao', label: 'Manutenção', icon: Wrench, color: 'orange' },
]

const emptyForm = { titulo: '', conteudo: '', tipo: 'informativo', destinatario: 'todos', apartamento_destino: '' }

export default function Avisos() {
  const [avisos, setAvisos] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [unitNumbers, setUnitNumbers] = useState([])
  const { profile, condominiumId } = useAuth()
  const { toast } = useToast()

  const fetchAvisos = useCallback(async () => {
    setLoading(true)
    const query = supabase.from('avisos').select('*').order('created_at', { ascending: false })
    const { data } = await applyTenantFilter(query, condominiumId)
    // Avisos antigos "excluidos" so eram escondidos (ativo = false); a partir da v1.09A3 a exclusao apaga.
    setAvisos((data || []).filter((aviso) => aviso.ativo !== false && isNoticeCurrent(aviso)))
    setLoading(false)
  }, [condominiumId])

  useEffect(() => { void fetchAvisos() }, [fetchAvisos])

  // Unidades reais do condominio para o aviso direcionado.
  useEffect(() => {
    if (!condominiumId) return
    void (async () => {
      const { data } = await supabase.from('unidades').select('numero').eq('condominium_id', condominiumId)
      setUnitNumbers((data || []).map((unit) => unit.numero).sort(compareUnitNumbers))
    })()
  }, [condominiumId])

  const handleSave = async () => {
    if (!form.titulo || !form.conteudo) {
      toast('Preencha título e conteúdo.', 'error')
      return
    }

    setSaving(true)
    const { data: created, error } = await supabase
      .from('avisos')
      .insert(withTenantFields({ ...form, created_by: profile.id }, condominiumId))
      .select('id')
    setSaving(false)

    if (error) {
      toast('Erro ao publicar aviso.', 'error')
      return
    }

    toast('Aviso publicado!', 'success')
    setShowModal(false)
    setForm(emptyForm)
    void fetchAvisos()

    // Celular, e-mail e WhatsApp dos moradores: o aviso ja esta publicado, o envio vem depois.
    try {
      const result = await notifyAvisos((created || []).map((row) => row.id))
      const summary = describeNotifyResult(result)
      if (summary) toast(summary, 'info')
    } catch {
      toast('Aviso publicado, mas o envio das notificacoes falhou. Os moradores veem o aviso ao abrir o app.', 'info')
    }
  }

  const handleDelete = async (aviso) => {
    if (!confirm(`Excluir o aviso "${aviso.titulo}"? Ele some para todos os moradores e nao pode ser recuperado.`)) return
    // O select confirma que a linha saiu: bloqueada pelo RLS (plano vencido), a exclusao volta vazia sem erro.
    const { data: removed, error } = await supabase.from('avisos').delete().eq('id', aviso.id).select('id')
    if (error || !removed?.length) {
      toast('Nao foi possivel excluir o aviso.', 'error')
      return
    }
    setAvisos((current) => current.filter((item) => item.id !== aviso.id))
    toast('Aviso excluido.', 'success')
  }

  const getTipo = (tipo) => TIPOS.find((item) => item.value === tipo) || TIPOS[0]

  return (
    <div className="fade-in">
      <div className="page-header">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <div className="page-title">Avisos e comunicados</div>
            <div className="page-subtitle">Publique comunicados para os moradores. Cada aviso e apagado automaticamente {NOTICE_RETENTION_DAYS} dias apos o envio.</div>
          </div>
          <button className="btn btn-primary" onClick={() => setShowModal(true)}>
            <Plus size={15} /> Novo aviso
          </button>
        </div>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><div className="spinner" /></div>
      ) : avisos.length === 0 ? (
        <div className="empty-state"><Megaphone size={40} /><p>Nenhum aviso publicado ainda.</p></div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {avisos.map((aviso) => {
            const tipo = getTipo(aviso.tipo)
            const Icon = tipo.icon
            return (
              <div key={aviso.id} className="card" style={{ borderLeft: `3px solid var(--${tipo.color === 'blue' ? 'blue' : tipo.color === 'red' ? 'red' : tipo.color === 'orange' ? 'orange' : 'yellow'})` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', flex: 1 }}>
                    <div style={{ padding: 8, borderRadius: 8, background: `var(--${tipo.color}-dim, #1a2a3a)`, flexShrink: 0 }}>
                      <Icon size={16} color={`var(--${tipo.color})`} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4, flexWrap: 'wrap' }}>
                        <span style={{ fontWeight: 600, fontSize: 15 }}>{aviso.titulo}</span>
                        <span className={`badge badge-${tipo.color}`}>{tipo.label}</span>
                        {aviso.destinatario !== 'todos' && (
                          <span className="badge badge-purple">
                            {aviso.destinatario === 'apartamento' ? `Unidade ${aviso.apartamento_destino}` : 'Individual'}
                          </span>
                        )}
                      </div>
                      <p style={{ color: 'var(--text-muted)', fontSize: 13, lineHeight: 1.6 }}>{aviso.conteudo}</p>
                      <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 8 }}>
                        {new Date(aviso.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        {' · '}apagado automaticamente em {noticeDaysLeft(aviso)} {noticeDaysLeft(aviso) === 1 ? 'dia' : 'dias'}
                      </div>
                    </div>
                  </div>
                  <button className="btn btn-ghost btn-sm btn-icon" onClick={() => handleDelete(aviso)} style={{ color: '#f85149', flexShrink: 0, marginLeft: 8 }} title="Excluir aviso" aria-label="Excluir aviso">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {showModal && (
        <div className="modal-overlay" onClick={(event) => event.target === event.currentTarget && setShowModal(false)}>
          <div className="modal" style={{ maxWidth: 560 }}>
            <div className="modal-header">
              <div className="modal-title">Novo aviso</div>
              <button className="btn btn-ghost btn-icon" onClick={() => setShowModal(false)}><X size={16} /></button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="form-group">
                <label className="form-label">Título *</label>
                <input className="input" value={form.titulo} onChange={(event) => setForm((current) => ({ ...current, titulo: event.target.value }))} placeholder="Título do aviso" />
              </div>
              <div className="grid-2">
                <div className="form-group">
                  <label className="form-label">Tipo</label>
                  <select className="input" value={form.tipo} onChange={(event) => setForm((current) => ({ ...current, tipo: event.target.value }))}>
                    {TIPOS.map((tipo) => <option key={tipo.value} value={tipo.value}>{tipo.label}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Destinatário</label>
                  <select className="input" value={form.destinatario} onChange={(event) => setForm((current) => ({ ...current, destinatario: event.target.value, apartamento_destino: '' }))}>
                    <option value="todos">Todos os moradores</option>
                    <option value="apartamento">Apartamento específico</option>
                  </select>
                </div>
              </div>
              {form.destinatario === 'apartamento' && (
                <div className="form-group">
                  <label className="form-label">Apartamento</label>
                  <select className="input" value={form.apartamento_destino} onChange={(event) => setForm((current) => ({ ...current, apartamento_destino: event.target.value }))}>
                    <option value="">Selecione a unidade</option>
                    {unitNumbers.map((numero) => (
                      <option key={numero} value={numero}>Unidade {numero}</option>
                    ))}
                  </select>
                </div>
              )}
              <div className="form-group">
                <label className="form-label">Conteúdo *</label>
                <textarea className="input" rows={4} value={form.conteudo} onChange={(event) => setForm((current) => ({ ...current, conteudo: event.target.value }))} placeholder="Digite o comunicado..." />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setShowModal(false)}>Cancelar</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? <><Loader2 size={14} style={{ animation: 'spin .6s linear infinite' }} /> Publicando...</> : 'Publicar aviso'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
