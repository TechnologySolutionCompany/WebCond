import { useCallback, useEffect, useState } from 'react'
import { TriangleAlert, Send, Loader2 } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import { useToast } from '../shared/Toast'
import { withTenantFields } from '../../lib/tenant'

const emptyForm = {
  titulo: '',
  descricao: '',
  categoria: 'geral',
}

export default function MoradorOcorrencias() {
  const { profile, condominiumId } = useAuth()
  const { toast } = useToast()
  const [items, setItems] = useState([])
  const [form, setForm] = useState(emptyForm)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [available, setAvailable] = useState(true)

  const fetchOcorrencias = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('ocorrencias_predio')
      .select('*')
      .eq('created_by', profile.id)
      .order('created_at', { ascending: false })

    if (error) {
      setAvailable(false)
      setItems([])
      setLoading(false)
      return
    }

    setAvailable(true)
    setItems(data || [])
    setLoading(false)
  }, [profile?.id])

  useEffect(() => {
    if (!profile?.id) return
    void fetchOcorrencias()
  }, [fetchOcorrencias, profile?.id])

  const handleSubmit = async () => {
    if (!form.titulo || !form.descricao) {
      toast('Preencha título e descrição da ocorrência.', 'error')
      return
    }

    setSaving(true)
    const { error } = await supabase.from('ocorrencias_predio').insert(withTenantFields({
      ...form,
      apartamento: profile?.apartamento || '',
      created_by: profile.id,
      status: 'aberto',
    }, condominiumId))
    setSaving(false)

    if (error) {
      toast('A tabela de ocorrências ainda não está disponível no banco.', 'error')
      setAvailable(false)
      return
    }

    toast('Ocorrência enviada ao síndico.', 'success')
    setForm(emptyForm)
    void fetchOcorrencias()
  }

  return (
    <div className="fade-in">
      <div className="page-header">
        <div className="page-title">Ocorrências</div>
        <div className="page-subtitle">Avise o síndico sobre problemas no prédio e acompanhe o retorno</div>
      </div>

      {!available && (
        <div className="card" style={{ marginBottom: 20, borderColor: '#f0883e40' }}>
          <div style={{ color: '#f0883e', fontWeight: 600, marginBottom: 8 }}>Módulo em preparação</div>
          <div style={{ color: '#8b949e', fontSize: 13 }}>
            A área de ocorrências depende da atualização do banco de dados para criar a tabela `ocorrencias_predio`.
          </div>
        </div>
      )}

      <div className="grid-2">
        <div className="card">
          <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 16 }}>Nova ocorrência</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div className="form-group">
              <label className="form-label">Título</label>
              <input className="input" value={form.titulo} onChange={(event) => setForm((current) => ({ ...current, titulo: event.target.value }))} placeholder="Ex.: Vazamento na escada" />
            </div>
            <div className="form-group">
              <label className="form-label">Categoria</label>
              <select className="input" value={form.categoria} onChange={(event) => setForm((current) => ({ ...current, categoria: event.target.value }))}>
                <option value="geral">Geral</option>
                <option value="limpeza">Limpeza</option>
                <option value="estrutura">Estrutura</option>
                <option value="seguranca">Segurança</option>
                <option value="energia">Energia</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Descrição</label>
              <textarea className="input" rows={5} value={form.descricao} onChange={(event) => setForm((current) => ({ ...current, descricao: event.target.value }))} placeholder="Descreva o problema com detalhes..." />
            </div>
            <button className="btn btn-primary" onClick={handleSubmit} disabled={saving || !available}>
              {saving ? <><Loader2 size={14} style={{ animation: 'spin .6s linear infinite' }} /> Enviando...</> : <><Send size={14} /> Enviar ocorrência</>}
            </button>
          </div>
        </div>

        <div className="card">
          <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 16 }}>Minhas notificações</div>
          {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><div className="spinner" /></div>
          ) : items.length === 0 ? (
            <div style={{ textAlign: 'center', color: '#8b949e', padding: 32 }}>
              <TriangleAlert size={26} style={{ opacity: 0.4, marginBottom: 10 }} />
              <div>Nenhuma ocorrência enviada ainda.</div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {items.map((item) => (
                <div key={item.id} style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 14, background: 'var(--bg-3)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', marginBottom: 6 }}>
                    <div style={{ fontWeight: 600 }}>{item.titulo}</div>
                    <span className={`badge ${item.status === 'resolvido' ? 'badge-green' : 'badge-orange'}`}>
                      {item.status === 'resolvido' ? 'Resolvido' : 'Aberto'}
                    </span>
                  </div>
                  <div style={{ color: '#8b949e', fontSize: 12 }}>{item.descricao}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
