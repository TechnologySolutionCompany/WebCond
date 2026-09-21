import { supabase } from './supabase'
import { getCpfCnpjLabel, getCpfCnpjType, normalizeCpfCnpj } from './document'

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

export async function signInWithDocument(documentNumber, password) {
  const normalizedDocument = normalizeCpfCnpj(documentNumber)
  const documentType = getCpfCnpjType(normalizedDocument)

  if (!documentType) {
    throw new Error('Informe um CPF ou CNPJ valido.')
  }

  const endpoint = documentType === 'cnpj' ? '/api/auth/login-cnpj' : '/api/auth/login-cpf'
  const body = documentType === 'cnpj'
    ? { cnpj: normalizedDocument, password }
    : { cpf: normalizedDocument, password }

  let response

  try {
    response = await fetchWithTimeout(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error('O backend demorou para responder. Tente novamente em alguns segundos.')
    }

    throw new Error('Falha de conexao com o backend. Verifique o servidor local e tente novamente.')
  }

  const result = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(result.error || `Nao foi possivel entrar com ${getCpfCnpjLabel(normalizedDocument)} e senha.`)
  }

  const session = result.session
  if (!session?.access_token || !session?.refresh_token) {
    throw new Error('A autenticacao retornou uma sessao invalida.')
  }

  const { error } = await supabase.auth.setSession({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
  })

  if (error) {
    throw new Error(error.message || 'Nao foi possivel concluir o login.')
  }

  return result
}

