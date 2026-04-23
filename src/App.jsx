import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './hooks/useAuth'
import { ThemeProvider } from './hooks/useTheme'
import { ToastProvider } from './components/shared/Toast'
import { ProtectedRoute } from './components/shared/ProtectedRoute'
import Landing from './pages/Landing'
import AdminLayout from './components/admin/AdminLayout'
import MoradorLayout from './components/morador/MoradorLayout'
import PlatformLayout from './components/platform/PlatformLayout'
import './styles/global.css'

export default function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <AuthProvider>
          <ToastProvider>
            <Routes>
              <Route path="/" element={<Landing/>}/>
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
          </ToastProvider>
        </AuthProvider>
      </BrowserRouter>
    </ThemeProvider>
  )
}
