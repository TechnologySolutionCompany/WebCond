import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { DEMO_MORADOR_PREVIEW_ID, isDemoMode, supabase } from '../lib/supabase'

const AuthContext = createContext({})

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used within AuthProvider')
  return context
}

export const AuthProvider = ({ children }) => {
  const location = useLocation()
  const [user, setUser] = useState(null)
  const [accountProfile, setAccountProfile] = useState(null)
  const [previewProfile, setPreviewProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  const fetchProfile = async (userId) => {
    if (!userId) return null
    console.log('🔍 Buscando perfil para userId:', userId)
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single()
    
    console.log('📊 Resultado da query:', { data, error: error?.message })
    
    // Se não encontrou MESMO, tenta criar
    if (!data) { 
      console.warn('⚠️ Perfil não encontrado (null). Criando novo perfil para:', userId)
      
      const newProfile = {
        id: userId,
        role: 'admin', // Assume admin por padrão
        nome: 'Administrador Universal',
        email: 'admin@tscbr.com',
        ativo: true,
        apartamento: '',
        telefone: '(81) 90000-0000',
        whatsapp: '(81) 90000-0000',
        cpf: '000.000.000-00',
        data_entrada: '2024-01-01',
        observacao: '',
        created_at: new Date().toISOString(),
      }
      
      try {
        const { data: createdProfile, error: insertError } = await supabase
          .from('profiles')
          .insert([newProfile])
          .select()
          .single()
        
        console.log('✅ Tentativa de criar perfil:', { createdProfile, insertError })
        
        if (createdProfile) {
          console.log('✅ Perfil CRIADO com sucesso:', createdProfile)
          return createdProfile
        }
      } catch (e) {
        console.error('❌ Erro ao criar perfil:', e)
      }
      
      // Se tudo falhar, retorna o perfil que deveria existir
      console.log('⚠️ Retornando profile padrão')
      return newProfile
    }
    
    console.log('✅ Perfil encontrado:', data)
    return data
  }

  useEffect(() => {
    console.log('🔄 useAuth: Inicializando... getDemoMode =' , isDemoMode)
    
    // Get initial session
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      console.log('📋 Session atual:', session?.user?.id)
      setUser(session?.user ?? null)
      if (session?.user) {
        const p = await fetchProfile(session.user.id)
        console.log('🎯 Perfil setado:', p?.id, p?.role)
        setAccountProfile(p)
      }
      console.log('✅ useAuth: Loading = false')
      setLoading(false)
    })

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      console.log('🔐 Auth evento:', _event, session?.user?.id)
      setUser(session?.user ?? null)
      if (session?.user) {
        const p = await fetchProfile(session.user.id)
        setAccountProfile(p)
      } else {
        setAccountProfile(null)
        setPreviewProfile(null)
      }
      setLoading(false)
    })

    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    const loadPreviewProfile = async () => {
      const shouldPreviewMorador =
        isDemoMode &&
        accountProfile?.role === 'admin' &&
        location.pathname.startsWith('/morador')

      if (!shouldPreviewMorador) {
        setPreviewProfile(null)
        return
      }

      const p = await fetchProfile(DEMO_MORADOR_PREVIEW_ID)
      setPreviewProfile(p)
    }

    loadPreviewProfile()
  }, [accountProfile, location.pathname])

  const profile = useMemo(() => previewProfile || accountProfile, [previewProfile, accountProfile])
  const previewingMoradorView = Boolean(previewProfile)
  const canAccessMorador = accountProfile?.role === 'admin' || accountProfile?.role === 'morador'

  const signIn = async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    return { data, error }
  }

  const signOut = async () => {
    await supabase.auth.signOut()
    setUser(null)
    setAccountProfile(null)
    setPreviewProfile(null)
  }

  const refreshProfile = async () => {
    if (accountProfile?.id) {
      const p = await fetchProfile(accountProfile.id)
      setAccountProfile(p)
    }
    if (previewProfile?.id) {
      const p = await fetchProfile(previewProfile.id)
      setPreviewProfile(p)
    }
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        accountProfile,
        previewProfile,
        previewingMoradorView,
        canAccessMorador,
        loading,
        signIn,
        signOut,
        refreshProfile,
        isAdmin: accountProfile?.role === 'admin',
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}
