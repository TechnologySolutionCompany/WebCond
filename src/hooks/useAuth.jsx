import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { isAdminRole, normalizeRole } from '../lib/auth'
import { getProfileCondominiumId } from '../lib/tenant'
import { getCondominiumAccessState } from '../lib/condominiumPlan'
import { ACTIVITY_TICK_MS, isAwayTooLong, markActivity, readLastActivity } from '../lib/sessionActivity'
import { HEARTBEAT_MS } from '../lib/presence'
import { detachPushOnSignOut, syncPushOwner } from '../lib/pushNotifications'

const AWAY_NOTICE = 'Sua sessao foi encerrada porque o WebCond ficou fechado por mais de 5 minutos. Entre novamente.'

// Sinal de presenca do sindico para o painel da plataforma. Falha em silencio: presenca e
// informativa e nunca pode atrapalhar o uso do sistema (ex.: SQL 09-25 ainda nao aplicado).
async function sendPresence(evento) {
  try {
    await supabase.rpc('registrar_presenca', { evento })
  } catch {
    // ignorado de proposito
  }
}

const AuthContext = createContext(null)
const PROFILE_NOT_FOUND_CODE = 'PROFILE_NOT_FOUND'
const CONDOMINIUM_NOT_LINKED_CODE = 'CONDOMINIUM_NOT_LINKED'
const CONDOMINIUM_PENDING_CODE = 'CONDOMINIUM_PENDING'
const CONDOMINIUM_BLOCKED_CODE = 'CONDOMINIUM_BLOCKED'
const CONDOMINIUM_REJECTED_CODE = 'CONDOMINIUM_REJECTED'
const CONDOMINIUM_TRIAL_EXPIRED_CODE = 'CONDOMINIUM_TRIAL_EXPIRED'

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

  if (error?.code === CONDOMINIUM_TRIAL_EXPIRED_CODE) {
    return 'O periodo de teste do seu condominio terminou. Para continuar usando o sistema, escolha um plano (ONE, PRO ou MAX).'
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
  const [sessionNotice, setSessionNotice] = useState('')
  const userRef = useRef(null)

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
    // Admin e equipe de suporte da plataforma nao pertencem a nenhum condominio.
    if (normalizedRole === 'platform_admin' || normalizedRole === 'suporte') {
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
      .select('id, status, name, nome, metadata, created_at, updated_at')
      .eq('id', nextCondominiumId)
      .maybeSingle()

    if (condominiumError) throw condominiumError
    if (!condominium) {
      throw createAuthError('Condominio nao encontrado.', CONDOMINIUM_NOT_LINKED_CODE)
    }

    const accessState = getCondominiumAccessState(condominium)

    if (accessState.effectiveStatus === 'pending') {
      throw createAuthError('Condominio aguardando aprovacao.', CONDOMINIUM_PENDING_CODE)
    }

    if (accessState.effectiveStatus === 'blocked') {
      throw createAuthError('Condominio bloqueado.', CONDOMINIUM_BLOCKED_CODE)
    }

    if (accessState.effectiveStatus === 'rejected') {
      throw createAuthError('Condominio rejeitado.', CONDOMINIUM_REJECTED_CODE)
    }

    // Unidades da pessoa (um proprietario pode ter varias). Sem vinculos, vale o apartamento do perfil.
    const { data: unitLinks } = await supabase
      .from('unidade_vinculos')
      .select('vinculo, unidades(numero)')
      .eq('profile_id', data.id)
    const links = (unitLinks || [])
      .filter((link) => link.unidades?.numero)
      .map((link) => ({ numero: link.unidades.numero, vinculo: link.vinculo }))
    const unitNumbers = links.map((link) => link.numero)

    return {
      ...data,
      unit_numbers: unitNumbers.length ? unitNumbers : [data.apartamento].filter(Boolean),
      unit_links: links,
      // Proprietario em pelo menos uma unidade: pode solicitar alteracao de cadastro e ve o inquilino.
      is_owner: links.length ? links.some((link) => link.vinculo === 'proprietario') : data.vinculo !== 'inquilino',
      condominium_status: accessState.effectiveStatus,
      condominium_plan_attention: accessState.planAttention,
      condominium_document_limit: accessState.documentLimit,
      condominium_plan_name: accessState.planName,
      condominium_subscription_status: accessState.subscriptionStatus,
      condominium_plan_ends_at: accessState.planEndsAt,
      condominium_plan_days_left: accessState.planDaysLeft,
      condominium_plan_locked: accessState.planLocked,
      condominium_plan_expiring_soon: accessState.planExpiringSoon,
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

        // Voltou depois de mais de 5 minutos com o sistema fechado: entra de novo.
        if (data.session && isAwayTooLong(readLastActivity())) {
          await supabase.auth.signOut({ scope: 'local' })
          markActivity()
          if (isActive) setSessionNotice(AWAY_NOTICE)
          await syncSession(null)
          return
        }

        markActivity()
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
      if (event === 'SIGNED_IN') {
        markActivity()
        setSessionNotice('')
      }

      setLoading(true)
      void syncSession(session)
    })

    return () => {
      isActive = false
      subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    userRef.current = user
  }, [user])

  // Carimbo de atividade enquanto o sistema esta aberto. Se o carimbo anterior for antigo demais
  // (computador suspenso, aba congelada pelo navegador), a sessao e encerrada do mesmo jeito.
  useEffect(() => {
    const tick = () => {
      if (userRef.current && isAwayTooLong(readLastActivity())) {
        void supabase.auth.signOut({ scope: 'local' }).then(() => setSessionNotice(AWAY_NOTICE))
        markActivity()
        return
      }
      markActivity()
    }
    const onVisibility = () => { if (document.visibilityState === 'visible') tick(); else markActivity() }
    const interval = window.setInterval(tick, ACTIVITY_TICK_MS)
    document.addEventListener('visibilitychange', onVisibility)
    const onPageHide = () => markActivity()
    window.addEventListener('pagehide', onPageHide)
    return () => {
      window.clearInterval(interval)
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('pagehide', onPageHide)
    }
  }, [])

  // Presenca do sindico (Online / Ausente / Offline no painel da plataforma).
  const isSyndic = normalizeRole(profile?.role) === 'admin'
  useEffect(() => {
    if (!isSyndic) return undefined
    void sendPresence('ativo')
    const interval = window.setInterval(() => void sendPresence('ativo'), HEARTBEAT_MS)
    const onVisible = () => { if (document.visibilityState === 'visible') void sendPresence('ativo') }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.clearInterval(interval)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [isSyndic, profile?.id])

  // Notificacoes: se este navegador ja recebe notificacoes, elas passam a ser de quem entrou agora
  // (computador compartilhado nao mostra aviso de outra pessoa).
  useEffect(() => {
    if (!profile?.id) return
    void syncPushOwner()
  }, [profile?.id])

  const signIn = (email, password) => supabase.auth.signInWithPassword({ email, password })

  const signOut = useCallback(async () => {
    if (isSyndic) await sendPresence('saiu')
    // Sair de proposito desliga as notificacoes deste aparelho. O logout automatico de 5 minutos
    // nao desliga: o morador continua recebendo aviso e cobranca com o app fechado.
    await detachPushOnSignOut()
    await supabase.auth.signOut()
    setUser(null)
    setProfile(null)
    setCondominiumStatus(null)
    setAuthIssue('')
  }, [isSyndic])

  const refreshProfile = useCallback(async () => {
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
  }, [user])

  const resolvedRole = normalizeRole(profile?.role)
  const condominiumId = getProfileCondominiumId(profile)

  const value = useMemo(() => ({
    user,
    profile,
    loading,
    authIssue,
    sessionNotice,
    condominiumId,
    condominiumStatus,
    resolvedRole,
    isAdmin: isAdminRole(resolvedRole),
    signIn,
    signOut,
    refreshProfile,
  }), [user, profile, loading, authIssue, sessionNotice, condominiumId, condominiumStatus, resolvedRole, refreshProfile, signOut])

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}
