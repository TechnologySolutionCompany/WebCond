import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { isAdminRole, normalizeRole } from '../lib/auth'
import { getProfileCondominiumId } from '../lib/tenant'

const AuthContext = createContext(null)
const PROFILE_NOT_FOUND_CODE = 'PROFILE_NOT_FOUND'
const CONDOMINIUM_NOT_LINKED_CODE = 'CONDOMINIUM_NOT_LINKED'
const CONDOMINIUM_PENDING_CODE = 'CONDOMINIUM_PENDING'
const CONDOMINIUM_BLOCKED_CODE = 'CONDOMINIUM_BLOCKED'
const CONDOMINIUM_REJECTED_CODE = 'CONDOMINIUM_REJECTED'

function createAuthError(message, code) {
  const error = new Error(message)
  error.code = code
  return error
}

function getAuthIssueMessage(error) {
  if (error?.code === PROFILE_NOT_FOUND_CODE) {
    return 'Sua conta foi autenticada, mas o perfil de acesso nao foi encontrado. Fale com a administracao para concluir seu cadastro.'
  }

  if (error?.code === CONDOMINIUM_NOT_LINKED_CODE) {
    return 'Sua conta esta autenticada, mas ainda nao possui um condominio vinculado corretamente.'
  }

  if (error?.code === CONDOMINIUM_PENDING_CODE) {
    return 'O cadastro do seu condominio foi recebido e ainda esta aguardando aprovacao da plataforma.'
  }

  if (error?.code === CONDOMINIUM_BLOCKED_CODE) {
    return 'O acesso do seu condominio esta temporariamente bloqueado. Entre em contato com a plataforma para regularizar.'
  }

  if (error?.code === CONDOMINIUM_REJECTED_CODE) {
    return 'O cadastro do seu condominio foi rejeitado e precisa ser revisado antes da liberacao do acesso.'
  }

  return 'Nao foi possivel validar seu acesso agora. Tente novamente em alguns instantes.'
}

export const useAuth = () => {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth deve estar dentro de AuthProvider')
  return ctx
}

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [authIssue, setAuthIssue] = useState('')
  const [condominiumStatus, setCondominiumStatus] = useState(null)

  const fetchProfile = async (authUser) => {
    if (!authUser?.id) return null

    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', authUser.id)
      .maybeSingle()

    if (error) throw error
    if (!data) {
      throw createAuthError('Perfil de acesso nao encontrado.', PROFILE_NOT_FOUND_CODE)
    }

    const normalizedRole = normalizeRole(data.role)
    if (normalizedRole === 'platform_admin') {
      return {
        ...data,
        condominium_status: null,
      }
    }

    const nextCondominiumId = getProfileCondominiumId(data)
    if (!nextCondominiumId) {
      throw createAuthError('Condominio nao vinculado ao perfil.', CONDOMINIUM_NOT_LINKED_CODE)
    }

    const { data: condominium, error: condominiumError } = await supabase
      .from('condominiums')
      .select('id, status, name, nome')
      .eq('id', nextCondominiumId)
      .maybeSingle()

    if (condominiumError) throw condominiumError
    if (!condominium) {
      throw createAuthError('Condominio nao encontrado.', CONDOMINIUM_NOT_LINKED_CODE)
    }

    if (condominium.status === 'pending') {
      throw createAuthError('Condominio aguardando aprovacao.', CONDOMINIUM_PENDING_CODE)
    }

    if (condominium.status === 'blocked') {
      throw createAuthError('Condominio bloqueado.', CONDOMINIUM_BLOCKED_CODE)
    }

    if (condominium.status === 'rejected') {
      throw createAuthError('Condominio rejeitado.', CONDOMINIUM_REJECTED_CODE)
    }

    return {
      ...data,
      condominium_status: condominium.status,
    }
  }

  useEffect(() => {
    let isActive = true

    const syncSession = async (session) => {
      if (!isActive) return

      const nextUser = session?.user ?? null
      setUser(nextUser)

      if (!nextUser) {
        setProfile(null)
        setAuthIssue('')
        setCondominiumStatus(null)
        setLoading(false)
        return
      }

      try {
        const nextProfile = await fetchProfile(nextUser)
        if (!isActive) return
        setProfile(nextProfile)
        setCondominiumStatus(nextProfile?.condominium_status || null)
        setAuthIssue('')
      } catch (error) {
        if (!isActive) return
        console.error('Erro ao sincronizar perfil:', error)
        setProfile(null)
        setCondominiumStatus(null)
        setAuthIssue(getAuthIssueMessage(error))
      } finally {
        if (isActive) setLoading(false)
      }
    }

    const bootstrap = async () => {
      try {
        const { data, error } = await supabase.auth.getSession()
        if (error) throw error
        await syncSession(data.session)
      } catch (error) {
        if (!isActive) return
        console.error('Erro ao recuperar sessao:', error)
        setUser(null)
        setProfile(null)
        setCondominiumStatus(null)
        setAuthIssue('Nao foi possivel recuperar sua sessao. Entre novamente.')
        setLoading(false)
      }
    }

    void bootstrap()

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'INITIAL_SESSION') return

      setLoading(true)
      void syncSession(session)
    })

    return () => {
      isActive = false
      subscription.unsubscribe()
    }
  }, [])

  const signIn = (email, password) => supabase.auth.signInWithPassword({ email, password })

  const signOut = async () => {
    await supabase.auth.signOut()
    setUser(null)
    setProfile(null)
    setCondominiumStatus(null)
    setAuthIssue('')
  }

  const refreshProfile = async () => {
    if (!user) return null

    try {
      const nextProfile = await fetchProfile(user)
      setProfile(nextProfile)
      setCondominiumStatus(nextProfile?.condominium_status || null)
      setAuthIssue('')
      return nextProfile
    } catch (error) {
      console.error('Erro ao atualizar perfil:', error)
      setProfile(null)
      setCondominiumStatus(null)
      setAuthIssue(getAuthIssueMessage(error))
      return null
    }
  }

  const resolvedRole = normalizeRole(profile?.role)
  const condominiumId = getProfileCondominiumId(profile)

  const value = useMemo(() => ({
    user,
    profile,
    loading,
    authIssue,
    condominiumId,
    condominiumStatus,
    resolvedRole,
    isAdmin: isAdminRole(resolvedRole),
    signIn,
    signOut,
    refreshProfile,
  }), [user, profile, loading, authIssue, condominiumId, condominiumStatus, resolvedRole])

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}
