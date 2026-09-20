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
    const apiError = new Error(buildApiError(response.status, result.error))
    // Dados extras (ex.: code NEEDS_LINK + pessoa encontrada) para a tela decidir o proximo passo.
    apiError.status = response.status
    apiError.code = result.code
    apiError.details = result
    throw apiError
  }

  return result
}

export async function renderBillingPdf(payload) {
  const token = await getAccessToken()

  let response
  try {
    response = await fetchWithTimeout('/api/admin/billing/render-pdf', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    }, 20000)
  } catch (error) {
    const renderError = new Error(
      error.name === 'AbortError'
        ? 'A geracao do boleto demorou para responder. Tente novamente em alguns segundos.'
        : 'Falha de conexao com o renderizador do boleto. Verifique o servidor local e tente novamente.',
    )
    renderError.code = 'PDF_RENDER_UNAVAILABLE'
    throw renderError
  }

  if (!response.ok) {
    const contentType = response.headers.get('content-type') || ''
    let message = ''

    if (contentType.includes('application/json')) {
      const result = await response.json().catch(() => ({}))
      message = result.error || ''
    } else {
      message = await response.text().catch(() => '')
    }

    const apiError = new Error(buildApiError(response.status, message))
    apiError.status = response.status
    if (response.status >= 500) {
      apiError.code = 'PDF_RENDER_UNAVAILABLE'
    }
    throw apiError
  }

  return new Uint8Array(await response.arrayBuffer())
}

export function createResident(payload) {
  return callAdminApi('/api/admin/residents-create', payload)
}

export function deleteResident(payload) {
  return callAdminApi('/api/admin/residents-delete', payload)
}

export function saveUnit(payload) {
  return callAdminApi('/api/admin/units-save', payload)
}

export function deleteUnit(payload) {
  return callAdminApi('/api/admin/units-delete', payload)
}
