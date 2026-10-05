import { useCallback, useEffect, useState } from 'react'
import { CircleCheck, Clock3, Hourglass, Lightbulb, Loader2, Plus, Send, ShieldCheck, Sparkles, TriangleAlert, Wrench, X } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import { useToast } from '../shared/Toast'
import { withTenantFields } from '../../lib/tenant'
import { parseResidentRequest } from '../../lib/residentRequests'

const emptyForm = {
  titulo: '',
  descricao: '',
  categoria: 'geral',
}

// Categorias e situacao no formato do prototipo (redesign v2.10A3).
const CATEGORIAS = [
  { value: 'geral', label: 'Geral', Icon: TriangleAlert },
  { value: 'limpeza', label: 'Limpeza', Icon: Sparkles },
  { value: 'estrutura', label: 'Estrutura', Icon: Wrench },
  { value: 'seguranca', label: 'Segurança', Icon: ShieldCheck },
  { value: 'energia', label: 'Energia', Icon: Lightbulb },
]

function statusMeta(status = '') {
  const value = String(status).toLowerCase()
  if (value === 'resolvido') return { label: 'Resolvida', tone: 'green', Icon: CircleCheck }
  if (value === 'em_analise' || value === 'em_andamento') return { label: 'Em andamento', tone: 'primary', Icon: Hourglass }
  return { label: 'Aberta', tone: 'amber', Icon: Clock3 }
}

function formatDate(value) {
  return new Date(value).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export default function MoradorOcorrencias({ isActive = true }) {
  const { profile, condominiumId } = useAuth()
  const { toast } = useToast()
  const [items, setItems] = useState([])
  const [form, setForm] = useState(emptyForm)
  const [showForm, setShowForm] = useState(false)
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
    // Aviso de pagamento e pedido de alteracao de cadastro tambem ficam nesta tabela; aqui so ocorrencias.
    setItems((data || []).filter((item) => parseResidentRequest(item).kind === 'incident'))
    setLoading(false)
  }, [profile?.id])

  useEffect(() => {
    if (!profile?.id || !isActive) return
    void fetchOcorrencias()
  }, [fetchOcorrencias, profile?.id, isActive])

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
    setShowForm(false)
    void fetchOcorrencias()
  }

  return (
    <div className="fade-in screen">
      <div className="screen-head">
        <div>
          <h1 className="screen-title">Ocorrências</h1>
          <div className="screen-sub">Avise o síndico sobre problemas no prédio e acompanhe o retorno</div>
        </div>
        <div className="screen-actions">
          <button className="btn btn-primary" onClick={() => setShowForm(true)} disabled={!available}><Plus size={17} />Nova ocorrência</button>
        </div>
      </div>

      {!available && (
        <div className="pay-note tone-amber">
          <TriangleAlert size={20} />
          <div><b>Módulo em preparação.</b> A área de ocorrências depende da atualização do banco de dados.</div>
        </div>
      )}

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><div className="spinner" /></div>
      ) : items.length === 0 ? (
        <div className="empty-card">
          <TriangleAlert size={36} />
          <span>Nenhuma ocorrência enviada ainda. Viu algo errado no prédio? Toque em "Nova ocorrência".</span>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 820 }}>
          {items.map((item) => {
            const meta = statusMeta(item.status)
            const categoria = CATEGORIAS.find((entry) => entry.value === item.categoria) || CATEGORIAS[0]
            return (
              <div key={item.id} className="info-card">
                <div className="info-card-top">
                  <span className={`pill tone-${meta.tone}`}><meta.Icon size={13} />{meta.label}</span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--text-muted)' }}><categoria.Icon size={15} />{categoria.label}</span>
                  <span className="info-card-date">{formatDate(item.created_at)}</span>
                </div>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 600, overflowWrap: 'anywhere' }}>{item.titulo}</div>
                  <div className="info-card-text" style={{ marginTop: 4 }}>{item.descricao}</div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {showForm && (
        <div className="sheet-overlay" onClick={(event) => event.target === event.currentTarget && !saving && setShowForm(false)}>
          <div className="sheet" role="dialog" aria-modal="true" aria-label="Nova ocorrência">
            <div className="sheet-grip"><span /></div>
            <div className="sheet-body">
              <div className="sheet-head">
                <div style={{ flex: 1, fontSize: 19, fontWeight: 600 }}>Nova ocorrência</div>
                <button type="button" className="sheet-close" onClick={() => setShowForm(false)} disabled={saving} aria-label="Fechar"><X size={18} /></button>
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Categoria</label>
                <div className="choice-chips">
                  {CATEGORIAS.map((categoria) => (
                    <button key={categoria.value} type="button" className={`chip${form.categoria === categoria.value ? ' active' : ''}`} onClick={() => setForm((current) => ({ ...current, categoria: categoria.value }))}>
                      <categoria.Icon size={15} />{categoria.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label" htmlFor="ocorrencia-titulo">Título</label>
                <input id="ocorrencia-titulo" className="input" value={form.titulo} onChange={(event) => setForm((current) => ({ ...current, titulo: event.target.value }))} placeholder="Ex.: Vazamento na escada" />
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label" htmlFor="ocorrencia-descricao">Descrição</label>
                <textarea id="ocorrencia-descricao" className="input" rows={5} value={form.descricao} onChange={(event) => setForm((current) => ({ ...current, descricao: event.target.value }))} placeholder="Onde é e o que está acontecendo?" />
              </div>
              <button className="btn btn-primary pay-big-btn" onClick={handleSubmit} disabled={saving || !available}>
                {saving ? <><Loader2 size={16} className="spin-icon" /> Enviando...</> : <><Send size={16} /> Enviar ao síndico</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
