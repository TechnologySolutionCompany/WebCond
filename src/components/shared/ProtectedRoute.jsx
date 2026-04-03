import { Navigate } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'

export function ProtectedRoute({ children, requiredRole }) {
  const { user, accountProfile, canAccessMorador, loading } = useAuth()

  console.log('🔐 ProtectedRoute:', { 
    loading, 
    user: user?.id, 
    profile: accountProfile?.id,
    role: accountProfile?.role, 
    requiredRole,
    hasAccess: accountProfile?.role === requiredRole
  })

  if (loading) {
    console.log('⏳ Ainda está carregando...')
    return (
      <div style={{
        height: '100vh', display: 'flex', alignItems: 'center',
        justifyContent: 'center', background: '#0d1117', flexDirection: 'column', gap: 16
      }}>
        <div style={{ width: 32, height: 32, border: '3px solid #30363d', borderTopColor: '#3fb950', borderRadius: '50%', animation: 'spin .6s linear infinite' }} />
        <div style={{ color: '#8b949e', fontSize: 13 }}>Carregando...</div>
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      </div>
    )
  }

  if (!user) {
    console.log('❌ Usuário não autenticado, redirecionando para /')
    return <Navigate to="/" replace />
  }

  // Se tem usuário mas perfil é null, ainda deixa passar
  if (!accountProfile && user) {
    console.warn('⚠️ Usuário autenticado mas perfil não carregou. Tentando novamente...')
    return (
      <div style={{
        height: '100vh', display: 'flex', alignItems: 'center',
        justifyContent: 'center', background: '#0d1117', flexDirection: 'column', gap: 16
      }}>
        <div style={{ width: 32, height: 32, border: '3px solid #30363d', borderTopColor: '#f0883e', borderRadius: '50%', animation: 'spin .6s linear infinite' }} />
        <div style={{ color: '#8b949e', fontSize: 13 }}>Carregando perfil...</div>
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      </div>
    )
  }

  const hasAccess =
    !requiredRole ||
    accountProfile?.role === requiredRole ||
    (requiredRole === 'morador' && canAccessMorador)

  console.log('✅ Verificação de acesso:', { hasAccess, canAccessMorador, role: accountProfile?.role, requiredRole })

  if (!hasAccess) {
    console.error('❌ Acesso negado! Role:', accountProfile?.role, 'Requerido:', requiredRole)
    return <Navigate to={accountProfile?.role === 'admin' ? '/admin' : '/morador'} replace />
  }

  console.log('✅ Acesso permitido! Renderizando children')
  return children
}
