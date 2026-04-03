import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { Users, DollarSign, Bell, FileText, TrendingUp, AlertCircle } from 'lucide-react'

export default function AdminDashboard() {
  const [stats, setStats] = useState({ moradores: 0, pendentes: 0, recebido: 0, avisos: 0 })
  const [cobrancasRecentes, setCobrancasRecentes] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchStats()
  }, [])

  const fetchStats = async () => {
    try {
      const [moradores, cobrancas, avisos] = await Promise.all([
        supabase.from('profiles').select('id', { count: 'exact' }).eq('role', 'morador').eq('ativo', true),
        supabase.from('cobrancas').select('valor, pago').order('created_at', { ascending: false }).limit(10),
        supabase.from('avisos').select('id', { count: 'exact' }).eq('ativo', true),
      ])

      const allCob = cobrancas.data || []
      const pendentes = allCob.filter(c => !c.pago).length
      const recebido = allCob.filter(c => c.pago).reduce((s, c) => s + Number(c.valor), 0)

      setStats({
        moradores: moradores.count || 0,
        pendentes,
        recebido,
        avisos: avisos.count || 0,
      })
      setCobrancasRecentes(allCob.slice(0, 5))
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  if (loading) return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
      <div className="spinner" />
    </div>
  )

  return (
    <div className="fade-in">
      <div className="page-header">
        <div className="page-title">Painel do Administrador</div>
        <div className="page-subtitle">Visão geral do Eco Living Residência III</div>
      </div>

      {/* Stats */}
      <div className="stats-grid">
        <StatCard icon={Users} label="Moradores Ativos" value={stats.moradores} color="green" />
        <StatCard icon={AlertCircle} label="Cobranças Pendentes" value={stats.pendentes} color="orange" />
        <StatCard icon={DollarSign} label="Recebido (período)" value={`R$ ${stats.recebido.toFixed(2).replace('.', ',')}`} color="blue" />
        <StatCard icon={Bell} label="Avisos Ativos" value={stats.avisos} color="purple" />
      </div>

      {/* Info condomínio */}
      <div className="grid-2" style={{ marginBottom: 24 }}>
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <TrendingUp size={16} color="#3fb950" />
            <span style={{ fontWeight: 600, fontSize: 14 }}>Informações do Condomínio</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <InfoRow label="Endereço" value="Fragoso, Olinda – PE" />
            <InfoRow label="Total de Apartamentos" value="16 unidades (4 andares)" />
            <InfoRow label="Vencimento das Cobranças" value="Todo dia 15" />
            <InfoRow label="Chave Pix" value="Via Picpay" />
            <InfoRow label="WhatsApp Automation" value="Evolution API" />
          </div>
        </div>

        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <FileText size={16} color="#3fb950" />
            <span style={{ fontWeight: 600, fontSize: 14 }}>Tipos de Cobrança</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <InfoRow label="Taxa de Condomínio" value="Fixa mensal" badge="green" />
            <InfoRow label="Água" value="Medição individual" badge="blue" />
            <InfoRow label="Energia (áreas comuns)" value="Rateio variável" badge="orange" />
            <InfoRow label="Multa por atraso" value="Sistema 3 advertências" badge="red" />
          </div>
        </div>
      </div>

      {/* Cobranças recentes */}
      {cobrancasRecentes.length > 0 && (
        <div className="card">
          <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 16 }}>Cobranças Recentes</div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Descrição</th>
                  <th>Valor</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {cobrancasRecentes.map((c, i) => (
                  <tr key={i}>
                    <td>{c.descricao || '—'}</td>
                    <td className="mono">R$ {Number(c.valor).toFixed(2).replace('.', ',')}</td>
                    <td>
                      <span className={`badge ${c.pago ? 'badge-green' : 'badge-orange'}`}>
                        {c.pago ? 'Pago' : 'Pendente'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

function StatCard({ icon: Icon, label, value, color }) {
  const colors = { green: '#3fb950', blue: '#58a6ff', orange: '#f0883e', purple: '#bc8cff' }
  const dims = { green: '#1a3a24', blue: '#1a2a3a', orange: '#3a2010', purple: '#2a1a3a' }
  const c = colors[color]
  const d = dims[color]
  return (
    <div className="stat-card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div className="label">{label}</div>
        <div style={{ background: d, borderRadius: 8, padding: 6, display: 'flex' }}>
          <Icon size={16} color={c} />
        </div>
      </div>
      <div className="value" style={{ color: c }}>{value}</div>
    </div>
  )
}

function InfoRow({ label, value, badge }) {
  const badgeMap = { green: 'badge-green', blue: 'badge-blue', orange: 'badge-orange', red: 'badge-red' }
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13 }}>
      <span style={{ color: '#8b949e' }}>{label}</span>
      {badge
        ? <span className={`badge ${badgeMap[badge]}`}>{value}</span>
        : <span style={{ fontWeight: 500 }}>{value}</span>
      }
    </div>
  )
}
