import { useEffect, useState } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { supabase } from '../../lib/supabase'
import { formatCpf } from '../../lib/cpf'
import { useToast } from '../shared/Toast'
import { User, Home, Phone, Mail, Calendar, CreditCard, Loader2, Edit2, Save, X } from 'lucide-react'

export default function MoradorPerfil() {
  const { profile, refreshProfile } = useAuth()
  const { toast } = useToast()
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    whatsapp: '',
    avatar_url: '',
  })

  useEffect(() => {
    setForm({
      whatsapp: profile?.whatsapp || '',
      avatar_url: profile?.avatar_url || '',
    })
  }, [profile])

  const handleSave = async () => {
    if (!profile?.id) return

    setSaving(true)
    const { error } = await supabase
      .from('profiles')
      .update({
        ...form,
        whatsapp: String(form.whatsapp || '').replace(/\D/g, ''),
        telefone: '',
        updated_at: new Date().toISOString(),
      })
      .eq('id', profile.id)

    setSaving(false)

    if (error) {
      toast('Erro ao salvar.', 'error')
      return
    }

    await refreshProfile()
    toast('Perfil atualizado!', 'success')
    setEditing(false)
  }

  if (!profile) return null

  const initials = profile.nome?.split(' ').map((name) => name[0]).slice(0, 2).join('').toUpperCase() || '?'

  return (
    <div className="fade-in">
      <div className="page-header">
        <div className="page-title">Meu perfil</div>
        <div className="page-subtitle">Seus dados cadastrados no condomínio</div>
      </div>

      <div style={{ maxWidth: 600 }}>
        <div className="card" style={{ marginBottom: 20, borderColor: '#388bfd40' }}>
          <div style={{ display: 'flex', gap: 20, alignItems: 'center' }}>
            <div style={{ width: 72, height: 72, borderRadius: 16, background: '#1a2a3a', border: '2px solid #58a6ff', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 }}>
              {profile.avatar_url ? (
                <img src={profile.avatar_url} alt="Avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                <span style={{ fontSize: 26, fontWeight: 700, color: '#58a6ff' }}>{initials}</span>
              )}
            </div>
            <div>
              <div style={{ fontSize: 20, fontWeight: 700 }}>{profile.nome}</div>
              <div style={{ display: 'flex', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
                <span className="badge badge-blue">
                  <Home size={10} /> Apt. {profile.apartamento || '—'}
                </span>
                <span className="badge badge-green">Morador ativo</span>
              </div>
            </div>
          </div>
        </div>

        <div className="card" style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <div style={{ fontWeight: 600, fontSize: 14 }}>Informações cadastrais</div>
            <span style={{ fontSize: 11, color: '#8b949e', background: '#1c2333', padding: '3px 8px', borderRadius: 6 }}>
              Gerenciado pelo síndico
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <ProfileField icon={User} label="Nome completo" value={profile.nome} />
            <ProfileField icon={Mail} label="E-mail" value={profile.email} />
            <ProfileField icon={Home} label="Apartamento" value={profile.apartamento ? `Apt. ${profile.apartamento}` : '—'} />
            <ProfileField icon={CreditCard} label="CPF" value={profile.cpf ? formatCpf(profile.cpf) : '—'} />
            <ProfileField icon={Calendar} label="Data de entrada" value={profile.data_entrada ? new Date(`${profile.data_entrada}T12:00:00`).toLocaleDateString('pt-BR') : '—'} />
          </div>
        </div>

        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <div style={{ fontWeight: 600, fontSize: 14 }}>Contato</div>
            {!editing ? (
              <button className="btn btn-ghost btn-sm" onClick={() => setEditing(true)}>
                <Edit2 size={13} /> Editar
              </button>
            ) : (
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-ghost btn-sm" onClick={() => setEditing(false)}>
                  <X size={13} /> Cancelar
                </button>
                <button className="btn btn-primary btn-sm" onClick={handleSave} disabled={saving}>
                  {saving ? <Loader2 size={13} style={{ animation: 'spin .6s linear infinite' }} /> : <Save size={13} />}
                  Salvar
                </button>
              </div>
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {editing ? (
              <>
                <div className="form-group">
                  <label className="form-label">URL do avatar</label>
                  <input className="input" value={form.avatar_url} onChange={(e) => setForm((current) => ({ ...current, avatar_url: e.target.value }))} placeholder="https://exemplo.com/avatar.jpg" style={{ '--accent': '#58a6ff' }} />
                </div>
                <div className="form-group">
                  <label className="form-label">WhatsApp</label>
                  <input className="input" value={form.whatsapp} onChange={(e) => setForm((current) => ({ ...current, whatsapp: e.target.value }))} placeholder="(81) 90000-0000" style={{ '--accent': '#58a6ff' }} />
                </div>
              </>
            ) : (
              <ProfileField icon={Phone} label="WhatsApp" value={profile.whatsapp || '—'} />
            )}
          </div>
        </div>

        <div className="card" style={{ marginTop: 20, borderColor: '#58a6ff30', background: 'rgba(88,166,255,0.03)' }}>
          <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 10, color: '#58a6ff' }}>Informações de pagamento</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 13, color: '#8b949e' }}>
            <div><strong style={{ color: '#e6edf3' }}>Vencimento:</strong> todo dia 15 de cada mês</div>
            <div><strong style={{ color: '#e6edf3' }}>Pix:</strong> chave informada pelo síndico</div>
            <div><strong style={{ color: '#e6edf3' }}>Comprovante:</strong> enviar via WhatsApp</div>
            <div><strong style={{ color: '#e6edf3' }}>Multa:</strong> consultar regras do condomínio</div>
          </div>
        </div>
      </div>
    </div>
  )
}

function ProfileField({ icon: Icon, label, value }) {
  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
      <div style={{ width: 36, height: 36, borderRadius: 8, background: '#1c2333', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <Icon size={15} color="#8b949e" />
      </div>
      <div>
        <div style={{ fontSize: 11, color: '#484f58', textTransform: 'uppercase', letterSpacing: '.06em', fontWeight: 600 }}>{label}</div>
        <div style={{ fontSize: 13, fontWeight: 500, marginTop: 1 }}>{value}</div>
      </div>
    </div>
  )
}
