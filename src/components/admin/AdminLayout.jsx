import { useState, useEffect } from 'react'
import { LayoutDashboard, Users, DollarSign, Bell, FileText, ClipboardList } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import Sidebar from '../shared/Sidebar'
import Dashboard from './Dashboard'
import Moradores from './Moradores'
import Cobrancas from './Cobrancas'
import Avisos from './Avisos'
import Documentos from './Documentos'
import Solicitacoes from './Solicitacoes'

export default function AdminLayout() {
  const [activePage, setActivePage] = useState('dashboard')
  const [pendentes, setPendentes] = useState(0)

  useEffect(() => {
    const fetchPendentes = async () => {
      const { count } = await supabase
        .from('solicitacoes_cadastro')
        .select('id', { count: 'exact' })
        .eq('status', 'pendente')
      setPendentes(count || 0)
    }
    fetchPendentes()
    // Polling a cada 30s
    const interval = setInterval(fetchPendentes, 30000)
    return () => clearInterval(interval)
  }, [])

  const NAV = [
    {
      label: 'Principal',
      items: [
        { key: 'dashboard', label: 'Painel', icon: LayoutDashboard },
        { key: 'moradores', label: 'Moradores', icon: Users },
        { key: 'cobrancas', label: 'Cobranças', icon: DollarSign },
      ]
    },
    {
      label: 'Comunicação',
      items: [
        { key: 'avisos', label: 'Avisos', icon: Bell },
        { key: 'documentos', label: 'Documentos', icon: FileText },
      ]
    },
    {
      label: 'Acesso',
      items: [
        { key: 'solicitacoes', label: 'Solicitações', icon: ClipboardList, badge: pendentes },
      ]
    },
  ]

  const PAGES = {
    dashboard: Dashboard,
    moradores: Moradores,
    cobrancas: Cobrancas,
    avisos: Avisos,
    documentos: Documentos,
    solicitacoes: Solicitacoes,
  }

  const Page = PAGES[activePage] || Dashboard

  return (
    <div className="app-layout">
      <Sidebar items={NAV} activeKey={activePage} onNav={setActivePage} theme="admin" />
      <main className="main-content">
        <div className="page-content">
          <Page />
        </div>
      </main>
    </div>
  )
}
