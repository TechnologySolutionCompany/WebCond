import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import { DollarSign, Bell, FileText, Home, Phone, Mail, AlertCircle, CheckCircle } from 'lucide-react'

export default function MoradorDashboard() {
  const { profile } = useAuth()
  const [cobrancas, setCobrancas] = useState([])
  const [avisos, setAvisos] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (profile?.id) fetchData()
  }, [profile])

  const fetchData = async () => {
    setLoading(true)
    const [cobRes, avisosRes] = await Promise.all([
      supabase.from('cobrancas').select('*').eq('morador_id', profile.id).order('created_at', { ascending: false }).limit(5),
      supabase.from('avisos').select('*').eq('ativo', true).order('created_at', { ascending: false }).limit(3),
    ])
    setCobrancas(cobRes.data || [])
    setAvisos(avisosRes.data || [])
    setLoading(false)
  }

  if (loading) return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
      <div className="spinner" />
    </div>
  )

  const pendentes = cobrancas.filter(c => !c.pago)
  const totalPendente = pendentes.reduce((s, c) => s + Number(c.valor), 0)

  return (
    <div className="fade-in">
      <div className="page-header">
        <div className="page-title">Olá, {profile?.nome?.split(' ')[0]}! 👋</div>
        <div className="page-subtitle">Bem-vindo ao Eco Living Residência III</div>
      </div>

      {/* Perfil do apartamento */}
      <div className="card" style={{ marginBottom: 24, borderColor: '#388bfd40' }}>
        <div style={{ display: 'flex', gap: 20, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{
            width: 60, height: 60, borderRadius: 14,
            background: '#1a2a3a', border: '2px solid #58a6ff',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 22, fontWeight: 700, color: '#58a6ff', flexShrink: 0,
          }}>
            {profile?.apartamento || '?'}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 16 }}>{profile?.nome}</div>
            <div style={{ display: 'flex', gap: 16, marginTop: 6, flexWrap: 'wrap' }}>
              <InfoItem icon={Home} text={`Apartamento ${profile?.apartamento || '—'}`} />
              {profile?.telefone && <InfoItem icon={Phone} text={profile.telefone} />}
              <InfoItem icon={Mail} text={profile?.email} />
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 11, color: '#8b949e', textTransform: 'uppercase', letterSpacing: '.06em' }}>Condomínio</div>
            <div style={{ fontSize: 13, fontWeight: 600 }}>Eco Living Residência III</div>
            <div style={{ fontSize: 12, color: '#8b949e' }}>Fragoso, Olinda – PE</div>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="stats-grid" style={{ marginBottom: 24 }}>
        <div className="stat-card">
          <div className="label">Em Aberto</div>
          <div className="value" style={{ color: pendentes.length > 0 ? '#f0883e' : '#3fb950' }}>
            {pendentes.length}
          </div>
          <div className="sub">cobranças pendentes</div>
        </div>
        <div className="stat-card">
          <div className="label">Total Pendente</div>
          <div className="value" style={{ color: '#f0883e', fontSize: 20 }}>
            R$ {totalPendente.toFixed(2).replace('.', ',')}
          </div>
          <div className="sub">vencimento dia 15</div>
        </div>
        <div className="stat-card">
          <div className="label">Avisos</div>
          <div className="value" style={{ color: '#58a6ff' }}>{avisos.length}</div>
          <div className="sub">comunicados recentes</div>
        </div>
      </div>

      <div className="grid-2">
        {/* Cobranças pendentes */}
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <DollarSign size={16} color="#58a6ff" />
            <span style={{ fontWeight: 600, fontSize: 14 }}>Minhas Cobranças</span>
          </div>
          {cobrancas.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '20px 0', color: '#8b949e', fontSize: 13 }}>
              <CheckCircle size={24} color="#3fb950" style={{ margin: '0 auto 8px' }} />
              <div>Sem cobranças registradas!</div>
            </div>
          ) : (
            cobrancas.slice(0, 4).map(c => (
              <div key={c.id} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '10px 0', borderBottom: '1px solid var(--border-subtle)',
              }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>{c.descricao || c.tipo}</div>
                  <div style={{ fontSize: 11, color: '#8b949e' }}>{c.mes_referencia} · venc. {c.vencimento ? new Date(c.vencimento+'T12:00:00').toLocaleDateString('pt-BR') : '—'}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div className="mono" style={{ fontWeight: 600, fontSize: 13 }}>R$ {Number(c.valor).toFixed(2).replace('.',',')}</div>
                  <span className={`badge ${c.pago ? 'badge-green' : 'badge-orange'}`} style={{ fontSize: 10 }}>
                    {c.pago ? 'Pago' : 'Pendente'}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Avisos recentes */}
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <Bell size={16} color="#58a6ff" />
            <span style={{ fontWeight: 600, fontSize: 14 }}>Avisos Recentes</span>
          </div>
          {avisos.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '20px 0', color: '#8b949e', fontSize: 13 }}>Nenhum aviso no momento.</div>
          ) : (
            avisos.map(a => (
              <div key={a.id} style={{ padding: '10px 0', borderBottom: '1px solid var(--border-subtle)' }}>
                <div style={{ fontWeight: 600, fontSize: 13 }}>{a.titulo}</div>
                <div style={{ fontSize: 12, color: '#8b949e', marginTop: 3, lineHeight: 1.5 }}>
                  {a.conteudo.length > 100 ? a.conteudo.slice(0, 100) + '...' : a.conteudo}
                </div>
                <div style={{ fontSize: 10, color: '#484f58', marginTop: 4 }}>
                  {new Date(a.created_at).toLocaleDateString('pt-BR')}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Pix info */}
      {pendentes.length > 0 && (
        <div className="card" style={{ marginTop: 20, borderColor: '#f0883e40', background: 'rgba(240,136,62,0.05)' }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
            <AlertCircle size={18} color="#f0883e" style={{ flexShrink: 0, marginTop: 1 }} />
            <div>
              <div style={{ fontWeight: 600, fontSize: 14, color: '#f0883e' }}>Pagamento Pendente</div>
              <div style={{ fontSize: 13, color: '#8b949e', marginTop: 4 }}>
                Você possui <strong style={{color:'#e6edf3'}}>{pendentes.length} cobrança(s)</strong> pendente(s) totalizando{' '}
                <strong style={{color:'#e6edf3'}}>R$ {totalPendente.toFixed(2).replace('.',',')}</strong>.{' '}
                Realize o pagamento via <strong style={{color:'#e6edf3'}}>Pix (Picpay)</strong> até o dia 15.
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function InfoItem({ icon: Icon, text }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: '#8b949e' }}>
      <Icon size={12} />
      <span>{text}</span>
    </div>
  )
}
