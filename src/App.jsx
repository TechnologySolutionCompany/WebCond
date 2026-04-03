import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './hooks/useAuth'
import { ToastProvider } from './components/shared/Toast'
import { ProtectedRoute } from './components/shared/ProtectedRoute'
import Landing from './pages/Landing'
import AdminLayout from './components/admin/AdminLayout'
import MoradorLayout from './components/morador/MoradorLayout'
import './styles/global.css'

export default function App() {
  console.log('🚀 App renderizado')
  
  return (
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route
              path="/admin"
              element={
                <ProtectedRoute requiredRole="admin">
                  <AdminLayout />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/*"
              element={
                <ProtectedRoute requiredRole="admin">
                  <AdminLayout />
                </ProtectedRoute>
              }
            />
            <Route
              path="/morador"
              element={
                <ProtectedRoute requiredRole="morador">
                  <MoradorLayout />
                </ProtectedRoute>
              }
            />
            <Route
              path="/morador/*"
              element={
                <ProtectedRoute requiredRole="morador">
                  <MoradorLayout />
                </ProtectedRoute>
              }
            />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}
