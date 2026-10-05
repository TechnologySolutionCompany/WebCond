import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useToast } from '../shared/Toast'
import { isNoticeCurrent, noticeDaysLeft, NOTICE_RETENTION_DAYS } from '../../lib/avisos'
import { useAuth } from '../../hooks/useAuth'
import { applyTenantFilter, withTenantFields } from '../../lib/tenant'
import { Loader2, Megaphone, Send, Timer, Trash2, Users } from 'lucide-react'
import { compareUnitNumbers } from '../../lib/units'
import { notifyAvisos } from '../../lib/adminApi'
import { describeNotifyResult } from '../../lib/notifications'
import { AVISO_TIPOS, formatNoticeDate } from '../shared/noticeMeta'

const emptyForm = { titulo: '', conteudo: '', tipo: 'informativo', destinatario: 'todos', apartamento_destino: '' }

// Avisos do sindico (redesign v2.10A3): o formulario fica ao lado da lista de publicados.
export default function Avisos({ isActive = true }) {
  const [avisos, setAvisos] = useState([])
  const [loading, setLoading] = useState(true)
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

  useEffect(() => { if (isActive) void fetchAvisos() }, [fetchAvisos, isActive])

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
      toast('Preencha título e mensagem.', 'error')
      return
    }
    if (form.destinatario === 'apartamento' && !form.apartamento_destino) {
      toast('Escolha a unidade que recebe o aviso.', 'error')
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

  const publishLabel = form.destinatario === 'apartamento'
    ? (form.apartamento_destino ? `Publicar para a unidade ${form.apartamento_destino}` : 'Publicar para a unidade')
    : `Publicar para ${unitNumbers.length || 'todas as'} ${unitNumbers.length === 1 ? 'unidade' : 'unidades'}`

  return (
    <div className="fade-in screen">
      <div>
        <h1 className="screen-title">Avisos e comunicados</h1>
        <div className="screen-sub">Publique comunicados para os moradores. Cada aviso é apagado automaticamente {NOTICE_RETENTION_DAYS} dias após o envio.</div>
      </div>

      <div className="compose-cols">
        <div className="compose-card">
          <div className="compose-title">Novo aviso</div>
          <div className="form-group">
            <label className="form-label" htmlFor="aviso-titulo">Título</label>
            <input id="aviso-titulo" className="input" value={form.titulo} onChange={(event) => setForm((current) => ({ ...current, titulo: event.target.value }))} placeholder="Ex.: Limpeza da caixa d'água" />
          </div>
          <div className="form-group">
            <label className="form-label">Tipo</label>
            <div className="choice-chips">
              {Object.entries(AVISO_TIPOS).map(([value, meta]) => (
                <button key={value} type="button" className={`chip${form.tipo === value ? ' active' : ''}`} onClick={() => setForm((current) => ({ ...current, tipo: value }))}>
                  <meta.icon size={15} />{meta.label}
                </button>
              ))}
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Para quem</label>
            <div className="choice-chips">
              <button type="button" className={`chip${form.destinatario === 'todos' ? ' active' : ''}`} onClick={() => setForm((current) => ({ ...current, destinatario: 'todos', apartamento_destino: '' }))}><Users size={15} />Todos os moradores</button>
              <button type="button" className={`chip${form.destinatario === 'apartamento' ? ' active' : ''}`} onClick={() => setForm((current) => ({ ...current, destinatario: 'apartamento' }))}>Uma unidade</button>
            </div>
            {form.destinatario === 'apartamento' && (
              <select className="input" style={{ marginTop: 8 }} value={form.apartamento_destino} onChange={(event) => setForm((current) => ({ ...current, apartamento_destino: event.target.value }))} aria-label="Unidade">
                <option value="">Selecione a unidade</option>
                {unitNumbers.map((numero) => (
                  <option key={numero} value={numero}>Unidade {numero}</option>
                ))}
              </select>
            )}
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="aviso-conteudo">Mensagem</label>
            <textarea id="aviso-conteudo" className="input" rows={4} value={form.conteudo} onChange={(event) => setForm((current) => ({ ...current, conteudo: event.target.value }))} placeholder="Escreva o comunicado..." />
          </div>
          <div className="list-sub" style={{ fontSize: 12.5, lineHeight: 1.5 }}>Os moradores recebem no app e, conforme o que cada um ligou, no celular, e-mail e WhatsApp.</div>
          <button className="btn btn-primary pay-big-btn" onClick={handleSave} disabled={saving}>
            {saving ? <><Loader2 size={16} className="spin-icon" /> Publicando...</> : <><Send size={17} /> {publishLabel}</>}
          </button>
        </div>

        <div className="compose-list">
          <div className="section-label">Publicados · {avisos.length}</div>
          {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><div className="spinner" /></div>
          ) : avisos.length === 0 ? (
            <div className="empty-card"><Megaphone size={36} /><span>Nenhum aviso publicado ainda.</span></div>
          ) : avisos.map((aviso) => {
            const meta = AVISO_TIPOS[aviso.tipo] || AVISO_TIPOS.informativo
            const daysLeft = noticeDaysLeft(aviso)
            return (
              <div key={aviso.id} className="info-card" style={{ gap: 8, padding: '16px 18px' }}>
                <div className="info-card-top" style={{ gap: 8 }}>
                  <span className={`pill pill-sm tone-${meta.tone}`}><meta.icon size={13} />{meta.label}</span>
                  <span className="info-card-date">{formatNoticeDate(aviso.created_at)}</span>
                  <button type="button" className="mini-btn mini-btn-icon mini-btn-danger" onClick={() => handleDelete(aviso)} title="Excluir aviso" aria-label={`Excluir aviso ${aviso.titulo}`}><Trash2 size={15} /></button>
                </div>
                <div style={{ fontSize: 16, fontWeight: 600, overflowWrap: 'anywhere' }}>{aviso.titulo}</div>
                <div className="info-card-text info-card-clamp" style={{ margin: 0 }}>{aviso.conteudo}</div>
                <div className="info-card-foot" style={{ paddingTop: 4 }}>
                  <span><Users size={13} />{aviso.destinatario === 'apartamento' ? `Unidade ${aviso.apartamento_destino}` : 'Todas as unidades'}</span>
                  <span><Timer size={13} />Apaga em {daysLeft} {daysLeft === 1 ? 'dia' : 'dias'}</span>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
