import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useToast } from '../shared/Toast'
import { useAuth } from '../../hooks/useAuth'
import { applyTenantFilter } from '../../lib/tenant'
import { Download, FileText, Users, DollarSign, AlertCircle } from 'lucide-react'
import Papa from 'papaparse'

export default function Contador() {
  const [loading, setLoading] = useState(false)
  const [filters, setFilters] = useState({ mes: '', ano: '' })
  const { condominiumId } = useAuth()
  const { toast } = useToast()

  const exportMoradores = async () => {
    setLoading(true)
    const { data } = await applyTenantFilter(
      supabase.from('profiles').select('*').in('role', ['morador', 'RESIDENT']),
      condominiumId,
    )
    const csv = Papa.unparse(data.map(m => ({
      Nome: m.nome,
      Email: m.email,
      Apartamento: m.apartamento,
      WhatsApp: m.whatsapp,
      CPF: m.cpf,
      Ativo: m.ativo ? 'Sim' : 'Não',
      'Data Entrada': m.data_entrada
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
    const csv = Papa.unparse(data.map(c => ({
      Morador: c.profiles?.nome,
      Apartamento: c.profiles?.apartamento,
      Descrição: c.descricao,
      Valor: c.valor,
      Tipo: c.tipo,
      'Mês Referência': c.mes_referencia,
      Vencimento: c.vencimento,
      Pago: c.pago ? 'Sim' : 'Não',
      'Data Pagamento': c.data_pagamento
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
    const csv = Papa.unparse(data.map(c => ({
      Morador: c.profiles?.nome,
      Apartamento: c.profiles?.apartamento,
      Descrição: c.descricao,
      Valor: c.valor,
      Vencimento: c.vencimento,
      Dias: Math.floor((new Date() - new Date(c.vencimento)) / (1000 * 60 * 60 * 24))
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
    const totalRecebido = cobrancas.filter(c => c.pago).reduce((s, c) => s + Number(c.valor), 0)
    const totalPendente = cobrancas.filter(c => !c.pago).reduce((s, c) => s + Number(c.valor), 0)
    const porTipo = cobrancas.reduce((acc, c) => {
      acc[c.tipo] = (acc[c.tipo] || 0) + Number(c.valor)
      return acc
    }, {})
    const csv = Papa.unparse([{
      'Total Recebido': totalRecebido,
      'Total Pendente': totalPendente,
      ...porTipo
    }])
    downloadCSV(csv, 'resumo_financeiro.csv')
    setLoading(false)
  }

  const downloadCSV = (csv, filename) => {
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
    toast('Arquivo baixado!', 'success')
  }

  return (
    <div className="fade-in">
      <div className="page-header">
        <div className="page-title">Relatórios para Contador</div>
        <div className="page-subtitle">Exporte dados em CSV para análise financeira</div>
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
              <div style={{ fontWeight: 600 }}>Cobranças</div>
              <div style={{ fontSize: 12, color: '#8b949e' }}>Histórico de cobranças</div>
            </div>
          </div>
          <div style={{ marginBottom: 12 }}>
            <input className="input" type="month" placeholder="Mês/Ano" value={`${filters.ano}-${filters.mes}`} onChange={e => {
              const [ano, mes] = e.target.value.split('-')
              setFilters({ ano, mes })
            }} />
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
              <div style={{ fontSize: 12, color: '#8b949e' }}>Cobranças vencidas</div>
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
              <div style={{ fontWeight: 600 }}>Resumo Financeiro</div>
              <div style={{ fontSize: 12, color: '#8b949e' }}>Totais por categoria</div>
            </div>
          </div>
          <button className="btn btn-primary" onClick={exportResumo} disabled={loading}>
            <Download size={14} /> Exportar CSV
          </button>
        </div>
      </div>
    </div>
  )
}
