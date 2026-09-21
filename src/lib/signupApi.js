// Auto-cadastro do morador pelo link do sindico. Sao as unicas chamadas publicas
// (sem sessao) alem do login: o condominio vem sempre do token do link, nunca da tela.

async function fetchWithTimeout(path, options, timeoutMs = 15000) {
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs)

  try {
    return await fetch(path, { ...options, signal: controller.signal })
  } finally {
    window.clearTimeout(timeout)
  }
}

async function readResponse(response, fallback) {
  const result = await response.json().catch(() => ({}))
  if (!response.ok) {
    const error = new Error(result.error || fallback)
    error.status = response.status
    error.code = result.code
    throw error
  }
  return result
}

export async function fetchSignupInfo(token) {
  let response
  try {
    response = await fetchWithTimeout(`/api/auth/cadastro-info?token=${encodeURIComponent(token)}`, { method: 'GET' })
  } catch (error) {
    throw new Error(error.name === 'AbortError'
      ? 'O servidor demorou para responder. Tente novamente em alguns segundos.'
      : 'Falha de conexao. Verifique sua internet e tente novamente.')
  }

  return readResponse(response, 'Nao foi possivel abrir este link de cadastro.')
}

export async function submitSignup(payload) {
  let response
  try {
    response = await fetchWithTimeout('/api/auth/cadastro-enviar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }, 20000)
  } catch (error) {
    throw new Error(error.name === 'AbortError'
      ? 'O servidor demorou para responder. Tente novamente em alguns segundos.'
      : 'Falha de conexao. Verifique sua internet e tente novamente.')
  }

  return readResponse(response, 'Nao foi possivel enviar seu cadastro.')
}
