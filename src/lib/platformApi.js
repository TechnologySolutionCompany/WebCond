import { supabase } from './supabase'

async function getAccessToken() {
  const { data, error } = await supabase.auth.getSession()

  if (error) {
    throw new Error('Nao foi possivel validar a sessao atual.')
  }

  const token = data.session?.access_token
  if (!token) {
    throw new Error('Sessao expirada. Entre novamente para continuar.')
  }

  return token
}

async function fetchWithTimeout(path, options, timeoutMs = 12000) {
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs)

  try {
    return await fetch(path, {
      ...options,
      signal: controller.signal,
    })
  } finally {
    window.clearTimeout(timeout)
  }
}

function buildPlatformError(status, message) {
  if (status === 401) return 'Sua sessao expirou. Entre novamente para continuar.'
  if (status === 403) return message || 'Esta operacao esta restrita ao administrador da plataforma.'
  if (status === 503) return message || 'O backend ainda precisa de configuracao para concluir esta operacao.'
  return message || `Erro da plataforma (${status}).`
}

async function callPlatformApi(path, payload, { method = 'POST', timeoutMs } = {}) {
  const token = await getAccessToken()

  let response
  try {
    response = await fetchWithTimeout(path, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: method === 'GET' ? undefined : JSON.stringify(payload || {}),
    }, timeoutMs)
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error('O backend demorou para responder. Tente novamente em alguns segundos.')
    }

    throw new Error('Falha de conexao com o backend. Verifique o servidor local e tente novamente.')
  }

  const result = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(buildPlatformError(response.status, result.error))
  }

  return result
}

export function listPlatformCondominiums() {
  return callPlatformApi('/api/platform/condominiums-list', undefined, { method: 'GET' })
}

export function getPlatformStatus() {
  return callPlatformApi('/api/platform/status', undefined, { method: 'GET', timeoutMs: 20000 })
}

export function updatePlatformCondominium(payload) {
  return callPlatformApi('/api/platform/condominiums-update', payload)
}

export function updatePlatformSyndicPassword(payload) {
  return callPlatformApi('/api/platform/condominiums-syndic-password', payload)
}

export async function registerCondominium(payload) {
  let response

  try {
    response = await fetchWithTimeout('/api/platform/condominiums-register', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error('O backend demorou para responder. Tente novamente em alguns segundos.')
    }

    throw new Error('Falha de conexao com o backend. Verifique o servidor local e tente novamente.')
  }

  const result = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(buildPlatformError(response.status, result.error))
  }

  return result
}

export function exportPlatformCondominium(condominiumId) {
  return callPlatformApi(`/api/platform/condominiums-export?id=${encodeURIComponent(condominiumId)}`, undefined, { method: 'GET' })
}

export function importPlatformResidents(payload) {
  return callPlatformApi('/api/platform/condominiums-import', payload, { timeoutMs: 60000 })
}
