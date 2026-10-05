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

async function postTenantApi(path, payload, fallbackError) {
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

    throw new Error('Falha de conexao com o backend. Verifique o servidor local e tente novamente.')
  }

  const result = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(result.error || fallbackError)
  }

  return result
}

// Propria conta. As duas exigem a senha atual (o servidor confere).
export function changeMyLoginEmail({ email, senhaAtual }) {
  return postTenantApi('/api/tenant/account-email', { email, senhaAtual }, 'Nao foi possivel salvar o e-mail de acesso.')
}

export function changeMyPassword({ senhaAtual, novaSenha }) {
  return postTenantApi('/api/tenant/account-password', { senhaAtual, novaSenha }, 'Nao foi possivel alterar sua senha.')
}

// Volta do "Pagar agora" (v1.09A5): o servidor confere com o banco antes de dar baixa.
export function checkChargePayment({ orderNsu, transactionNsu, slug }) {
  return postTenantApi('/api/tenant/payment-check', { orderNsu, transactionNsu, slug }, 'Nao foi possivel conferir o pagamento.')
}

// Feedback do morador para a administracao da plataforma.
export function sendTenantFeedback(payload) {
  return postTenantApi('/api/tenant/feedback', payload, 'Nao foi possivel enviar o feedback.')
}
