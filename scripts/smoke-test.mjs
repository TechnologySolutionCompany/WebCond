// Smoke test do backend contra o Supabase configurado no .env.
// Somente leitura: consulta tabelas/buckets e faz chamadas que devem ser rejeitadas. Nao cria dados.
import { readFileSync } from 'node:fs'

for (const line of readFileSync('.env', 'utf8').split(/\r?\n/)) {
  const match = line.match(/^([A-Z_]+)=(.*)$/)
  if (match && !process.env[match[1]]) process.env[match[1]] = match[2].trim()
}

const headers = { 'content-type': 'application/json', host: 'app.test', origin: 'http://app.test', 'x-forwarded-for': '203.0.113.9' }
let failures = 0

async function expect(label, path, method, expectedStatus, body, extraHeaders = {}) {
  // Cada area tem uma funcao unica na Vercel; os modulos ficam em api/_<area>/.
  const modulePath = path === 'health' || path.startsWith('admin/billing/') ? path : path.replace(/^([a-z]+)\//, '_$1/')
  const mod = await import(`../api/${modulePath}.js`)
  const response = await mod[method](new Request(`http://app.test/api/${path}`, {
    method,
    headers: { ...headers, ...extraHeaders },
    body: body && JSON.stringify(body),
  }))
  const data = await response.json().catch(() => ({}))
  const ok = response.status === expectedStatus
  if (!ok) failures += 1
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${label.padEnd(34)} ${response.status} (esperado ${expectedStatus}) ${data.error || ''}`)
}

await expect('health', 'health', 'GET', 200)
await expect('login-cpf credencial invalida', 'auth/login-cpf', 'POST', 401, { cpf: '52998224725', password: 'x' })
await expect('login-cnpj credencial invalida', 'auth/login-cnpj', 'POST', 401, { cnpj: '11222333000181', password: 'x' })
await expect('platform/list sem token', 'platform/condominiums/list', 'GET', 401)
await expect('tenant/charge-summary sem token', 'tenant/charge-summary', 'GET', 401)
await expect('register de origem externa', 'platform/condominiums/register', 'POST', 403, {}, { origin: 'https://evil.test' })
await expect('register com corpo vazio', 'platform/condominiums/register', 'POST', 400, {})

const { supabaseAdmin } = await import('../api/_lib/supabaseAdmin.js')
const tables = ['condominiums', 'profiles', 'solicitacoes_cadastro', 'cobrancas', 'avisos', 'documentos', 'ocorrencias_predio', 'app_health', 'unidades', 'unidade_vinculos']
for (const table of tables) {
  const { error } = await supabaseAdmin.from(table).select('*', { count: 'exact', head: true })
  if (error) failures += 1
  console.log(`${error ? 'FAIL' : 'OK  '} tabela ${table.padEnd(27)} ${error?.message || ''}`)
}

const { data: buckets, error: bucketError } = await supabaseAdmin.storage.listBuckets()
for (const name of ['documentos', 'cobrancas']) {
  const bucket = buckets?.find((item) => item.name === name)
  const ok = !bucketError && bucket && !bucket.public
  if (!ok) failures += 1
  console.log(`${ok ? 'OK  ' : 'FAIL'} bucket ${name.padEnd(27)} ${bucketError?.message || (bucket ? (bucket.public ? 'PUBLICO - deveria ser privado' : 'privado') : 'nao existe')}`)
}

const { count: platformAdmins } = await supabaseAdmin.from('profiles').select('*', { count: 'exact', head: true }).ilike('role', 'platform_admin')
if (!platformAdmins) failures += 1
console.log(`${platformAdmins ? 'OK  ' : 'FAIL'} PLATFORM_ADMIN cadastrado            ${platformAdmins ?? 0}`)

console.log(failures ? `\n${failures} falha(s).` : '\nTudo OK.')
process.exit(failures ? 1 : 0)
