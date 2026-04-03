import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useToast } from '../shared/Toast'
import { UserPlus, Search, Edit2, Trash2, X, Loader2, Phone, Home, User } from 'lucide-react'

const APTOS = Array.from({ length: 16 }, (_, i) => {
  const floor = Math.floor(i / 4) + 1
  const unit = (i % 4) + 1
  return `${floor}0${unit}`
})

const emptyForm = {
  nome: '', email: '', telefone: '', apartamento: '', cpf: '',
  whatsapp: '', data_entrada: '', observacao: ''
}

export default function Moradores() {
  const [moradores, setMoradores] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const { toast } = useToast()

  useEffect(() => { fetchMoradores() }, [])

  const fetchMoradores = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('role', 'morador')
      .order('apartamento')
    if (!error) setMoradores(data || [])
    setLoading(false)
  }

  const openCreate = () => {
    setEditing(null)
    setForm(emptyForm)
    setShowModal(true)
  }

  const openEdit = (m) => {
    setEditing(m)
    setForm({
      nome: m.nome || '', email: m.email || '', telefone: m.telefone || '',
      apartamento: m.apartamento || '', cpf: m.cpf || '',
      whatsapp: m.whatsapp || '', data_entrada: m.data_entrada || '', observacao: m.observacao || ''
    })
    setShowModal(true)
  }

  const handleSave = async () => {
    if (!form.nome || !form.email || !form.apartamento) {
      toast('Preencha nome, e-mail e apartamento.', 'error'); return
    }
    setSaving(true)
    try {
      if (editing) {
        // Atualizar perfil existente
        const { error } = await supabase
          .from('profiles')
          .update({ ...form, updated_at: new Date().toISOString() })
          .eq('id', editing.id)
        if (error) throw error
        toast('Morador atualizado com sucesso!', 'success')
      } else {
        // Criar usuário no Auth + perfil
        // Gera senha temporária
        const tempPassword = Math.random().toString(36).slice(-8) + 'A1!'
        const { data: authData, error: authError } = await supabase.auth.admin.createUser({
          email: form.email,
          password: tempPassword,
          email_confirm: true,
          user_metadata: { role: 'morador', nome: form.nome }
        })
        if (authError) {
          // Fallback: tentar signup normal (sem admin)
          const { data: signupData, error: signupError } = await supabase.auth.signUp({
            email: form.email,
            password: tempPassword,
            options: { data: { role: 'morador', nome: form.nome } }
          })
          if (signupError) throw signupError

          // Criar perfil manualmente se trigger não existir
          await supabase.from('profiles').upsert({
            id: signupData.user.id,
            role: 'morador',
            ...form
          })
          toast(`Morador criado! Senha temporária: ${tempPassword}`, 'success', 8000)
        } else {
          await supabase.from('profiles').upsert({
            id: authData.user.id,
            role: 'morador',
            ...form
          })
          toast(`Morador criado! Senha temporária: ${tempPassword}`, 'success', 8000)
        }
      }
      setShowModal(false)
      fetchMoradores()
    } catch (e) {
      toast(e.message || 'Erro ao salvar.', 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleToggleAtivo = async (m) => {
    const { error } = await supabase
      .from('profiles')
      .update({ ativo: !m.ativo })
      .eq('id', m.id)
    if (error) { toast('Erro ao atualizar.', 'error'); return }
    toast(m.ativo ? 'Morador desativado.' : 'Morador reativado.', 'success')
    fetchMoradores()
  }

  const filtered = moradores.filter(m =>
    m.nome?.toLowerCase().includes(search.toLowerCase()) ||
    m.apartamento?.includes(search) ||
    m.email?.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="fade-in">
      <div className="page-header">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div className="page-title">Moradores</div>
            <div className="page-subtitle">{moradores.length} morador(es) cadastrado(s)</div>
          </div>
          <button className="btn btn-primary" onClick={openCreate}>
            <UserPlus size={15} /> Cadastrar Morador
          </button>
        </div>
      </div>

      {/* Search */}
      <div style={{ position: 'relative', marginBottom: 20, maxWidth: 360 }}>
        <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#8b949e' }} />
        <input
          className="input"
          style={{ paddingLeft: 34 }}
          placeholder="Buscar por nome, apto ou e-mail..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><div className="spinner" /></div>
      ) : filtered.length === 0 ? (
        <div className="empty-state">
          <User size={40} />
          <p>Nenhum morador encontrado.</p>
        </div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Morador</th>
                <th>Apartamento</th>
                <th>Telefone</th>
                <th>Status</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(m => (
                <tr key={m.id}>
                  <td>
                    <div style={{ fontWeight: 600 }}>{m.nome}</div>
                    <div style={{ fontSize: 12, color: '#8b949e' }}>{m.email}</div>
                  </td>
                  <td>
                    <span className="badge badge-blue">
                      <Home size={10} /> Apt. {m.apartamento || '—'}
                    </span>
                  </td>
                  <td style={{ color: '#8b949e' }}>{m.telefone || '—'}</td>
                  <td>
                    <span className={`badge ${m.ativo ? 'badge-green' : 'badge-red'}`}>
                      {m.ativo ? 'Ativo' : 'Inativo'}
                    </span>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button className="btn btn-ghost btn-sm btn-icon" onClick={() => openEdit(m)} title="Editar">
                        <Edit2 size={13} />
                      </button>
                      <button
                        className={`btn btn-sm ${m.ativo ? 'btn-danger' : 'btn-ghost'}`}
                        onClick={() => handleToggleAtivo(m)}
                        title={m.ativo ? 'Desativar' : 'Reativar'}
                      >
                        {m.ativo ? 'Desativar' : 'Reativar'}
                      </button>
                    </div>
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
              <div className="modal-title">{editing ? 'Editar Morador' : 'Cadastrar Morador'}</div>
              <button className="btn btn-ghost btn-icon" onClick={() => setShowModal(false)}><X size={16} /></button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <div className="form-group" style={{ gridColumn: '1/-1' }}>
                <label className="form-label">Nome Completo *</label>
                <input className="input" value={form.nome} onChange={e => setForm(f => ({...f, nome: e.target.value}))} placeholder="João da Silva" />
              </div>
              <div className="form-group">
                <label className="form-label">E-mail *</label>
                <input className="input" type="email" value={form.email} onChange={e => setForm(f => ({...f, email: e.target.value}))} placeholder="joao@email.com" disabled={!!editing} />
              </div>
              <div className="form-group">
                <label className="form-label">Apartamento *</label>
                <select className="input" value={form.apartamento} onChange={e => setForm(f => ({...f, apartamento: e.target.value}))}>
                  <option value="">Selecione</option>
                  {APTOS.map(a => <option key={a} value={a}>Apt. {a}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Telefone</label>
                <input className="input" value={form.telefone} onChange={e => setForm(f => ({...f, telefone: e.target.value}))} placeholder="(81) 90000-0000" />
              </div>
              <div className="form-group">
                <label className="form-label">WhatsApp</label>
                <input className="input" value={form.whatsapp} onChange={e => setForm(f => ({...f, whatsapp: e.target.value}))} placeholder="(81) 90000-0000" />
              </div>
              <div className="form-group">
                <label className="form-label">CPF</label>
                <input className="input" value={form.cpf} onChange={e => setForm(f => ({...f, cpf: e.target.value}))} placeholder="000.000.000-00" />
              </div>
              <div className="form-group">
                <label className="form-label">Data de Entrada</label>
                <input className="input" type="date" value={form.data_entrada} onChange={e => setForm(f => ({...f, data_entrada: e.target.value}))} />
              </div>
            </div>

            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setShowModal(false)}>Cancelar</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? <><Loader2 size={14} style={{animation:'spin .6s linear infinite'}}/> Salvando...</> : editing ? 'Salvar Alterações' : 'Cadastrar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
