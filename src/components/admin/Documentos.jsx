import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { buildStorageFileName, enrichDocumentsWithDownloadUrl, extractStoragePathFromUrl } from '../../lib/documents'
import { useToast } from '../shared/Toast'
import { useAuth } from '../../hooks/useAuth'
import { applyTenantFilter, withTenantFields } from '../../lib/tenant'
import { Plus, FileText, X, Loader2, Download, Trash2, Upload } from 'lucide-react'

const CATEGORIAS = [
  { value: 'ata', label: 'Ata de reunião', color: 'blue' },
  { value: 'regimento', label: 'Regimento', color: 'purple' },
  { value: 'contrato', label: 'Contrato', color: 'orange' },
  { value: 'financeiro', label: 'Financeiro', color: 'green' },
  { value: 'comprovante', label: 'Comprovante', color: 'yellow' },
  { value: 'conta', label: 'Conta', color: 'blue' },
  { value: 'boleto', label: 'Boleto', color: 'orange' },
  { value: 'outro', label: 'Outro', color: 'yellow' },
]

export default function Documentos() {
  const [docs, setDocs] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState({ titulo: '', descricao: '', categoria: 'ata', publico: true })
  const [file, setFile] = useState(null)
  const [saving, setSaving] = useState(false)
  const { profile, condominiumId } = useAuth()
  const { toast } = useToast()
  const documentLimit = profile?.condominium_document_limit || 10
  const limitReached = !loading && docs.length >= documentLimit

  const fetchDocs = useCallback(async () => {
    setLoading(true)
    const query = supabase.from('documentos').select('*').order('created_at', { ascending: false })
    const { data, error } = await applyTenantFilter(query, condominiumId)

    if (error) {
      toast(error.message || 'Erro ao carregar documentos.', 'error')
      setDocs([])
      setLoading(false)
      return
    }

    const nextDocs = await enrichDocumentsWithDownloadUrl(data || [])
    setDocs(nextDocs)
    setLoading(false)
  }, [condominiumId, toast])

  useEffect(() => { void fetchDocs() }, [fetchDocs])

  const handleSave = async () => {
    if (docs.length >= documentLimit) {
      toast(`Limite de ${documentLimit} documentos do plano atingido. Exclua um documento para enviar outro.`, 'error')
      return
    }

    if (!form.titulo || !file) {
      toast('Preencha o título e selecione um arquivo.', 'error')
      return
    }

    setSaving(true)
    try {
      const fileName = buildStorageFileName(file.name, condominiumId)
      const { error: uploadError } = await supabase.storage.from('documentos').upload(fileName, file)
      if (uploadError) throw uploadError

      const { error } = await supabase.from('documentos').insert(withTenantFields({
        ...form,
        arquivo_url: '',
        arquivo_path: fileName,
        created_by: profile.id,
      }, condominiumId))
      if (error) throw error

      toast('Documento publicado!', 'success')
      setShowModal(false)
      setForm({ titulo: '', descricao: '', categoria: 'ata', publico: true })
      setFile(null)
      void fetchDocs()
    } catch (error) {
      toast(error.message || 'Erro ao publicar documento.', 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (doc) => {
    if (!confirm('Deseja excluir este documento?')) return
    const fileName = doc.arquivo_path || extractStoragePathFromUrl(doc.arquivo_url)
    if (fileName) await supabase.storage.from('documentos').remove([fileName])
    await supabase.from('documentos').delete().eq('id', doc.id)
    toast('Documento excluído.', 'info')
    void fetchDocs()
  }

  const getCat = (cat) => CATEGORIAS.find((item) => item.value === cat) || CATEGORIAS[CATEGORIAS.length - 1]

  return (
    <div className="fade-in">
      <div className="page-header">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <div className="page-title">Documentos</div>
            <div className="page-subtitle">Atas, regimentos, contratos, comprovantes e arquivos importantes · {docs.length} de {documentLimit} documentos do plano</div>
          </div>
          <button className="btn btn-primary" onClick={() => setShowModal(true)} disabled={limitReached} title={limitReached ? 'Limite de documentos do plano atingido' : undefined}>
            <Plus size={15} /> Adicionar documento
          </button>
        </div>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><div className="spinner" /></div>
      ) : docs.length === 0 ? (
        <div className="empty-state"><FileText size={40} /><p>Nenhum documento publicado ainda.</p></div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
          {docs.map((doc) => {
            const cat = getCat(doc.categoria)
            return (
              <div key={doc.id} className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <span className={`badge badge-${cat.color}`}>{cat.label}</span>
                  <div style={{ display: 'flex', gap: 4 }}>
                    {!doc.publico && <span className="badge badge-orange">Restrito</span>}
                    <button className="btn btn-ghost btn-sm btn-icon" onClick={() => handleDelete(doc)} style={{ color: '#f85149' }}>
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>{doc.titulo}</div>
                  {doc.descricao && <div style={{ fontSize: 12, color: '#8b949e', lineHeight: 1.5 }}>{doc.descricao}</div>}
                </div>
                <div style={{ fontSize: 11, color: '#484f58' }}>{new Date(doc.created_at).toLocaleDateString('pt-BR')}</div>
                <a href={doc.download_url || doc.arquivo_url} target="_blank" rel="noopener noreferrer" className="btn btn-ghost btn-sm" style={{ justifyContent: 'center' }}>
                  <Download size={13} /> Baixar
                </a>
              </div>
            )
          })}
        </div>
      )}

      {showModal && (
        <div className="modal-overlay" onClick={(event) => event.target === event.currentTarget && setShowModal(false)}>
          <div className="modal">
            <div className="modal-header">
              <div className="modal-title">Adicionar documento</div>
              <button className="btn btn-ghost btn-icon" onClick={() => setShowModal(false)}><X size={16} /></button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="form-group">
                <label className="form-label">Título *</label>
                <input className="input" value={form.titulo} onChange={(event) => setForm((current) => ({ ...current, titulo: event.target.value }))} placeholder="Nome do documento" />
              </div>
              <div className="grid-2">
                <div className="form-group">
                  <label className="form-label">Categoria</label>
                  <select className="input" value={form.categoria} onChange={(event) => setForm((current) => ({ ...current, categoria: event.target.value }))}>
                    {CATEGORIAS.map((categoria) => <option key={categoria.value} value={categoria.value}>{categoria.label}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Visibilidade</label>
                  <select className="input" value={form.publico ? 'publico' : 'restrito'} onChange={(event) => setForm((current) => ({ ...current, publico: event.target.value === 'publico' }))}>
                    <option value="publico">Público (todos)</option>
                    <option value="restrito">Restrito (admin)</option>
                  </select>
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Descrição</label>
                <textarea className="input" rows={2} value={form.descricao} onChange={(event) => setForm((current) => ({ ...current, descricao: event.target.value }))} placeholder="Descrição opcional..." />
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
                  <input id="fileInput" type="file" style={{ display: 'none' }} onChange={(event) => setFile(event.target.files[0])} />
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setShowModal(false)}>Cancelar</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? <><Loader2 size={14} style={{ animation: 'spin .6s linear infinite' }} /> Enviando...</> : 'Publicar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
