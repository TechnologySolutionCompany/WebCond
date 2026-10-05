import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { buildStorageFileName, enrichDocumentsWithDownloadUrl, extractStoragePathFromUrl } from '../../lib/documents'
import { useToast } from '../shared/Toast'
import { useAuth } from '../../hooks/useAuth'
import { applyTenantFilter, withTenantFields } from '../../lib/tenant'
import { FileText, X, Loader2, Download, Trash2, Upload, Search } from 'lucide-react'
import { fileExtension } from '../shared/noticeMeta'
import { safeHttpUrl } from '../../lib/safeUrl'

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
  const [busca, setBusca] = useState('')
  const [categoria, setCategoria] = useState('todos')
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

  const categoriasUsadas = useMemo(() => Array.from(new Set(docs.map((doc) => doc.categoria).filter(Boolean))), [docs])
  const visiveis = useMemo(() => {
    const query = busca.trim().toLowerCase()
    return docs.filter((doc) => (categoria === 'todos' || doc.categoria === categoria)
      && (!query || String(doc.titulo || '').toLowerCase().includes(query) || String(doc.descricao || '').toLowerCase().includes(query)))
  }, [docs, categoria, busca])

  return (
    <div className="fade-in">
      <div className="screen">
        <div className="screen-head">
          <div>
            <h1 className="screen-title">Documentos</h1>
            <div className="screen-sub">Atas, regimentos, contratos e comprovantes · {docs.length} de {documentLimit} documentos do plano</div>
          </div>
          <div className="screen-actions">
            <button className="btn btn-primary" onClick={() => setShowModal(true)} disabled={limitReached} title={limitReached ? 'Limite de documentos do plano atingido' : undefined}>
              <Upload size={17} /> Enviar documento
            </button>
          </div>
        </div>

        {docs.length > 0 && (
          <div className="toolbar">
            <label className="search-box">
              <Search size={18} />
              <input className="input" placeholder="Buscar documento" value={busca} onChange={(event) => setBusca(event.target.value)} aria-label="Buscar documento" />
            </label>
            {categoriasUsadas.length > 1 && (
              <div className="chips" role="group" aria-label="Filtrar documentos" style={{ maxWidth: '100%' }}>
                {[['todos', 'Todos'], ...categoriasUsadas.map((key) => [key, getCat(key).label])].map(([key, label]) => (
                  <button key={key} type="button" className={`chip${categoria === key ? ' active' : ''}`} onClick={() => setCategoria(key)}>{label}</button>
                ))}
              </div>
            )}
          </div>
        )}

        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><div className="spinner" /></div>
        ) : visiveis.length === 0 ? (
          <div className="empty-card"><FileText size={36} /><span>{docs.length ? 'Nenhum documento encontrado.' : 'Nenhum documento publicado ainda.'}</span></div>
        ) : (
          <div className="card-grid card-grid-docs">
            {visiveis.map((doc) => {
              const cat = getCat(doc.categoria)
              return (
                <div key={doc.id} className="info-card" style={{ gap: 14, padding: 16 }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                    <span className="doc-icon"><FileText size={20} /><b>{fileExtension(doc.arquivo_path || doc.arquivo_url)}</b></span>
                    <span style={{ display: 'flex', gap: 6 }}>
                      <a href={safeHttpUrl(doc.download_url || doc.arquivo_url) || undefined} target="_blank" rel="noopener noreferrer" className="mini-btn mini-btn-icon" title="Baixar" aria-label={`Baixar ${doc.titulo}`}>
                        <Download size={17} />
                      </a>
                      <button type="button" className="mini-btn mini-btn-icon mini-btn-danger" onClick={() => handleDelete(doc)} title="Excluir" aria-label={`Excluir ${doc.titulo}`}>
                        <Trash2 size={16} />
                      </button>
                    </span>
                  </div>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 600, lineHeight: 1.3, overflowWrap: 'anywhere' }}>{doc.titulo}</div>
                    {doc.descricao && <div className="info-card-text info-card-clamp" style={{ fontSize: 13, marginTop: 4 }}>{doc.descricao}</div>}
                    <div className="list-sub" style={{ fontSize: 13, marginTop: 6 }}>{cat.label} · {new Date(doc.created_at).toLocaleDateString('pt-BR')}</div>
                  </div>
                  {!doc.publico && <span className="pill pill-sm tone-amber" style={{ alignSelf: 'flex-start' }}>Restrito à administração</span>}
                </div>
              )
            })}
          </div>
        )}
      </div>

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
                  <Upload size={20} color={file ? '#3DAE4A' : '#8794A6'} style={{ margin: '0 auto 8px' }} />
                  <div style={{ fontSize: 13, color: file ? '#3DAE4A' : '#8794A6' }}>
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
