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

function requireEnv(name, fallbackName) {
  const value = process.env[name] || (fallbackName ? process.env[fallbackName] : '')
  if (!value) {
    throw new Error(`Configure ${name}${fallbackName ? ` ou ${fallbackName}` : ''} antes de limpar os cadastros.`)
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

async function countRows(client, table) {
  const { count, error } = await client
    .from(table)
    .select('id', { count: 'exact', head: true })

  if (error) throw error
  return count || 0
}

async function deleteRows(client, table) {
  const before = await countRows(client, table)
  if (before === 0) return 0

  const { error } = await client
    .from(table)
    .delete()
    .not('id', 'is', null)

  if (error) throw error
  return before
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

async function deleteAllAuthUsers(client) {
  const users = await listAllAuthUsers(client)

  for (const user of users) {
    const { error } = await client.auth.admin.deleteUser(user.id)
    if (error) throw error
  }

  return users.length
}

async function main() {
  if (!process.argv.includes('--yes')) {
    throw new Error('Use --yes para confirmar a limpeza dos cadastros.')
  }

  const client = createAdminClient()
  const childTables = [
    'ocorrencias_predio',
    'documentos',
    'avisos',
    'cobrancas',
    'solicitacoes_cadastro',
  ]

  const deleted = {}
  for (const table of childTables) {
    deleted[table] = await deleteRows(client, table)
  }

  deleted.auth_users = await deleteAllAuthUsers(client)
  deleted.profiles = await deleteRows(client, 'profiles')
  deleted.condominiums = await deleteRows(client, 'condominiums')

  console.log(JSON.stringify({ ok: true, deleted }, null, 2))
}

main().catch((error) => {
  console.error(error.message || error)
  process.exit(1)
})
