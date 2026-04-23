import { useEffect, useState } from 'react'

const initialState = {
  loading: true,
  online: typeof navigator === 'undefined' ? true : navigator.onLine,
  ok: false,
  database: 'unknown',
  mode: 'offline',
  latencyMs: null,
  checks: [],
  error: '',
  lastCheckedAt: null,
}

export function usePlatformHealth({ enabled = true, intervalMs = 45000 } = {}) {
  const [state, setState] = useState(initialState)

  useEffect(() => {
    if (!enabled) return undefined

    let isMounted = true

    const refresh = async ({ silent = false } = {}) => {
      if (!silent) {
        setState((current) => ({ ...current, loading: true, error: '' }))
      }

      try {
        const response = await fetch(`/api/health?t=${Date.now()}`, {
          method: 'GET',
          headers: {
            'Cache-Control': 'no-store',
          },
        })

        const result = await response.json().catch(() => ({}))
        if (!isMounted) return

        setState({
          loading: false,
          online: typeof navigator === 'undefined' ? true : navigator.onLine,
          ok: Boolean(result.ok),
          database: result.database || 'unknown',
          mode: result.mode || 'offline',
          latencyMs: typeof result.latencyMs === 'number' ? result.latencyMs : null,
          checks: Array.isArray(result.checks) ? result.checks : [],
          error: result.error || '',
          lastCheckedAt: result.timestamp || new Date().toISOString(),
        })
      } catch (error) {
        if (!isMounted) return

        setState({
          loading: false,
          online: typeof navigator === 'undefined' ? true : navigator.onLine,
          ok: false,
          database: 'offline',
          mode: 'offline',
          latencyMs: null,
          checks: [],
          error: 'Não foi possível consultar o diagnóstico do backend.',
          lastCheckedAt: new Date().toISOString(),
        })
      }
    }

    void refresh()

    const interval = window.setInterval(() => {
      void refresh({ silent: true })
    }, intervalMs)

    const handleOnline = () => {
      setState((current) => ({ ...current, online: true }))
      void refresh({ silent: true })
    }

    const handleOffline = () => {
      setState((current) => ({ ...current, online: false }))
    }

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      isMounted = false
      window.clearInterval(interval)
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [enabled, intervalMs])

  return state
}
