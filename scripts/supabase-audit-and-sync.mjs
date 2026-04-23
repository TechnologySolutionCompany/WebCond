import fs from 'node:fs'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {}

  return Object.fromEntries(
    fs.readFileSync(filePath, 'utf8')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#') && line.includes('='))
      .map((line) => {
        const idx = line.indexOf('=')
        return [line.slice(0, idx).trim(), line.slice(idx + 1).trim()]
      }),
  )
}

function normalizeCpf(value = '') {
  return String(value || '').replace(/\D/g, '')
}

function normalizePhone(value = '') {
  return String(value || '').replace(/\D/g, '')
}

function isValidCpf(value = '') {
  return normalizeCpf(value).length === 11
}

function formatDate(value) {
  if (!value) return '-'
  const date = new Date(`${value}T12:00:00`)
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleDateString('pt-BR')
}

async function listAllUsers(adminClient) {
  const users = []
  let page = 1

  while (true) {
    const { data, error } = await adminClient.auth.admin.listUsers({
      page,
      perPage: 200,
    })

    if (error) {
      throw new Error(`Falha ao listar usuários do Auth: ${error.message}`)
    }

    const batch = data?.users || []
    users.push(...batch)

    if (batch.length < 200) break
    page += 1
  }

  return users
}

function mapByEmail(rows) {
  const map = new Map()

  for (const row of rows) {
    const email = String(row.email || '').trim().toLowerCase()
    if (!email || map.has(email)) continue
    map.set(email, row)
  }

  return map
}

function buildReport({ profiles, authUsers, stats, invalidCpfProfiles, missingEntryDateProfiles }) {
  const lines = [
    '# Supabase Audit',
    '',
    `Gerado em: ${new Date().toLocaleString('pt-BR')}`,
    '',
    '## Resumo',
    '',
    `- Perfis analisados: ${profiles.length}`,
    `- Usuários Auth analisados: ${authUsers.length}`,
    `- Perfis atualizados: ${stats.updatedProfiles}`,
    `- Solicitações atualizadas: ${stats.updatedRequests}`,
    `- Metadados Auth sincronizados: ${stats.updatedAuthUsers}`,
    `- Telefones limpos: ${stats.clearedPhones}`,
    '',
    '## Regras ativas',
    '',
    '- Morador entra com CPF + senha.',
    '- Administrador continua entrando com e-mail + senha.',
    '- O campo `telefone` foi mantido no banco apenas por compatibilidade. O app usa somente `whatsapp`.',
    '',
    '## Pendências manuais',
    '',
  ]

  if (invalidCpfProfiles.length === 0 && missingEntryDateProfiles.length === 0) {
    lines.push('- Nenhuma pendência manual crítica encontrada.')
  } else {
    if (invalidCpfProfiles.length > 0) {
      lines.push('- Corrigir CPFs inválidos em `public.profiles`:')
      for (const item of invalidCpfProfiles) {
        lines.push(`  - ${item.nome || item.email || item.id}: CPF atual \`${item.cpf || ''}\``)
      }
    }

    if (missingEntryDateProfiles.length > 0) {
      lines.push('- Revisar moradores sem data de entrada:')
      for (const item of missingEntryDateProfiles) {
        lines.push(`  - ${item.nome || item.email || item.id}: apartamento ${item.apartamento || '-'}, CPF ${item.cpf || '-'}`)
      }
    }
  }

  lines.push(
    '',
    '## Amostra atual',
    '',
  )

  for (const row of profiles.slice(0, 5)) {
    lines.push(`- ${row.email} | role=${row.role} | cpf=${row.cpf || '-'} | whatsapp=${row.whatsapp || '-'} | entrada=${formatDate(row.data_entrada)}`)
  }

  return `${lines.join('\n')}\n`
}

const rootDir = process.cwd()
const env = {
  ...loadEnvFile(path.join(rootDir, '.env')),
  ...process.env,
}

const supabaseUrl = env.SUPABASE_URL || env.VITE_SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error('SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY precisam estar configuradas para a auditoria.')
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const stats = {
  updatedProfiles: 0,
  updatedRequests: 0,
  updatedAuthUsers: 0,
  clearedPhones: 0,
}

const [{ data: profiles, error: profilesError }, { data: requests, error: requestsError }, authUsers] = await Promise.all([
  supabase
    .from('profiles')
    .select('id, nome, email, role, ativo, cpf, telefone, whatsapp, apartamento, data_entrada')
    .order('email'),
  supabase
    .from('solicitacoes_cadastro')
    .select('id, nome, email, status, cpf, telefone, whatsapp, apartamento, data_entrada')
    .order('created_at', { ascending: false }),
  listAllUsers(supabase),
])

if (profilesError) {
  throw new Error(`Falha ao ler profiles: ${profilesError.message}`)
}

if (requestsError) {
  throw new Error(`Falha ao ler solicitacoes_cadastro: ${requestsError.message}`)
}

