import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { enrichDocumentsWithDownloadUrl } from '../../lib/documents'
import { useAuth } from '../../hooks/useAuth'
import { isNoticeForProfile } from '../../lib/units'
import { isNoticeCurrent } from '../../lib/avisos'
import { Megaphone, FileText, Download, Search } from 'lucide-react'
import { AVISO_TIPOS, DOC_CATEGORIAS, fileExtension, formatNoticeDate } from '../shared/noticeMeta'
import { safeHttpUrl } from '../../lib/safeUrl'

const NOVO_MS = 3 * 86400000

export function MoradorAvisos({ isActive = true }) {
  const { profile } = useAuth()
  const [avisos, setAvisos] = useState([])
  const [loading, setLoading] = useState(true)
  const [tipo, setTipo] = useState('todos')

  const fetchAvisos = useCallback(async () => {
    const { data } = await supabase
      .from('avisos')
      .select('*')
      .eq('ativo', true)
      .order('created_at', { ascending: false })

    const filtrados = (data || []).filter((aviso) => isNoticeCurrent(aviso) && isNoticeForProfile(aviso, profile))
    setAvisos(filtrados)
    setLoading(false)
  }, [profile])

  useEffect(() => {
    if (!profile?.apartamento || !isActive) return
    void fetchAvisos()
  }, [fetchAvisos, profile?.apartamento, isActive])

  const visiveis = useMemo(() => avisos.filter((aviso) => tipo === 'todos' || (aviso.tipo || 'informativo') === tipo), [avisos, tipo])

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><div className="spinner" /></div>

  return (
    <div className="fade-in screen">
      <div>
        <h1 className="screen-title">Avisos e comunicados</h1>
        <div className="screen-sub">Informações importantes do condomínio</div>
      </div>

      <div className="chips" role="group" aria-label="Filtrar avisos">
        {[['todos', 'Todos'], ...Object.entries(AVISO_TIPOS).map(([key, item]) => [key, item.plural])].map(([key, label]) => (
          <button key={key} type="button" className={`chip${tipo === key ? ' active' : ''}`} onClick={() => setTipo(key)}>{label}</button>
        ))}
      </div>

      {visiveis.length === 0 ? (
        <div className="empty-card"><Megaphone size={36} /><span>{avisos.length ? 'Nenhum aviso deste tipo.' : 'Nenhum aviso no momento.'}</span></div>
      ) : (
        <div className="card-grid">
          {visiveis.map((aviso) => {
            const meta = AVISO_TIPOS[aviso.tipo] || AVISO_TIPOS.informativo
            const Icon = meta.icon
            const novo = Date.now() - new Date(aviso.created_at).getTime() < NOVO_MS
            return (
              <article key={aviso.id} className="info-card">
                <div className="info-card-top">
                  <span className={`info-card-icon tone-${meta.tone}`}><Icon size={18} /></span>
                  <span className={`info-card-cat tone-${meta.tone}`} style={{ background: 'none' }}>{meta.label}</span>
                  <span className="info-card-date">
                    {novo && <span className="pill pill-sm" style={{ background: 'var(--primary)', color: '#fff', marginRight: 8 }}>Novo</span>}
                    {formatNoticeDate(aviso.created_at)}
                  </span>
                </div>
                <div>
                  <h3 className="info-card-title">{aviso.titulo}</h3>
                  <p className="info-card-text">{aviso.conteudo}</p>
                </div>
              </article>
            )
          })}
        </div>
      )}
    </div>
  )
}

export function MoradorDocumentos({ isActive = true }) {
  const [docs, setDocs] = useState([])
  const [loading, setLoading] = useState(true)
  const [categoria, setCategoria] = useState('todos')
  const [busca, setBusca] = useState('')

  useEffect(() => {
    if (!isActive) return
    void (async () => {
      const { data, error } = await supabase
        .from('documentos')
        .select('*')
        .eq('publico', true)
        .order('created_at', { ascending: false })

      if (error) {
        setDocs([])
        setLoading(false)
        return
      }

      const nextDocs = await enrichDocumentsWithDownloadUrl(data || [])
      setDocs(nextDocs)
      setLoading(false)
    })()
  }, [isActive])

  const categorias = useMemo(() => Array.from(new Set(docs.map((doc) => doc.categoria).filter(Boolean))), [docs])
  const visiveis = useMemo(() => {
    const query = busca.trim().toLowerCase()
    return docs.filter((doc) => (categoria === 'todos' || doc.categoria === categoria)
      && (!query || String(doc.titulo || '').toLowerCase().includes(query) || String(doc.descricao || '').toLowerCase().includes(query)))
  }, [docs, categoria, busca])

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><div className="spinner" /></div>

  return (
    <div className="fade-in screen">
      <div>
        <h1 className="screen-title">Documentos</h1>
        <div className="screen-sub">Atas, regimentos e documentos do condomínio</div>
      </div>

      {docs.length > 0 && (
        <div className="toolbar">
          <label className="search-box">
            <Search size={18} />
            <input className="input" placeholder="Buscar documento" value={busca} onChange={(event) => setBusca(event.target.value)} aria-label="Buscar documento" />
          </label>
          {categorias.length > 1 && (
            <div className="chips" role="group" aria-label="Filtrar documentos" style={{ maxWidth: '100%' }}>
              {[['todos', 'Todos'], ...categorias.map((key) => [key, DOC_CATEGORIAS[key] || key])].map(([key, label]) => (
                <button key={key} type="button" className={`chip${categoria === key ? ' active' : ''}`} onClick={() => setCategoria(key)}>{label}</button>
              ))}
            </div>
          )}
        </div>
      )}

      {visiveis.length === 0 ? (
        <div className="empty-card"><FileText size={36} /><span>{docs.length ? 'Nenhum documento encontrado.' : 'Nenhum documento disponível.'}</span></div>
      ) : (
        <div className="card-grid card-grid-docs">
          {visiveis.map((documento) => (
            <div key={documento.id} className="info-card" style={{ gap: 14, padding: 16 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                <span className="doc-icon"><FileText size={20} /><b>{fileExtension(documento.arquivo_path || documento.arquivo_url)}</b></span>
                <a href={safeHttpUrl(documento.download_url || documento.arquivo_url) || undefined} target="_blank" rel="noopener noreferrer" className="mini-btn mini-btn-icon" title="Baixar" aria-label={`Baixar ${documento.titulo}`}>
                  <Download size={17} />
                </a>
              </div>
              <div>
                <div style={{ fontSize: 15, fontWeight: 600, lineHeight: 1.3, overflowWrap: 'anywhere' }}>{documento.titulo}</div>
                {documento.descricao && <div className="info-card-text info-card-clamp" style={{ fontSize: 13, marginTop: 4 }}>{documento.descricao}</div>}
                <div className="list-sub" style={{ fontSize: 13, marginTop: 6 }}>{DOC_CATEGORIAS[documento.categoria] || documento.categoria} · {new Date(documento.created_at).toLocaleDateString('pt-BR')}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
