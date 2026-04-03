import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import { DollarSign, CheckCircle } from 'lucide-react'

const TIPOS_LABEL = { condominio:'Condomínio', agua:'Água', energia:'Energia', multa:'Multa', outro:'Outro' }

export default function MoradorCobrancas() {
  const { profile } = useAuth()
  const [cobrancas, setCobrancas] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('todas')

  useEffect(() => {
    if (profile?.id) fetch()
  }, [profile])

  const fetch = async () => {
    setLoading(true)
    const { data } = await supabase
      .from('cobrancas').select('*')
      .eq('morador_id', profile.id)
      .order('created_at', { ascending: false })
    setCobrancas(data || [])
    setLoading(false)
  }

  const filtered = cobrancas.filter(c => {
    if (filter === 'pendentes') return !c.pago
    if (filter === 'pagas') return c.pago
    return true
  })

  const totalPendente = cobrancas.filter(c => !c.pago).reduce((s,c)=>s+Number(c.valor),0)
  const totalPago = cobrancas.filter(c => c.pago).reduce((s,c)=>s+Number(c.valor),0)

  return (
    <div className="fade-in">
      <div className="page-header">
        <div className="page-title">Minhas Cobranças</div>
        <div className="page-subtitle">Histórico financeiro do seu apartamento</div>
      </div>

      <div className="stats-grid" style={{ marginBottom: 20 }}>
        <div className="stat-card">
          <div className="label">Pendente</div>
          <div className="value" style={{ color: '#f0883e', fontSize: 20 }}>R$ {totalPendente.toFixed(2).replace('.',',')}</div>
          <div className="sub">Pagar até dia 15 via Pix</div>
        </div>
        <div className="stat-card">
          <div className="label">Total Pago</div>
          <div className="value" style={{ color: '#3fb950', fontSize: 20 }}>R$ {totalPago.toFixed(2).replace('.',',')}</div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {['todas','pendentes','pagas'].map(f => (
          <button key={f} className={`btn ${filter===f?'btn-primary':'btn-ghost'} btn-sm`} onClick={() => setFilter(f)}>
            {f.charAt(0).toUpperCase()+f.slice(1)}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ display:'flex', justifyContent:'center', padding:60 }}><div className="spinner"/></div>
      ) : filtered.length === 0 ? (
        <div className="empty-state">
          <CheckCircle size={40} color="#3fb950" />
          <p>Nenhuma cobrança {filter !== 'todas' ? filter : ''} encontrada.</p>
        </div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Descrição</th>
                <th>Tipo</th>
                <th>Referência</th>
                <th>Vencimento</th>
                <th>Valor</th>
                <th>Status</th>
                <th>Pgto.</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(c => (
                <tr key={c.id}>
                  <td>{c.descricao || TIPOS_LABEL[c.tipo] || c.tipo}</td>
                  <td><span className="badge badge-blue">{TIPOS_LABEL[c.tipo] || c.tipo}</span></td>
                  <td className="mono" style={{ color:'#8b949e' }}>{c.mes_referencia}</td>
                  <td style={{ color:'#8b949e' }}>{c.vencimento ? new Date(c.vencimento+'T12:00:00').toLocaleDateString('pt-BR') : '—'}</td>
                  <td className="mono" style={{ fontWeight:600 }}>R$ {Number(c.valor).toFixed(2).replace('.',',')}</td>
                  <td><span className={`badge ${c.pago?'badge-green':'badge-orange'}`}>{c.pago?'Pago':'Pendente'}</span></td>
                  <td style={{ color:'#8b949e', fontSize:12 }}>{c.data_pagamento ? new Date(c.data_pagamento+'T12:00:00').toLocaleDateString('pt-BR') : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {cobrancas.some(c => !c.pago) && (
        <div className="card" style={{ marginTop:20, textAlign:'center', borderColor:'#58a6ff40' }}>
          <DollarSign size={20} color="#58a6ff" style={{ margin:'0 auto 8px' }} />
          <div style={{ fontWeight:600, marginBottom:6 }}>Pague via Pix – Picpay</div>
          <div style={{ fontSize:13, color:'#8b949e' }}>Após o pagamento, envie o comprovante pelo WhatsApp para confirmar.</div>
        </div>
      )}
    </div>
  )
}