const safeProfiles = profiles || []
const safeRequests = requests || []
const profilesByEmail = mapByEmail(safeProfiles)
const requestsByEmail = mapByEmail(safeRequests)

for (const profile of safeProfiles) {
  const approvedRequest = requestsByEmail.get(String(profile.email || '').trim().toLowerCase())
  const payload = {}

  if ((profile.cpf || '') !== normalizeCpf(profile.cpf)) {
    payload.cpf = normalizeCpf(profile.cpf)
  }

  if ((profile.whatsapp || '') !== normalizePhone(profile.whatsapp)) {
    payload.whatsapp = normalizePhone(profile.whatsapp)
  }

  if (profile.telefone) {
    payload.telefone = ''
  }

  if (!profile.data_entrada && approvedRequest?.data_entrada) {
    payload.data_entrada = approvedRequest.data_entrada
  }

  if (Object.keys(payload).length === 0) continue

  const { error } = await supabase
    .from('profiles')
    .update(payload)
    .eq('id', profile.id)

  if (error) {
    throw new Error(`Falha ao atualizar perfil ${profile.email || profile.id}: ${error.message}`)
  }

  if (profile.telefone) stats.clearedPhones += 1
  stats.updatedProfiles += 1
  Object.assign(profile, payload)
}

for (const request of safeRequests) {
  const matchedProfile = profilesByEmail.get(String(request.email || '').trim().toLowerCase())
  const payload = {}

  if ((request.cpf || '') !== normalizeCpf(request.cpf)) {
    payload.cpf = normalizeCpf(request.cpf)
  }

  if ((request.whatsapp || '') !== normalizePhone(request.whatsapp)) {
    payload.whatsapp = normalizePhone(request.whatsapp)
  }

  if (request.telefone) {
    payload.telefone = ''
  }

  if (matchedProfile) {
    if (!normalizeCpf(request.cpf) && isValidCpf(matchedProfile.cpf)) {
      payload.cpf = matchedProfile.cpf
    }

    if (!normalizePhone(request.whatsapp) && matchedProfile.whatsapp) {
      payload.whatsapp = normalizePhone(matchedProfile.whatsapp)
    }

    if (!request.apartamento && matchedProfile.apartamento) {
      payload.apartamento = matchedProfile.apartamento
    }

    if (!request.data_entrada && matchedProfile.data_entrada) {
      payload.data_entrada = matchedProfile.data_entrada
    }
  }

  if (Object.keys(payload).length === 0) continue

  const { error } = await supabase
    .from('solicitacoes_cadastro')
    .update(payload)
    .eq('id', request.id)

  if (error) {
    throw new Error(`Falha ao atualizar solicitação ${request.email || request.id}: ${error.message}`)
  }

  if (request.telefone) stats.clearedPhones += 1
  stats.updatedRequests += 1
}

for (const authUser of authUsers) {
  const profile = safeProfiles.find((item) => item.id === authUser.id)
  if (!profile) continue

  const currentMeta = authUser.user_metadata || {}
  const nextMeta = {
    ...currentMeta,
    role: profile.role,
    nome: profile.nome || currentMeta.nome || '',
  }

  if (isValidCpf(profile.cpf)) {
    nextMeta.cpf = profile.cpf
  }

  const currentComparable = JSON.stringify({
    role: currentMeta.role || '',
    nome: currentMeta.nome || '',
    cpf: currentMeta.cpf || '',
  })

  const nextComparable = JSON.stringify({
    role: nextMeta.role || '',
    nome: nextMeta.nome || '',
    cpf: nextMeta.cpf || '',
  })

  if (currentComparable === nextComparable) continue

  const { error } = await supabase.auth.admin.updateUserById(authUser.id, {
    user_metadata: nextMeta,
  })

  if (error) {
    throw new Error(`Falha ao sincronizar Auth de ${profile.email || profile.id}: ${error.message}`)
  }

  stats.updatedAuthUsers += 1
}

const invalidCpfProfiles = safeProfiles.filter((item) => item.role === 'morador' && item.cpf && !isValidCpf(item.cpf))
const missingEntryDateProfiles = safeProfiles.filter((item) => item.role === 'morador' && item.ativo && !item.data_entrada)

const report = buildReport({
  profiles: safeProfiles,
  authUsers,
  stats,
  invalidCpfProfiles,
  missingEntryDateProfiles,
})

fs.mkdirSync(path.join(rootDir, 'scripts'), { recursive: true })
fs.writeFileSync(path.join(rootDir, 'SUPABASE_AUDIT.md'), report, 'utf8')

console.log(JSON.stringify({
  stats,
  invalidCpfProfiles: invalidCpfProfiles.map((item) => ({
    id: item.id,
    nome: item.nome,
    email: item.email,
    cpf: item.cpf,
  })),
  missingEntryDateProfiles: missingEntryDateProfiles.map((item) => ({
    id: item.id,
    nome: item.nome,
    email: item.email,
    apartamento: item.apartamento,
    cpf: item.cpf,
  })),
  reportFile: 'SUPABASE_AUDIT.md',
}, null, 2))
