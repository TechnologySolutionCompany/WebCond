import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useToast } from '../shared/Toast'
import { useAuth } from '../../hooks/useAuth'
import { applyTenantFilter } from '../../lib/tenant'
import { Download, FileText, Users, DollarSign, AlertCircle } from 'lucide-react'
import Papa from 'papaparse'
import { buildChargeStatusChartData } from '../../lib/chargeStatus'
import ChargesStatusChart from '../shared/ChargesStatusChart'

function getMoradiaFromObservation(observacao = '') {
  try {
    const meta = JSON.parse(observacao || '{}')
    return meta.status_moradia || 'morando'
  } catch {
    return 'morando'
  }
}

export default function Contador() {
  const [loading, setLoading] = useState(false)
  const [filters, setFilters] = useState({ mes: '', ano: '' })
  const [chartCharges, setChartCharges] = useState([])
  const { condominiumId } = useAuth()
  const { toast } = useToast()

  useEffect(() => {
    void fetchChartData()
  }, [condominiumId])

  const fetchChartData = async () => {
    const { data } = await applyTenantFilter(
      supabase
        .from('cobrancas')
        .select('id, valor, pago, payment_status, vencimento, mes_referencia, created_at')
        .order('created_at', { ascending: false }),
      condominiumId,
    )

    setChartCharges(data || [])
  }

  const chartData = useMemo(() => buildChargeStatusChartData(chartCharges), [chartCharges])

  const exportMoradores = async () => {
    setLoading(true)
    const { data } = await applyTenantFilter(
      supabase.from('profiles').select('*').in('role', ['morador', 'RESIDENT']),
      condominiumId,
    )

    const csv = Papa.unparse((data || []).map((morador) => ({
      Nome: morador.nome,
      Apartamento: morador.apartamento,
      WhatsApp: morador.whatsapp,
      CPF: morador.cpf,
      Ativo: morador.ativo ? 'Sim' : 'Nao',
      Moradia: getMoradiaFromObservation(morador.observacao),
    })))

    downloadCSV(csv, 'moradores.csv')
    setLoading(false)
  }

  const exportCobrancas = async () => {
    setLoading(true)
    let query = supabase.from('cobrancas').select('*, profiles:morador_id(nome, apartamento)')

    if (filters.mes && filters.ano) {
      const start = `${filters.ano}-${filters.mes.padStart(2, '0')}-01`
      const end = new Date(filters.ano, filters.mes, 0).toISOString().split('T')[0]
      query = query.gte('created_at', start).lte('created_at', end)
    }

    const { data } = await applyTenantFilter(query, condominiumId)
    const csv = Papa.unparse((data || []).map((cobranca) => ({
      Morador: cobranca.profiles?.nome,
      Apartamento: cobranca.profiles?.apartamento,
      Descricao: cobranca.descricao,
      Valor: cobranca.valor,
      Tipo: cobranca.tipo,
      Referencia: cobranca.mes_referencia,
      Vencimento: cobranca.vencimento,
      Pago: cobranca.pago ? 'Sim' : 'Nao',
      DataPagamento: cobranca.data_pagamento,
    })))

    downloadCSV(csv, 'cobrancas.csv')
    setLoading(false)
  }

  const exportInadimplentes = async () => {
    setLoading(true)
    const query = supabase
      .from('cobrancas')
      .select('*, profiles:morador_id(nome, apartamento)')
      .eq('pago', false)
      .lt('vencimento', new Date().toISOString().split('T')[0])

    const { data } = await applyTenantFilter(query, condominiumId)
    const csv = Papa.unparse((data || []).map((cobranca) => ({
      Morador: cobranca.profiles?.nome,
      Apartamento: cobranca.profiles?.apartamento,
      Descricao: cobranca.descricao,
      Valor: cobranca.valor,
      Vencimento: cobranca.vencimento,
      Dias: Math.floor((new Date() - new Date(cobranca.vencimento)) / (1000 * 60 * 60 * 24)),
    })))

    downloadCSV(csv, 'inadimplentes.csv')
    setLoading(false)
  }

  const exportResumo = async () => {
    setLoading(true)
    const { data: cobrancas } = await applyTenantFilter(
      supabase.from('cobrancas').select('valor, pago, tipo'),
      condominiumId,
    )

    const rows = cobrancas || []
    const totalRecebido = rows.filter((item) => item.pago).reduce((sum, item) => sum + Number(item.valor || 0), 0)
    const totalPendente = rows.filter((item) => !item.pago).reduce((sum, item) => sum + Number(item.valor || 0), 0)
    const porTipo = rows.reduce((acc, item) => {
      acc[item.tipo] = (acc[item.tipo] || 0) + Number(item.valor || 0)
      return acc
    }, {})

    const csv = Papa.unparse([{
      TotalRecebido: totalRecebido,
      TotalPendente: totalPendente,
      ...porTipo,
    }])

    downloadCSV(csv, 'resumo_financeiro.csv')
    setLoading(false)
  }

  const downloadCSV = (csv, filename) => {
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = filename
    anchor.click()
    URL.revokeObjectURL(url)
    toast('Arquivo baixado!', 'success')
  }

  return (
    <div className="fade-in">
      <div className="page-header">
        <div className="page-title">Relatorios</div>
        <div className="page-subtitle">Exporte dados e acompanhe a evolucao das cobrancas do condominio</div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 20 }}>
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
            <Users size={24} color="#58a6ff" />
            <div>
              <div style={{ fontWeight: 600 }}>Moradores</div>
              <div style={{ fontSize: 12, color: '#8b949e' }}>Lista completa de moradores</div>
            </div>
          </div>
          <button className="btn btn-primary" onClick={exportMoradores} disabled={loading}>
            <Download size={14} /> Exportar CSV
          </button>
        </div>

        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
            <DollarSign size={24} color="#3fb950" />
            <div>
              <div style={{ fontWeight: 600 }}>Cobrancas</div>
              <div style={{ fontSize: 12, color: '#8b949e' }}>Historico de cobrancas</div>
            </div>
          </div>
          <div style={{ marginBottom: 12 }}>
            <input
              className="input"
              type="month"
              placeholder="Mes/Ano"
              value={filters.ano && filters.mes ? `${filters.ano}-${filters.mes}` : ''}
              onChange={(event) => {
                const [ano, mes] = event.target.value.split('-')
                setFilters({ ano: ano || '', mes: mes || '' })
              }}
            />
          </div>
          <button className="btn btn-primary" onClick={exportCobrancas} disabled={loading}>
            <Download size={14} /> Exportar CSV
          </button>
        </div>

        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
            <AlertCircle size={24} color="#f0883e" />
            <div>
              <div style={{ fontWeight: 600 }}>Inadimplentes</div>
              <div style={{ fontSize: 12, color: '#8b949e' }}>Cobrancas vencidas</div>
            </div>
          </div>
          <button className="btn btn-primary" onClick={exportInadimplentes} disabled={loading}>
            <Download size={14} /> Exportar CSV
          </button>
        </div>

        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
            <FileText size={24} color="#bc8cff" />
            <div>
              <div style={{ fontWeight: 600 }}>Resumo financeiro</div>
              <div style={{ fontSize: 12, color: '#8b949e' }}>Totais por categoria</div>
            </div>
          </div>
          <button className="btn btn-primary" onClick={exportResumo} disabled={loading}>
            <Download size={14} /> Exportar CSV
          </button>
        </div>
      </div>

      <div className="card" style={{ marginTop: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <FileText size={20} color="#58a6ff" />
          <div>
            <div style={{ fontWeight: 600 }}>Status das cobrancas por competencia</div>
            <div style={{ fontSize: 12, color: '#8b949e' }}>Visao consolidada para acompanhamento financeiro</div>
          </div>
        </div>
        <ChargesStatusChart data={chartData} />
      </div>
    </div>
  )
}
