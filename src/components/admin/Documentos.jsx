import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useToast } from '../shared/Toast'
import { useAuth } from '../../hooks/useAuth'
import { Plus, FileText, X, Loader2, Download, Trash2, Upload } from 'lucide-react'

const CATEGORIAS = [
  { value: 'ata', label: 'Ata de Reunião', color: 'blue' },
  { value: 'regimento', label: 'Regimento', color: 'purple' },
  { value: 'contrato', label: 'Contrato', color: 'orange' },
  { value: 'financeiro', label: 'Financeiro', color: 'green' },
  { value: 'outro', label: 'Outro', color: 'yellow' },
]

export default function Documentos() {
  const [docs, setDocs] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState({ titulo: '', descricao: '', categoria: 'ata', publico: true })
  const [file, setFile] = useState(null)
  const [saving, setSaving] = useState(false)
  const { profile } = useAuth()
  const { toast } = useToast()

  useEffect(() => { fetchDocs() }, [])

  const fetchDocs = async () => {
    setLoading(true)
    const { data } = await supabase.from('documentos').select('*').order('created_at', { ascending: false })
    setDocs(data || [])
    setLoading(false)
  }

  const handleSave = async () => {
    if (!form.titulo || !file) { toast('Preencha o título e selecione um arquivo.', 'error'); return }
    setSaving(true)
    try {
      // Upload arquivo para Supabase Storage
      const fileName = `${Date.now()}_${file.name}`
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('documentos')
        .upload(fileName, file)
      if (uploadError) throw uploadError

      const { data: urlData } = supabase.storage.from('documentos').getPublicUrl(fileName)

      const { error } = await supabase.from('documentos').insert({
        ...form,
        arquivo_url: urlData.publicUrl,
        created_by: profile.id,
      })
      if (error) throw error

      toast('Documento publicado!', 'success')
      setShowModal(false)
      setForm({ titulo: '', descricao: '', categoria: 'ata', publico: true })
      setFile(null)
      fetchDocs()
    } catch (e) {
      toast(e.message || 'Erro ao publicar documento.', 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (doc) => {
    if (!confirm('Deseja excluir este documento?')) return
    const fileName = doc.arquivo_url?.split('/').pop()
    if (fileName) await supabase.storage.from('documentos').remove([fileName])
    await supabase.from('documentos').delete().eq('id', doc.id)
    toast('Documento excluído.', 'info')
    fetchDocs()
  }

  const getCat = (cat) => CATEGORIAS.find(c => c.value === cat) || CATEGORIAS[4]

  return (
    <div className="fade-in">
      <div className="page-header">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div className="page-title">Documentos</div>
            <div className="page-subtitle">Atas, regimentos, contratos e arquivos importantes</div>
          </div>
          <button className="btn btn-primary" onClick={() => setShowModal(true)}>
            <Plus size={15} /> Adicionar Documento
          </button>
        </div>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><div className="spinner" /></div>
      ) : docs.length === 0 ? (
        <div className="empty-state"><FileText size={40} /><p>Nenhum documento publicado ainda.</p></div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
          {docs.map(d => {
            const cat = getCat(d.categoria)
            return (
              <div key={d.id} className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <span className={`badge badge-${cat.color}`}>{cat.label}</span>
                  <div style={{ display: 'flex', gap: 4 }}>
                    {!d.publico && <span className="badge badge-orange">Restrito</span>}
                    <button className="btn btn-ghost btn-sm btn-icon" onClick={() => handleDelete(d)} style={{ color: '#f85149' }}>
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>{d.titulo}</div>
                  {d.descricao && <div style={{ fontSize: 12, color: '#8b949e', lineHeight: 1.5 }}>{d.descricao}</div>}
                </div>
                <div style={{ fontSize: 11, color: '#484f58' }}>
                  {new Date(d.created_at).toLocaleDateString('pt-BR')}
                </div>
                <a href={d.arquivo_url} target="_blank" rel="noopener noreferrer" className="btn btn-ghost btn-sm" style={{ justifyContent: 'center' }}>
                  <Download size={13} /> Baixar
                </a>
              </div>
            )
          })}
        </div>
      )}

      {showModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowModal(false)}>
          <div className="modal">
            <div className="modal-header">
              <div className="modal-title">Adicionar Documento</div>
              <button className="btn btn-ghost btn-icon" onClick={() => setShowModal(false)}><X size={16} /></button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="form-group">
                <label className="form-label">Título *</label>
                <input className="input" value={form.titulo} onChange={e => setForm(f => ({...f, titulo: e.target.value}))} placeholder="Nome do documento" />
              </div>
              <div className="grid-2">
                <div className="form-group">
                  <label className="form-label">Categoria</label>
                  <select className="input" value={form.categoria} onChange={e => setForm(f => ({...f, categoria: e.target.value}))}>
                    {CATEGORIAS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Visibilidade</label>
                  <select className="input" value={form.publico ? 'publico' : 'restrito'} onChange={e => setForm(f => ({...f, publico: e.target.value === 'publico'}))}>
                    <option value="publico">Público (todos)</option>
                    <option value="restrito">Restrito (admin)</option>
                  </select>
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Descrição</label>
                <textarea className="input" rows={2} value={form.descricao} onChange={e => setForm(f => ({...f, descricao: e.target.value}))} placeholder="Descrição opcional..." />
              </div>
              <div className="form-group">
                <label className="form-label">Arquivo *</label>
                <div
                  style={{
                    border: '2px dashed var(--border)', borderRadius: 'var(--r)',
                    padding: '20px', textAlign: 'center', cursor: 'pointer',
                    background: file ? 'var(--green-dim)' : 'var(--bg-3)',
                    transition: 'all 0.15s',
                  }}
                  onClick={() => document.getElementById('fileInput').click()}
                >
                  <Upload size={20} color={file ? '#3fb950' : '#8b949e'} style={{ margin: '0 auto 8px' }} />
                  <div style={{ fontSize: 13, color: file ? '#3fb950' : '#8b949e' }}>
                    {file ? file.name : 'Clique para selecionar o arquivo'}
                  </div>
                  <input id="fileInput" type="file" style={{ display: 'none' }} onChange={e => setFile(e.target.files[0])} />
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setShowModal(false)}>Cancelar</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? <><Loader2 size={14} style={{animation:'spin .6s linear infinite'}}/> Enviando...</> : 'Publicar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
