import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'

function loadDotEnv() {
  const envPath = resolve(process.cwd(), '.env')
  if (!existsSync(envPath)) return

  const content = readFileSync(envPath, 'utf8')
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue

    const separatorIndex = trimmed.indexOf('=')
    if (separatorIndex === -1) continue

    const key = trimmed.slice(0, separatorIndex).trim()
    let value = trimmed.slice(separatorIndex + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }

    if (process.env[key] == null) {
      process.env[key] = value
    }
  }
}

function readArg(name, fallback = '') {
  const prefix = `--${name}=`
  const inline = process.argv.find((arg) => arg.startsWith(prefix))
  if (inline) return inline.slice(prefix.length)

  const index = process.argv.indexOf(`--${name}`)
  if (index !== -1 && process.argv[index + 1]) {
    return process.argv[index + 1]
  }

  return fallback
}

function requireEnv(name, fallbackName) {
  const value = process.env[name] || (fallbackName ? process.env[fallbackName] : '')
  if (!value) {
    throw new Error(`Configure ${name}${fallbackName ? ` ou ${fallbackName}` : ''} antes de criar o administrador.`)
  }

  return value
}

function createAdminClient() {
  loadDotEnv()

  const url = requireEnv('SUPABASE_URL', 'VITE_SUPABASE_URL')
  const serviceRoleKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY')

  return createClient(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })
}

async function listAllAuthUsers(client) {
  const users = []
  let page = 1

  while (true) {
    const { data, error } = await client.auth.admin.listUsers({
      page,
      perPage: 1000,
    })

    if (error) throw error

    const batch = data?.users || []
    users.push(...batch)

    if (batch.length < 1000) break
    page += 1
  }

  return users
}

async function findAuthUserByEmail(client, email) {
  const users = await listAllAuthUsers(client)
  return users.find((user) => String(user.email || '').toLowerCase() === email) || null
}

async function ensureAuthUser(client, { email, password, name, document }) {
  const existing = await findAuthUserByEmail(client, email)

  if (existing) {
    const { data, error } = await client.auth.admin.updateUserById(existing.id, {
      email,
      password,
      email_confirm: true,
      user_metadata: {
        role: 'PLATFORM_ADMIN',
        nome: name,
        cpf: document,
      },
    })

    if (error) throw error
    return data.user || existing
  }

  const { data, error } = await client.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      role: 'PLATFORM_ADMIN',
      nome: name,
      cpf: document,
    },
  })

  if (error) throw error
  return data.user
}

async function main() {
  const document = String(readArg('document') || readArg('cnpj') || '').replace(/\D/g, '')
  const password = readArg('password')
  const name = readArg('name', 'Administrador da plataforma').trim()
  const email = String(readArg('email', `platform-${document}@login.webcond.local`)).trim().toLowerCase()

  if (document.length !== 14) {
    throw new Error('Informe um CNPJ com 14 digitos em --document.')
  }

  if (!password || password.length < 6) {
    throw new Error('Informe uma senha com pelo menos 6 caracteres em --password.')
  }

  const client = createAdminClient()
  const user = await ensureAuthUser(client, { email, password, name, document })

  if (!user?.id) {
    throw new Error('O usuario Auth foi criado/atualizado sem identificador.')
  }

  const { error: profileError } = await client
    .from('profiles')
    .upsert({
      id: user.id,
      role: 'PLATFORM_ADMIN',
      ativo: true,
      nome: name,
      email,
      telefone: '',
      whatsapp: '',
      apartamento: '',
      cpf: document,
      condominium_id: null,
      condominio_id: null,
      observacao: 'Administrador global da plataforma.',
      updated_at: new Date().toISOString(),
    }, { onConflict: 'id' })

  if (profileError) throw profileError

  console.log(JSON.stringify({
    ok: true,
    user: {
      id: user.id,
      email,
      role: 'PLATFORM_ADMIN',
      document,
      name,
    },
  }, null, 2))
}

main().catch((error) => {
  console.error(error.message || error)
  process.exit(1)
})
