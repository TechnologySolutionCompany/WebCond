import { supabase } from './supabase'

async function getAccessToken() {
  const { data, error } = await supabase.auth.getSession()

  if (error) {
    throw new Error('Não foi possível validar a sessão atual.')
  }

  const token = data.session?.access_token
  if (!token) {
    throw new Error('Sessão expirada. Entre novamente para continuar.')
  }

  return token
}

function buildApiError(status, message) {
  if (status === 401) {
    return 'Sua sessão expirou. Entre novamente para continuar.'
  }

  if (status === 403) {
    return 'Esta operação está restrita ao administrador.'
  }

  if (status === 503) {
    return message || 'O backend está acessível, mas ainda falta configuração para concluir esta operação.'
  }

  return message || `Erro administrativo (${status}).`
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

async function callAdminApi(path, payload) {
  const token = await getAccessToken()

  let response
  try {
    response = await fetchWithTimeout(path, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    })
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error('O backend demorou para responder. Tente novamente em alguns segundos.')
    }

    throw new Error('Falha de conexão com o backend. Verifique o servidor local e tente novamente.')
  }

  const result = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(buildApiError(response.status, result.error))
  }

  return result
}

export function createResident(payload) {
  return callAdminApi('/api/admin/residents/create', payload)
}

export function deleteResident(payload) {
  return callAdminApi('/api/admin/residents/delete', payload)
}

export function updateResident(payload) {
  return callAdminApi('/api/admin/residents/update', payload)
}

export function updateResidentPassword(payload) {
  return callAdminApi('/api/admin/residents/update-password', payload)
}
