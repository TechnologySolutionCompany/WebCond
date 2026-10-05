import { supabase } from './supabase'
import { getCpfCnpjLabel, getCpfCnpjType, normalizeCpfCnpj } from './document'
import { isValidLoginEmail, normalizeLoginEmail } from './loginEmail'

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

// Novo e-mail de confirmacao do cadastro do condominio (v1.09A5). Usa a sessao recem-aberta:
// so o proprio sindico pede, e o e-mail vai para o endereco que ja esta na conta dele.
export async function resendSignupConfirmation() {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new Error('Entre com seu e-mail e senha para pedir um novo link.')

  let response
  try {
    response = await fetchWithTimeout('/api/auth/reenviar-confirmacao', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    }, 20000)
  } catch {
    throw new Error('Falha de conexao. Tente novamente em alguns segundos.')
  }
  const result = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(result.error || 'Nao foi possivel reenviar o e-mail.')
  return result
}

// Todos os jeitos de entrar terminam igual: o servidor confere e devolve a sessao, e o
// navegador so a instala. A senha nunca vai direto do navegador para o Supabase.
async function loginThroughBackend(endpoint, body, fallbackError) {
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
    throw new Error(result.error || fallbackError)
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

export async function signInWithEmail(email, password) {
  const normalizedEmail = normalizeLoginEmail(email)
  if (!isValidLoginEmail(normalizedEmail)) {
    throw new Error('Informe um e-mail valido.')
  }

  return loginThroughBackend('/api/auth/login-email', { email: normalizedEmail, password }, 'Nao foi possivel entrar com e-mail e senha.')
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

  return loginThroughBackend(endpoint, body, `Nao foi possivel entrar com ${getCpfCnpjLabel(normalizedDocument)} e senha.`)
}

// "Esqueci a senha" (v2.10A2): para qual WhatsApp pedir a troca de senha. O servidor devolve o
// do sindico do condominio da pessoa ou, quando nao der para saber, o suporte da TSCBr.
export async function buscarContatoParaTrocaDeSenha(cpf) {
  let response
  try {
    response = await fetchWithTimeout('/api/auth/contato-sindico', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cpf: normalizeCpfCnpj(cpf) }),
    })
  } catch {
    throw new Error('Falha de conexao. Tente novamente em alguns segundos.')
  }
  const result = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(result.error || 'Nao foi possivel buscar o contato agora.')
  return result
}
