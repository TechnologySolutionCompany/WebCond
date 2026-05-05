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

export async function getTenantChargeSummary() {
  const token = await getAccessToken()

  let response
  try {
    response = await fetchWithTimeout('/api/tenant/charge-summary', {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error('O backend demorou para responder. Tente novamente em alguns segundos.')
    }

    throw new Error('Falha de conexao com o backend. Verifique o servidor local e tente novamente.')
  }

  const result = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(result.error || 'Nao foi possivel carregar o resumo do condominio.')
  }

  return result
}
