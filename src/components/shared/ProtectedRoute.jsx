import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { getHomePathForRole, hasRequiredRole } from '../../lib/auth'

export function ProtectedRoute({ children, requiredRole }) {
  const { user, resolvedRole, loading, authIssue } = useAuth()
  const location = useLocation()

  if (loading) {
    return (
      <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#0d1117', gap: 16 }}>
        <div style={{ width: 32, height: 32, border: '3px solid #30363d', borderTopColor: '#3fb950', borderRadius: '50%', animation: 'spin .6s linear infinite' }} />
        <div style={{ color: '#8b949e', fontSize: 13 }}>Carregando...</div>
        <style>{'@keyframes spin{to{transform:rotate(360deg)}}'}</style>
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/" replace state={{ from: location.pathname }} />
  }

  if (authIssue) {
    return <Navigate to="/" replace state={{ from: location.pathname }} />
  }

  if (!resolvedRole) {
    return <Navigate to="/" replace state={{ from: location.pathname }} />
  }

  if (!hasRequiredRole(resolvedRole, requiredRole)) {
    return <Navigate to={getHomePathForRole(resolvedRole)} replace />
  }

  return children
}
