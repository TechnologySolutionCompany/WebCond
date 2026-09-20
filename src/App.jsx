import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './hooks/useAuth'
import { ThemeProvider } from './hooks/useTheme'
import { ToastProvider } from './components/shared/Toast'
import { ProtectedRoute } from './components/shared/ProtectedRoute'
import Landing from './pages/Landing'
import Politicas from './pages/Politicas'
import './styles/global.css'

// Cada painel vira um chunk separado: o usuario so baixa o codigo do perfil em que entrou.
const AdminLayout = lazy(() => import('./components/admin/AdminLayout'))
const MoradorLayout = lazy(() => import('./components/morador/MoradorLayout'))
const PlatformLayout = lazy(() => import('./components/platform/PlatformLayout'))

const routeFallback = <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><div className="spinner" /></div>

export default function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <AuthProvider>
          <ToastProvider>
            <Suspense fallback={routeFallback}>
              <Routes>
                <Route path="/" element={<Landing/>}/>
                <Route path="/politicas/:slug" element={<Politicas/>}/>
                <Route path="/admin/*" element={
                  <ProtectedRoute requiredRole={['admin', 'contador']}><AdminLayout/></ProtectedRoute>
                }/>
                <Route path="/platform/*" element={
                  <ProtectedRoute requiredRole="platform_admin"><PlatformLayout/></ProtectedRoute>
                }/>
                <Route path="/morador/*" element={
                  <ProtectedRoute requiredRole="morador"><MoradorLayout/></ProtectedRoute>
                }/>
                <Route path="*" element={<Navigate to="/" replace/>}/>
              </Routes>
            </Suspense>
          </ToastProvider>
        </AuthProvider>
      </BrowserRouter>
    </ThemeProvider>
  )
}
