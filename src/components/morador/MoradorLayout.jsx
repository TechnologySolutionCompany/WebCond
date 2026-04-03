import { useState } from 'react'
import { LayoutDashboard, DollarSign, Bell, FileText, User } from 'lucide-react'
import Sidebar from '../shared/Sidebar'
import MoradorDashboard from './Dashboard'
import MoradorCobrancas from './Cobrancas'
import { MoradorAvisos, MoradorDocumentos } from './AvisosDocumentos'
import MoradorPerfil from './Perfil'

const NAV = [
  {
    label: 'Meu Espaço',
    items: [
      { key: 'dashboard', label: 'Início', icon: LayoutDashboard },
      { key: 'cobrancas', label: 'Minhas Cobranças', icon: DollarSign },
      { key: 'avisos', label: 'Avisos', icon: Bell },
      { key: 'documentos', label: 'Documentos', icon: FileText },
    ]
  },
  {
    label: 'Conta',
    items: [
      { key: 'perfil', label: 'Meu Perfil', icon: User },
    ]
  }
]

const PAGES = {
  dashboard: MoradorDashboard,
  cobrancas: MoradorCobrancas,
  avisos: MoradorAvisos,
  documentos: MoradorDocumentos,
  perfil: MoradorPerfil,
}

export default function MoradorLayout() {
  const [activePage, setActivePage] = useState('dashboard')
  const Page = PAGES[activePage] || MoradorDashboard

  console.log('🎨 MoradorLayout renderizado. Page ativa:', activePage)

  return (
    <div className="app-layout theme-morador">
      <Sidebar items={NAV} activeKey={activePage} onNav={setActivePage} theme="morador" />
      <main className="main-content">
        <div className="page-content">
          <Page />
        </div>
      </main>
    </div>
  )
}
