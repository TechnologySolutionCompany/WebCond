import { supabase } from './supabase'

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

export async function signInWithCpf(cpf, password) {
  let response

  try {
    response = await fetchWithTimeout('/api/auth/login-cpf', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ cpf, password }),
    })
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error('O backend demorou para responder. Tente novamente em alguns segundos.')
    }

    throw new Error('Falha de conexão com o backend. Verifique o servidor local e tente novamente.')
  }

  const result = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(result.error || 'Não foi possível entrar com CPF e senha.')
  }

  const session = result.session
  if (!session?.access_token || !session?.refresh_token) {
    throw new Error('A autenticação retornou uma sessão inválida.')
  }

  const { error } = await supabase.auth.setSession({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
  })

  if (error) {
    throw new Error(error.message || 'Não foi possível concluir o login.')
  }

  return result
}

export const signInResidentWithCpf = signInWithCpf
