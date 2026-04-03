import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useToast } from '../shared/Toast'
import { useAuth } from '../../hooks/useAuth'
import { Plus, Bell, X, Loader2, AlertTriangle, Info, Wrench, Megaphone, Trash2 } from 'lucide-react'

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
  const { profile } = useAuth()
  const { toast } = useToast()

  useEffect(() => { fetchAvisos() }, [])

  const fetchAvisos = async () => {
    setLoading(true)
    const { data } = await supabase.from('avisos').select('*').order('created_at', { ascending: false })
    setAvisos(data || [])
    setLoading(false)
  }

  const handleSave = async () => {
    if (!form.titulo || !form.conteudo) { toast('Preencha título e conteúdo.', 'error'); return }
    setSaving(true)
    const { error } = await supabase.from('avisos').insert({ ...form, created_by: profile.id })
    setSaving(false)
    if (error) { toast('Erro ao publicar aviso.', 'error'); return }
    toast('Aviso publicado!', 'success')
    setShowModal(false)
    setForm(emptyForm)
    fetchAvisos()
  }

  const handleDelete = async (id) => {
    if (!confirm('Deseja excluir este aviso?')) return
    await supabase.from('avisos').update({ ativo: false }).eq('id', id)
    toast('Aviso removido.', 'info')
    fetchAvisos()
  }

  const getTipo = (tipo) => TIPOS.find(t => t.value === tipo) || TIPOS[0]

  return (
    <div className="fade-in">
      <div className="page-header">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div className="page-title">Avisos & Comunicados</div>
            <div className="page-subtitle">Publique comunicados para os moradores</div>
          </div>
          <button className="btn btn-primary" onClick={() => setShowModal(true)}>
            <Plus size={15} /> Novo Aviso
          </button>
        </div>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><div className="spinner" /></div>
      ) : avisos.length === 0 ? (
        <div className="empty-state"><Megaphone size={40} /><p>Nenhum aviso publicado ainda.</p></div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {avisos.map(a => {
            const tipo = getTipo(a.tipo)
            const Icon = tipo.icon
            return (
              <div key={a.id} className="card" style={{ borderLeft: `3px solid var(--${tipo.color === 'blue' ? 'blue' : tipo.color === 'red' ? 'red' : tipo.color === 'orange' ? 'orange' : 'yellow'})` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', flex: 1 }}>
                    <div style={{ padding: 8, borderRadius: 8, background: `var(--${tipo.color}-dim, #1a2a3a)`, flexShrink: 0 }}>
                      <Icon size={16} color={`var(--${tipo.color})`} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 }}>
                        <span style={{ fontWeight: 600, fontSize: 15 }}>{a.titulo}</span>
                        <span className={`badge badge-${tipo.color}`}>{tipo.label}</span>
                        {a.destinatario !== 'todos' && (
                          <span className="badge badge-purple">
                            {a.destinatario === 'apartamento' ? `Apt. ${a.apartamento_destino}` : 'Individual'}
                          </span>
                        )}
                        {!a.ativo && <span className="badge badge-red">Inativo</span>}
                      </div>
                      <p style={{ color: '#8b949e', fontSize: 13, lineHeight: 1.6 }}>{a.conteudo}</p>
                      <div style={{ fontSize: 11, color: '#484f58', marginTop: 8 }}>
                        {new Date(a.created_at).toLocaleDateString('pt-BR', { day:'2-digit', month:'long', year:'numeric', hour:'2-digit', minute:'2-digit' })}
                      </div>
                    </div>
                  </div>
                  <button className="btn btn-ghost btn-sm btn-icon" onClick={() => handleDelete(a.id)} style={{ color: '#f85149', flexShrink: 0, marginLeft: 8 }}>
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {showModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowModal(false)}>
          <div className="modal" style={{ maxWidth: 560 }}>
            <div className="modal-header">
              <div className="modal-title">Novo Aviso</div>
              <button className="btn btn-ghost btn-icon" onClick={() => setShowModal(false)}><X size={16} /></button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="form-group">
                <label className="form-label">Título *</label>
                <input className="input" value={form.titulo} onChange={e => setForm(f => ({...f, titulo: e.target.value}))} placeholder="Título do aviso" />
              </div>
              <div className="grid-2">
                <div className="form-group">
                  <label className="form-label">Tipo</label>
                  <select className="input" value={form.tipo} onChange={e => setForm(f => ({...f, tipo: e.target.value}))}>
                    {TIPOS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Destinatário</label>
                  <select className="input" value={form.destinatario} onChange={e => setForm(f => ({...f, destinatario: e.target.value}))}>
                    <option value="todos">Todos os moradores</option>
                    <option value="apartamento">Apartamento específico</option>
                  </select>
                </div>
              </div>
              {form.destinatario === 'apartamento' && (
                <div className="form-group">
                  <label className="form-label">Apartamento</label>
                  <input className="input" value={form.apartamento_destino} onChange={e => setForm(f => ({...f, apartamento_destino: e.target.value}))} placeholder="Ex: 101" />
                </div>
              )}
              <div className="form-group">
                <label className="form-label">Conteúdo *</label>
                <textarea className="input" rows={4} value={form.conteudo} onChange={e => setForm(f => ({...f, conteudo: e.target.value}))} placeholder="Digite o comunicado..." />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setShowModal(false)}>Cancelar</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? <><Loader2 size={14} style={{animation:'spin .6s linear infinite'}}/> Publicando...</> : 'Publicar Aviso'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
