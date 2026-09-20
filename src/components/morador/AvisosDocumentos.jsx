import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { enrichDocumentsWithDownloadUrl } from '../../lib/documents'
import { useAuth } from '../../hooks/useAuth'
import { isNoticeForProfile } from '../../lib/units'
import { isNoticeCurrent } from '../../lib/avisos'
import { Bell, Info, AlertTriangle, Wrench, Megaphone, FileText, Download } from 'lucide-react'

const TIPOS = {
  informativo: { label: 'Informativo', icon: Info, color: 'blue' },
  aviso: { label: 'Aviso', icon: Bell, color: 'yellow' },
  urgente: { label: 'Urgente', icon: AlertTriangle, color: 'red' },
  manutencao: { label: 'Manutenção', icon: Wrench, color: 'orange' },
}

const CATEGORIAS = {
  ata: 'Ata',
  regimento: 'Regimento',
  contrato: 'Contrato',
  financeiro: 'Financeiro',
  comprovante: 'Comprovante',
  conta: 'Conta',
  boleto: 'Boleto',
  outro: 'Outro',
}

export function MoradorAvisos() {
  const { profile } = useAuth()
  const [avisos, setAvisos] = useState([])
  const [loading, setLoading] = useState(true)

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
    if (!profile?.apartamento) return
    void fetchAvisos()
  }, [fetchAvisos, profile?.apartamento])

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><div className="spinner" /></div>

  return (
    <div className="fade-in">
      <div className="page-header">
        <div className="page-title">Avisos e comunicados</div>
        <div className="page-subtitle">Informações importantes do condomínio</div>
      </div>
      {avisos.length === 0 ? (
        <div className="empty-state"><Megaphone size={40} /><p>Nenhum aviso no momento.</p></div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {avisos.map((aviso) => {
            const tipo = TIPOS[aviso.tipo] || TIPOS.informativo
            const Icon = tipo.icon

            return (
              <div key={aviso.id} className="card" style={{ borderLeft: `3px solid var(--${tipo.color})` }}>
                <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                  <div style={{ padding: 8, borderRadius: 8, background: `var(--${tipo.color}-dim, #1a2a3a)`, flexShrink: 0 }}>
                    <Icon size={16} color={`var(--${tipo.color})`} />
                  </div>
                  <div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
                      <span style={{ fontWeight: 600, fontSize: 15 }}>{aviso.titulo}</span>
                      <span className={`badge badge-${tipo.color}`}>{tipo.label}</span>
                    </div>
                    <p style={{ color: '#8b949e', fontSize: 13, lineHeight: 1.6 }}>{aviso.conteudo}</p>
                    <div style={{ fontSize: 11, color: '#484f58', marginTop: 8 }}>
                      {new Date(aviso.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export function MoradorDocumentos() {
  const [docs, setDocs] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    void fetchDocumentos()
  }, [])

  const fetchDocumentos = async () => {
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
  }

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><div className="spinner" /></div>

  return (
    <div className="fade-in">
      <div className="page-header">
        <div className="page-title">Documentos</div>
        <div className="page-subtitle">Atas, regimentos e documentos do condomínio</div>
      </div>
      {docs.length === 0 ? (
        <div className="empty-state"><FileText size={40} /><p>Nenhum documento disponível.</p></div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px,1fr))', gap: 16 }}>
          {docs.map((documento) => (
            <div key={documento.id} className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <span className="badge badge-blue" style={{ alignSelf: 'flex-start' }}>{CATEGORIAS[documento.categoria] || documento.categoria}</span>
              <div>
                <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>{documento.titulo}</div>
                {documento.descricao && <div style={{ fontSize: 12, color: '#8b949e' }}>{documento.descricao}</div>}
              </div>
              <div style={{ fontSize: 11, color: '#484f58' }}>{new Date(documento.created_at).toLocaleDateString('pt-BR')}</div>
              <a href={documento.download_url || documento.arquivo_url} target="_blank" rel="noopener noreferrer" className="btn btn-ghost btn-sm" style={{ justifyContent: 'center' }}>
                <Download size={13} /> Baixar
              </a>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
