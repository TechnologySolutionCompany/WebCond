// Teste de seguranca multi-condominio contra o Supabase do .env (rode na raiz: npm run security-test).
// Cria 3 condominios de teste (sindico, proprietario, inquilino, contador), usa os tres ao mesmo tempo,
// tenta todo tipo de acesso indevido entre eles e apaga tudo no final.
// Requer no .env: PLATFORM_ADMIN_DOCUMENT e PLATFORM_ADMIN_PASSWORD (login do admin da plataforma).
// Por padrao chama os modulos da API direto. Com SECURITY_TEST_URL=https://... testa o site publicado.
process.loadEnvFile('.env')
const { createClient } = await import('@supabase/supabase-js')
const { supabaseAdmin } = await import('../api/_lib/supabaseAdmin.js')

if (!process.env.PLATFORM_ADMIN_DOCUMENT || !process.env.PLATFORM_ADMIN_PASSWORD) {
  console.error('Defina PLATFORM_ADMIN_DOCUMENT e PLATFORM_ADMIN_PASSWORD no .env para rodar o teste.')
  process.exit(1)
}

const URL_ = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const ANON = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY
const results = []
const check = (group, name, ok, extra = '') => { results.push({ group, name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'} [${group}] ${name}${extra ? ' :: ' + extra : ''}`) }

function cpf() {
  const d = Array.from({ length: 9 }, () => Math.floor(Math.random() * 10))
  for (const len of [9, 10]) { const r = (d.slice(0, len).reduce((s, n, i) => s + n * (len + 1 - i), 0) * 10) % 11; d.push(r === 10 ? 0 : r) }
  return d.join('')
}
function cnpj() {
  const d = [...Array.from({ length: 8 }, () => Math.floor(Math.random() * 10)), 0, 0, 0, 1]
  for (const w of [[5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2], [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]]) { const r = d.reduce((s, n, i) => s + n * w[i], 0) % 11; d.push(r < 2 ? 0 : 11 - r) }
  return d.join('')
}
const BASE_URL = String(process.env.SECURITY_TEST_URL || '').replace(/\/+$/, '')

// Endereco publico da rota: uma funcao por area, um segmento depois da area.
const HTTP_ROUTES = { 'platform/condominiums/update-syndic-password': 'platform/condominiums-syndic-password' }
function httpRoute(path) {
  if (HTTP_ROUTES[path]) return HTTP_ROUTES[path]
  if (path === 'health' || path.startsWith('admin/billing/')) return path
  const [area, ...rest] = path.split('/')
  return `${area}/${rest.join('-')}`
}

// IP de mentira por chamada: o limite por IP das rotas publicas nao deve mascarar o que se testa.
// No site publicado a Vercel sobrescreve o cabecalho, entao ali o limite real continua valendo.
let fakeIpCounter = 0
const fakeIp = () => `10.77.${Math.floor(fakeIpCounter / 250) % 250}.${(fakeIpCounter++ % 250) + 1}`
const skip = (group, name, why) => console.log(`SKIP [${group}] ${name} :: ${why}`)

async function call(path, { token, body, method = 'POST', headers: extraHeaders = {}, ip = false } = {}) {
  const headers = { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}), ...(ip ? { 'x-forwarded-for': fakeIp() } : {}), ...extraHeaders }
  const payload = method === 'GET' ? undefined : JSON.stringify(body || {})
  const [purePath, query] = path.split('?')

  let res
  if (BASE_URL) {
    res = await fetch(`${BASE_URL}/api/${httpRoute(purePath)}${query ? `?${query}` : ''}`, { method, headers, body: payload })
  } else {
    // Cada area tem uma funcao unica na Vercel; os modulos ficam em api/_<area>/.
    const modulePath = purePath === 'health' || purePath.startsWith('admin/billing/') ? purePath : purePath.replace(/^([a-z]+)\//, '_$1/')
    const mod = await import(`../api/${modulePath}.js`)
    res = await mod[method](new Request(`http://localhost/api/${path}`, { method, headers, body: payload }))
  }

  let data = null
  try { data = await res.json() } catch { data = null }
  return { status: res.status, data }
}
const client = (token) => createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false }, global: token ? { headers: { Authorization: `Bearer ${token}` } } : undefined })
const PASS = 'Teste@12345'
const PASS_RESIDENT = 'Morador@54321'
const created = { condos: [], authUsers: [], files: { cobrancas: [], documentos: [] } }
const rowsOf = (data) => data || []
const leaksFrom = (data, foreignIds) => rowsOf(data).some((row) => foreignIds.includes(row.condominium_id) || foreignIds.includes(row.condominio_id) || foreignIds.includes(row.id))

// Um condominio completo: sindico, unidade 101 alugada (proprietario + inquilino), contador,
// cobranca da unidade, aviso geral, aviso so para a unidade 101, ocorrencia do morador e documento publico.
async function setupCondo(label, P) {
  const doc = cnpj()
  const reg = await call('platform/condominiums/register', { body: {
    name: `E2E Seguranca ${label}`, cnpj: doc, whatsapp: '11999990000', unit_count: 5,
    address_details: { zip_code: '01001000', street: 'Rua Teste', number: '1', district: 'Centro', city: 'Sao Paulo', state: 'SP' },
    syndic_name: `Sindico ${label}`, syndic_cpf: cpf(), syndic_email: `e2e-sec-${label.toLowerCase()}-${Date.now()}@example.com`, password: PASS,
  } })
  const id = reg.data?.condominiumId
  created.condos.push(id)
  await call('platform/condominiums/update', { token: P, body: { condominiumId: id, action: 'approve', plan: 'trial' } })

  const S = (await call('auth/login-cnpj', { body: { cnpj: doc, password: PASS } })).data?.session?.access_token
  const owner = { nome: `Dono Completo Silva ${label}`, cpf: cpf(), whatsapp: '11911112222', email: '', password: PASS_RESIDENT }
  const tenant = { nome: `Inquilina Maria Souza ${label}`, cpf: cpf(), whatsapp: '11933334444', email: '', password: PASS_RESIDENT }
  const unit = await call('admin/units/save', { token: S, body: { numero: '101', situacao: 'alugada', responsavel_financeiro: 'inquilino', proprietario: owner, inquilino: tenant } })
  const unitId = unit.data?.unitId
  const accountantCpf = cpf()
  await call('admin/residents/create', { token: S, body: { role: 'contador', nome: `Contador ${label}`, whatsapp: '11955556666', cpf: accountantCpf, password: PASS_RESIDENT, apartamento: '' } })

  const [O, T, C] = await Promise.all([owner.cpf, tenant.cpf, accountantCpf].map(async (document) => (
    (await call('auth/login-cpf', { body: { cpf: document, password: PASS_RESIDENT } })).data?.session?.access_token
  )))

  const { data: people } = await supabaseAdmin.from('profiles').select('id, cpf, role').eq('condominium_id', id)
  const byCpf = (value) => people.find((person) => person.cpf === value)?.id
  const syndicId = people.find((person) => ['ADMIN_CONDOMINIUM', 'admin'].includes(person.role))?.id
  const tenantId = byCpf(tenant.cpf)

  const { data: charge } = await supabaseAdmin.from('cobrancas').insert({ condominium_id: id, condominio_id: id, morador_id: tenantId, descricao: `Taxa ${label}`, valor: 100, mes_referencia: '2026-09', vencimento: '2026-09-15', unidade_id: unitId, unidade_numero: '101', created_by: syndicId, boleto_path: `${id}/boletos/boleto-${label}.pdf` }).select('id').single()
  await supabaseAdmin.from('avisos').insert([
    { condominium_id: id, condominio_id: id, titulo: `Aviso geral ${label}`, conteudo: 'x', destinatario: 'todos', apartamento_destino: '', created_by: syndicId },
    { condominium_id: id, condominio_id: id, titulo: `Aviso unidade ${label}`, conteudo: 'segredo da unidade', destinatario: 'apartamento', apartamento_destino: '101', created_by: syndicId },
  ])
  const { data: occurrence } = await supabaseAdmin.from('ocorrencias_predio').insert({ condominium_id: id, condominio_id: id, titulo: `Ocorrencia ${label}`, descricao: 'x', categoria: 'geral', status: 'em_analise', apartamento: '101', created_by: tenantId }).select('id').single()
  const documentPath = `${id}/doc-${label}-${Date.now()}.pdf`
  await supabaseAdmin.storage.from('documentos').upload(documentPath, new Blob([`documento ${label}`], { type: 'application/pdf' }))
  created.files.documentos.push(documentPath)
  const { data: document } = await supabaseAdmin.from('documentos').insert({ condominium_id: id, condominio_id: id, titulo: `Documento ${label}`, arquivo_path: documentPath, arquivo_url: '', publico: true, created_by: syndicId }).select('id').single()
  const boletoPath = `${id}/boletos/boleto-${label}.pdf`
  await supabaseAdmin.storage.from('cobrancas').upload(boletoPath, new Blob([`boleto ${label}`], { type: 'application/pdf' }))
  created.files.cobrancas.push(boletoPath)

  return { label, id, doc, S, O, T, C, unitId, ownerId: byCpf(owner.cpf), tenantId, syndicId, chargeId: charge?.id, occurrenceId: occurrence?.id, documentId: document?.id, documentPath, boletoPath, owner, tenant }
}

try {
  const P = (await call('auth/login-cnpj', { body: { cnpj: process.env.PLATFORM_ADMIN_DOCUMENT, password: process.env.PLATFORM_ADMIN_PASSWORD } })).data?.session?.access_token
  check('setup', 'login do admin da plataforma', Boolean(P))

  // Tres condominios criados ao mesmo tempo, com a mesma numeracao de unidade (101).
  const [A, B, C] = await Promise.all([setupCondo('A', P), setupCondo('B', P), setupCondo('C', P)])
  const condos = [A, B, C]
  check('setup', 'tres condominios ativos ao mesmo tempo', condos.every((condo) => condo.id && condo.S && condo.O && condo.T && condo.C && condo.chargeId && condo.documentId))

  // ---------------- Uso simultaneo: cada um so enxerga o proprio ----------------
  const simultaneous = await Promise.all(condos.map(async (condo) => {
    const others = condos.filter((item) => item.id !== condo.id).map((item) => item.id)
    const db = client(condo.S)
    const [charges, units, profiles, notices, documents, occurrences, links, summary] = await Promise.all([
      db.from('cobrancas').select('*'),
      db.from('unidades').select('*'),
      db.from('profiles').select('*'),
      db.from('avisos').select('*'),
      db.from('documentos').select('*'),
      db.from('ocorrencias_predio').select('*'),
      db.from('unidade_vinculos').select('unidade_id'),
      call('tenant/charge-summary', { token: condo.O, method: 'GET' }),
    ])
    return {
      condo,
      leak: [charges, units, profiles, notices, documents, occurrences].some((res) => leaksFrom(res.data, others))
        || rowsOf(links.data).some((row) => condos.filter((item) => item.id !== condo.id).some((item) => item.unitId === row.unidade_id)),
      counts: { charges: rowsOf(charges.data).length, units: rowsOf(units.data).length, notices: rowsOf(notices.data).length, documents: rowsOf(documents.data).length, profiles: rowsOf(profiles.data).length },
      summary: summary.data,
    }
  }))
  for (const item of simultaneous) {
    check('Simultaneo', `condominio ${item.condo.label}: nenhum dado dos outros dois`, !item.leak, JSON.stringify(item.counts))
    check('Simultaneo', `condominio ${item.condo.label}: ve exatamente o proprio conteudo`, item.counts.charges === 1 && item.counts.units === 1 && item.counts.notices === 2 && item.counts.documents === 1 && item.counts.profiles === 4, JSON.stringify(item.counts))
    check('Simultaneo', `condominio ${item.condo.label}: resumo financeiro so do proprio`, item.summary?.total_unidades === 1 && item.summary?.unidades_cobradas === 1, JSON.stringify(item.summary))
  }

  // Matriz completa: cada papel de cada condominio lendo cada tabela ao mesmo tempo
  const TABLES = ['condominiums', 'profiles', 'unidades', 'unidade_vinculos', 'cobrancas', 'avisos', 'documentos', 'ocorrencias_predio', 'solicitacoes_cadastro']
  const ROLES = [['sindico', 'S'], ['proprietario', 'O'], ['inquilino', 'T'], ['contador', 'C']]
  const matrix = await Promise.all(condos.flatMap((condo) => ROLES.map(async ([roleName, key]) => {
    const others = condos.filter((item) => item.id !== condo.id).map((item) => item.id)
    const otherUnits = condos.filter((item) => item.id !== condo.id).map((item) => item.unitId)
    const db = client(condo[key])
    const reads = await Promise.all(TABLES.map(async (table) => ({ table, data: (await db.from(table).select('*')).data })))
    const leaked = reads.filter(({ table, data }) => (table === 'unidade_vinculos'
      ? rowsOf(data).some((row) => otherUnits.includes(row.unidade_id))
      : leaksFrom(data, others)))
    return { condo: condo.label, roleName, leaked: leaked.map((item) => item.table) }
  })))
  for (const item of matrix) {
    check('Simultaneo', `${item.roleName} do ${item.condo} nao le dado de outro condominio (9 tabelas)`, !item.leaked.length, item.leaked.join(', '))
  }

  // ---------------- Rotas da API ----------------
  const apiCases = [
    ['sindico A nao edita unidade do B', await call('admin/units/save', { token: A.S, body: { unitId: B.unitId, numero: '101', situacao: 'desocupada' } }), (r) => r.status >= 400],
    ['sindico A nao exclui unidade do B', await call('admin/units/delete', { token: A.S, body: { unitId: B.unitId } }), (r) => r.status >= 400],
    ['sindico A nao remove pessoa do B', await call('admin/residents/delete', { token: A.S, body: { userId: B.ownerId } }), (r) => r.status === 403],
    ['sindico A nao remove contador do C', await call('admin/residents/delete', { token: A.S, body: { userId: C.tenantId } }), (r) => r.status === 403],
    ['sindico nao lista condominios da plataforma', await call('platform/condominiums/list', { token: A.S, method: 'GET' }), (r) => r.status === 403],
    ['sindico nao exporta dados pela plataforma', await call('platform/condominiums/export', { token: A.S, method: 'GET' }), (r) => r.status === 403],
    ['sindico nao importa pessoas pela plataforma', await call('platform/condominiums/import', { token: A.S, body: { condominiumId: B.id, rows: [] } }), (r) => r.status === 403],
    ['sindico nao muda plano/status pela plataforma', await call('platform/condominiums/update', { token: A.S, body: { condominiumId: A.id, action: 'approve' } }), (r) => r.status === 403],
    ['sindico nao troca a senha do sindico do B', await call('platform/condominiums/update-syndic-password', { token: A.S, body: { condominiumId: B.id, password: 'NovaSenha@123' } }), (r) => r.status === 403],
    ['sindico nao le o status tecnico da plataforma', await call('platform/status', { token: A.S, method: 'GET' }), (r) => r.status === 403],
    ['morador nao usa rotas do sindico', await call('admin/units/save', { token: A.O, body: { numero: '999', situacao: 'desocupada' } }), (r) => r.status === 403],
    ['contador nao cadastra unidade', await call('admin/units/save', { token: A.C, body: { numero: '998', situacao: 'desocupada' } }), (r) => r.status === 403],
    ['contador nao cria acessos', await call('admin/residents/create', { token: A.C, body: { role: 'morador', nome: 'x', whatsapp: '11999999999', cpf: cpf(), password: PASS, apartamento: '102' } }), (r) => r.status === 403],
    ['sem login: rota do sindico recusa', await call('admin/units/save', { body: { numero: '999', situacao: 'desocupada' } }), (r) => r.status === 401],
    ['sem login: resumo do condominio recusa', await call('tenant/charge-summary', { method: 'GET' }), (r) => r.status === 401],
    ['login com senha errada recusado', await call('auth/login-cnpj', { body: { cnpj: B.doc, password: 'errada123' } }), (r) => r.status === 401],
    ['morador nao entra pelo CNPJ do condominio (senha dele)', await call('auth/login-cnpj', { body: { cnpj: A.doc, password: PASS_RESIDENT } }), (r) => r.status === 401],
    ['CPF do morador do A nao entra no condominio B', await call('auth/login-cpf', { body: { cpf: B.owner.cpf, password: PASS_RESIDENT } }), (r) => r.status === 200 && r.data?.profile?.condominium_id !== A.id],
  ]
  for (const [name, response, ok] of apiCases) check('API', name, ok(response), `status ${response.status}`)

  // CPF de outro condominio nao vaza nome nem permite roubo de cadastro
  const foreignCpf = await call('admin/units/save', { token: A.S, body: { numero: '102', situacao: 'ocupada', proprietario: { nome: 'Tentativa', cpf: B.owner.cpf, whatsapp: '11911112222', email: '', password: PASS_RESIDENT } } })
  check('API', 'CPF de outro condominio: recusa sem revelar o nome', foreignCpf.status === 409 && !JSON.stringify(foreignCpf.data).includes('Dono Completo Silva B'), JSON.stringify(foreignCpf.data).slice(0, 120))
  const { data: stillInB } = await supabaseAdmin.from('profiles').select('condominium_id').eq('id', B.ownerId).single()
  check('API', 'pessoa do B continua no B', stillInB.condominium_id === B.id)

  // Forca bruta: tentativas seguidas continuam recusadas (rate limit nao derruba a rota)
  const brute = []
  for (let i = 0; i < 6; i += 1) brute.push((await call('auth/login-cpf', { body: { cpf: A.owner.cpf, password: `errada${i}` } })).status)
  const afterBrute = await call('auth/login-cpf', { body: { cpf: A.owner.cpf, password: PASS_RESIDENT } })
  check('API', 'apos varias tentativas, o IP e barrado ou a senha certa entra', afterBrute.status === 200 || afterBrute.status === 429, 'status ' + afterBrute.status)
  check('API', 'tentativas seguidas de senha errada seguem recusadas', brute.every((status) => status === 401 || status === 429), brute.join(','))

  // ---------------- Banco (RLS) ----------------
  const sA = client(A.S)
  const oA = client(A.O)
  const tA = client(A.T)
  const cA = client(A.C)
  const oB = client(B.O)

  let res = await sA.from('cobrancas').insert({ condominium_id: B.id, condominio_id: B.id, morador_id: B.tenantId, descricao: 'invasao', valor: 1, vencimento: '2026-09-30' }).select()
  check('RLS', 'sindico A nao lanca cobranca no B', Boolean(res.error) || !res.data?.length)
  res = await sA.from('profiles').update({ nome: 'invadido' }).eq('id', B.ownerId).select()
  check('RLS', 'sindico A nao edita pessoa do B', !res.data?.length)
  res = await sA.from('avisos').update({ conteudo: 'invadido' }).eq('condominium_id', B.id).select()
  check('RLS', 'sindico A nao edita aviso do B', !res.data?.length)
  res = await sA.from('unidades').delete().eq('id', B.unitId).select()
  check('RLS', 'sindico A nao apaga unidade do B', !res.data?.length)
  res = await sA.from('condominiums').update({ name: 'invadido' }).eq('id', B.id).select()
  check('RLS', 'sindico A nao edita o condominio B', !res.data?.length)
  res = await sA.from('condominiums').update({ unit_count: 999 }).eq('id', A.id).select()
  check('RLS', 'sindico nao muda a quantidade de unidades do proprio condominio', !res.data?.length)

  const { data: ownerProfiles } = await oA.from('profiles').select('id, cpf')
  check('RLS', 'proprietario so le o proprio perfil (nao ve CPF de ninguem)', rowsOf(ownerProfiles).length === 1 && ownerProfiles[0].id === A.ownerId, `${rowsOf(ownerProfiles).length} perfis`)
  const { data: tenantNotices } = await tA.from('avisos').select('titulo, condominium_id')
  check('RLS', 'inquilino ve os avisos do proprio condominio', rowsOf(tenantNotices).length === 2 && !leaksFrom(tenantNotices, [B.id, C.id]))
  const { data: foreignUnitNotice } = await oB.from('avisos').select('titulo, condominium_id')
  check('RLS', 'aviso da unidade 101 do A nao aparece para a unidade 101 do B', !rowsOf(foreignUnitNotice).some((row) => / A$| C$/.test(row.titulo)) && !leaksFrom(foreignUnitNotice, [A.id, C.id]), rowsOf(foreignUnitNotice).map((row) => row.titulo).join(' | '))
  const { data: tenantCharges } = await tA.from('cobrancas').select('id, condominium_id')
  check('RLS', 'inquilino ve a cobranca dele e nada dos outros', rowsOf(tenantCharges).some((row) => row.id === A.chargeId) && !leaksFrom(tenantCharges, [B.id, C.id]))
  const { data: ownerCharges } = await oA.from('cobrancas').select('id')
  check('RLS (SQL 09-22)', 'proprietario ve a cobranca da unidade dele', rowsOf(ownerCharges).some((row) => row.id === A.chargeId), `${rowsOf(ownerCharges).length} cobrancas`)
  const { data: accountantCharges } = await cA.from('cobrancas').select('id, condominium_id')
  check('RLS', 'contador ve so as cobrancas do proprio condominio', rowsOf(accountantCharges).length === 1 && !leaksFrom(accountantCharges, [B.id, C.id]))
  res = await cA.from('cobrancas').update({ valor: 1 }).eq('id', A.chargeId).select()
  check('RLS', 'contador nao altera cobranca (so leitura)', Boolean(res.error) || !res.data?.length)
  const { data: foreignDocuments } = await oB.from('documentos').select('id, condominium_id')
  check('RLS', 'morador do B nao ve documento do A na lista', !rowsOf(foreignDocuments).some((row) => row.id === A.documentId))
  const { data: foreignOccurrences } = await oB.from('ocorrencias_predio').select('id')
  check('RLS', 'morador do B nao ve ocorrencia do A', !rowsOf(foreignOccurrences).some((row) => row.id === A.occurrenceId))
  const { data: ownOccurrences } = await tA.from('ocorrencias_predio').select('id')
  check('RLS', 'morador ve a propria ocorrencia', rowsOf(ownOccurrences).some((row) => row.id === A.occurrenceId))
  res = await oA.from('cobrancas').insert({ condominium_id: A.id, condominio_id: A.id, morador_id: A.ownerId, descricao: 'x', valor: 1, vencimento: '2026-09-30' }).select()
  check('RLS', 'morador nao lanca cobranca', Boolean(res.error) || !res.data?.length)
  res = await oA.from('avisos').insert({ condominium_id: A.id, condominio_id: A.id, titulo: 'x', conteudo: 'x', destinatario: 'todos' }).select()
  check('RLS', 'morador nao publica aviso', Boolean(res.error) || !res.data?.length)
  res = await oA.from('cobrancas').update({ payment_status: 'PAID', pago: true }).eq('id', A.chargeId).select()
  check('RLS', 'morador nao marca a propria cobranca como paga', Boolean(res.error) || !res.data?.length)
  res = await oA.from('unidades').update({ situacao: 'ocupada' }).eq('id', A.unitId).select()
  check('RLS', 'morador nao altera a unidade', Boolean(res.error) || !res.data?.length)

  // Escalada de privilegio
  await oA.from('profiles').update({ role: 'admin' }).eq('id', A.ownerId)
  let { data: after } = await supabaseAdmin.from('profiles').select('role, condominium_id').eq('id', A.ownerId).single()
  check('RLS (SQL 09-22)', 'morador NAO vira sindico editando o proprio perfil', after.role === 'morador', `role agora: ${after.role}`)
  await supabaseAdmin.from('profiles').update({ role: 'morador' }).eq('id', A.ownerId)
  await oA.from('profiles').update({ condominium_id: B.id, condominio_id: B.id }).eq('id', A.ownerId)
  ;({ data: after } = await supabaseAdmin.from('profiles').select('condominium_id').eq('id', A.ownerId).single())
  check('RLS (SQL 09-22)', 'morador NAO muda de condominio sozinho', after.condominium_id === A.id)
  await supabaseAdmin.from('profiles').update({ condominium_id: A.id, condominio_id: A.id }).eq('id', A.ownerId)
  await oA.from('profiles').update({ ativo: true, cpf: B.owner.cpf }).eq('id', A.ownerId)
  ;({ data: after } = await supabaseAdmin.from('profiles').select('cpf').eq('id', A.ownerId).single())
  check('RLS (SQL 09-22)', 'morador NAO troca o proprio CPF', after.cpf === A.owner.cpf)
  await sA.from('profiles').update({ role: 'PLATFORM_ADMIN' }).eq('id', A.ownerId)
  ;({ data: after } = await supabaseAdmin.from('profiles').select('role').eq('id', A.ownerId).single())
  check('RLS (SQL 09-22)', 'sindico NAO promove morador a admin da plataforma', after.role === 'morador', `role agora: ${after.role}`)
  await supabaseAdmin.from('profiles').update({ role: 'morador', cpf: A.owner.cpf }).eq('id', A.ownerId)

  // Perfil compartilhado da unidade
  const ownerView = await oA.rpc('my_unit_people')
  const tenantRow = ownerView.data?.[0]
  check('Perfil (SQL 09-22)', 'proprietario ve o inquilino so como "Nome Sobrenome", sem CPF', !ownerView.error && tenantRow?.pessoa_nome === 'Inquilina A' && !('pessoa_cpf' in (tenantRow || {})), ownerView.error?.message || tenantRow?.pessoa_nome)
  const tenantView = await tA.rpc('my_unit_people')
  check('Perfil (SQL 09-22)', 'inquilino nao ve dados do proprietario', !tenantView.error && !tenantView.data?.[0]?.pessoa_nome, tenantView.error?.message || JSON.stringify(tenantView.data?.[0]))
  const foreignView = await oB.rpc('my_unit_people')
  check('Perfil (SQL 09-22)', 'cada um so ve a propria unidade', !foreignView.error && (foreignView.data || []).every((row) => row.unidade_id === B.unitId), foreignView.error?.message)

  // ---------------- Arquivos ----------------
  const pdf = new Blob(['%PDF-1.4 teste'], { type: 'application/pdf' })
  const ownPath = `${A.id}/boletos/e2e-${Date.now()}.pdf`
  const up = await sA.storage.from('cobrancas').upload(ownPath, pdf)
  if (!up.error) created.files.cobrancas.push(ownPath)
  check('Storage', 'sindico A envia arquivo na pasta do A', !up.error, up.error?.message)
  const foreignPath = `${B.id}/boletos/e2e-invasao-${Date.now()}.pdf`
  const upForeign = await sA.storage.from('cobrancas').upload(foreignPath, pdf)
  if (!upForeign.error) created.files.cobrancas.push(foreignPath)
  check('Storage (SQL 09-22)', 'sindico A NAO grava na pasta do B', Boolean(upForeign.error))
  check('Storage (SQL 09-22)', 'sindico B NAO le boleto do A', Boolean((await client(B.S).storage.from('cobrancas').download(A.boletoPath)).error))
  check('Storage (SQL 09-22)', 'contador do B NAO le boleto do A', Boolean((await client(B.C).storage.from('cobrancas').download(A.boletoPath)).error))
  check('Storage', 'inquilino do A le o boleto da cobranca dele', !(await tA.storage.from('cobrancas').download(A.boletoPath)).error)
  check('Storage', 'morador do B NAO le boleto do A', Boolean((await oB.storage.from('cobrancas').download(A.boletoPath)).error))
  check('Storage (SQL 09-22)', 'sindico B NAO apaga arquivo do A', Boolean((await client(B.S).storage.from('cobrancas').remove([A.boletoPath])).error) || Boolean((await supabaseAdmin.storage.from('cobrancas').download(A.boletoPath)).data))
  check('Storage', 'morador do B NAO le documento do A', Boolean((await oB.storage.from('documentos').download(A.documentPath)).error))
  check('Storage', 'morador do A le o documento publico do A', !(await oA.storage.from('documentos').download(A.documentPath)).error)
  const signed = await client(B.S).storage.from('documentos').createSignedUrl(A.documentPath, 60)
  check('Storage (SQL 09-22)', 'sindico B NAO gera link assinado do documento do A', Boolean(signed.error))
  const listed = await client(B.S).storage.from('cobrancas').list(A.id)
  check('Storage (SQL 09-22)', 'sindico B NAO lista a pasta do A', Boolean(listed.error) || !rowsOf(listed.data).length, `${rowsOf(listed.data).length} arquivos`)

  // ---------------- Sem login ----------------
  const anon = client(null)
  for (const table of ['profiles', 'cobrancas', 'condominiums', 'unidades', 'unidade_vinculos', 'avisos', 'documentos', 'ocorrencias_predio', 'solicitacoes_cadastro']) {
    const { data } = await anon.from(table).select('*').limit(5)
    check('Anonimo', `sem login nao le ${table}`, !rowsOf(data).length, `${rowsOf(data).length} linhas`)
  }
  check('Anonimo', 'sem login nao le arquivos', Boolean((await anon.storage.from('documentos').download(A.documentPath)).error))

  const signupEmail = `e2e-signup-${Date.now()}@webcond-teste.com`
  const signup = await anon.auth.signUp({ email: signupEmail, password: PASS, options: { data: { role: 'PLATFORM_ADMIN', nome: 'Invasor' } } })
  if (signup.data?.user?.id) created.authUsers.push(signup.data.user.id)
  if (signup.error) {
    check('Auth', 'cadastro publico do Supabase bloqueado', true, signup.error.message)
  } else {
    const { data: rogue } = await supabaseAdmin.from('profiles').select('role, ativo, condominium_id').eq('id', signup.data.user.id).maybeSingle()
    check('Auth (SQL 09-22)', 'cadastro publico NAO cria admin da plataforma', !rogue || (rogue.role === 'morador' && rogue.ativo === false && !rogue.condominium_id), JSON.stringify(rogue))
    const rogueClient = client(signup.data.session?.access_token)
    if (signup.data.session?.access_token) {
      const { data: rogueSees } = await rogueClient.from('condominiums').select('id')
      check('Auth (SQL 09-22)', 'conta nova sem condominio nao le nenhum condominio', !rowsOf(rogueSees).length, `${rowsOf(rogueSees).length} condominios`)
    }
    check('Auth', 'cadastro publico do Supabase desativado (recomendado)', false, 'desative em Authentication > Sign In / Providers')
  }

  // ---------------- Auto-cadastro por link (SQL 09-24) ----------------
  const G = 'Auto-cadastro'
  class Limited extends Error {}
  const limited = (response) => Boolean(BASE_URL) && response.status === 429
  const person = (document, extra = {}) => ({ nome: 'Novo Morador Teste', cpf: document, whatsapp: '(11) 91111-2222', email: '', password: PASS_RESIDENT, ...extra })
  const signupBody = (token, over = {}) => ({ token, situacao: 'ocupada', apartamento: '202', aceite: true, proprietario: person(cpf()), inquilino: null, ...over })
  const send = async (body, options = {}) => {
    const response = await call('auth/cadastro-enviar', { ip: true, body, ...options })
    if (limited(response)) throw new Limited()
    return response
  }
  const info = (token) => call(`auth/cadastro-info?token=${encodeURIComponent(token)}`, { method: 'GET', ip: true })
  const review = (token, body) => call('admin/signup/review', { token, body })
  const loginCpf = (document) => call('auth/login-cpf', { ip: true, body: { cpf: document, password: PASS_RESIDENT } })
  const anonClient = client(null)

  const linkA = (await call('admin/signup/link', { token: A.S, body: { action: 'gerar' } })).data?.convite
  const linkB = (await call('admin/signup/link', { token: B.S, body: { action: 'gerar' } })).data?.convite
  check(G, 'cada sindico gera o link do proprio condominio', Boolean(linkA?.token) && Boolean(linkB?.token) && linkA.token !== linkB.token)
  check(G, 'o link nao carrega id de condominio nem de quem o criou', !JSON.stringify(linkA).includes(A.id) && !JSON.stringify(linkA).includes(A.syndicId))
  check(G, 'cada sindico so le o proprio link', (await call('admin/signup/link', { token: A.S, method: 'GET' })).data?.convite?.token === linkA.token && (await call('admin/signup/link', { token: B.S, method: 'GET' })).data?.convite?.token === linkB.token)
  for (const [name, token, expected] of [['proprietario', A.O, 403], ['inquilino', A.T, 403], ['contador', A.C, 403], ['sem login', undefined, 401]]) {
    check(G, `${name} nao gera link de cadastro`, (await call('admin/signup/link', { token, body: { action: 'gerar' } })).status === expected)
  }
  check(G, 'proprietario nao le o link', (await call('admin/signup/link', { token: A.O, method: 'GET' })).status === 403)
  check(G, 'sem login nao le o link', (await call('admin/signup/link', { method: 'GET' })).status === 401)

  // Direto no banco: o token nunca sai pelo PostgREST e ninguem forja convite ou solicitacao.
  check(G, 'sem login nao le convites pelo banco', !rowsOf((await anonClient.from('condominio_convites').select('*')).data).length)
  check(G, 'nem o sindico le o token pelo banco (so pela API)', !rowsOf((await sA.from('condominio_convites').select('*')).data).length)
  res = await sA.from('condominio_convites').insert({ condominium_id: A.id, token: `forjado-${Date.now()}` }).select()
  check(G, 'sindico nao forja token direto no banco', Boolean(res.error) || !res.data?.length)
  res = await anonClient.from('solicitacoes_cadastro').insert({ condominium_id: B.id, condominio_id: B.id, nome: 'Spam', email: 'spam@example.com', cpf: cpf() }).select()
  check(G, 'sem login ninguem insere solicitacao em condominio algum (brecha antiga fechada)', Boolean(res.error) || !res.data?.length, res.error?.message)
  res = await oA.from('solicitacoes_cadastro').insert({ condominium_id: A.id, condominio_id: A.id, nome: 'Spam', email: 'spam@example.com', cpf: cpf() }).select()
  check(G, 'morador logado tambem nao insere solicitacao direto no banco', Boolean(res.error) || !res.data?.length)
  res = await oA.from('profiles').update({ aceite_versao: '1.0', aceite_em: new Date().toISOString() }).eq('id', A.ownerId).select('aceite_versao')
  check(G, 'morador registra o proprio aceite dos termos', res.data?.[0]?.aceite_versao === '1.0', res.error?.message)
  res = await oA.from('profiles').update({ aceite_versao: 'forjado' }).eq('id', B.ownerId).select()
  check(G, 'morador nao registra aceite em nome de outra pessoa', !res.data?.length)

  // Pagina publica: mostra so o nome do condominio do token.
  const infoA = await info(linkA.token)
  const infoB = await info(linkB.token)
  check(G, 'cada link abre o formulario do proprio condominio', infoA.status === 200 && infoA.data?.condominio === 'E2E Seguranca A' && infoB.data?.condominio === 'E2E Seguranca B', `${infoA.data?.condominio} / ${infoB.data?.condominio}`)
  check(G, 'a resposta publica nao traz id nem dado de morador', !JSON.stringify(infoA.data).includes(A.id) && Object.keys(infoA.data || {}).sort().join() === 'condominio,politicaVersao')
  const bogus = await info('inventado-123')
  check(G, 'token inventado: recusa generica', bogus.status === 404 && !JSON.stringify(bogus.data).includes('E2E'))
  check(G, 'origem de outro site e recusada', (await call('auth/cadastro-enviar', { ip: true, headers: { origin: 'https://site-falso.example' }, body: signupBody('inventado-123') })).status === 403)

  try {
    const inventedCpf = cpf()
    const bogusSend = await send(signupBody('inventado-123', { proprietario: person(inventedCpf) }))
    check(G, 'token inventado nao cria cadastro', bogusSend.status === 404 && !rowsOf((await supabaseAdmin.from('profiles').select('id').eq('cpf', inventedCpf)).data).length)

    // Fluxo 1: morando. O corpo tenta apontar para o condominio B; so o token conta.
    const r1 = { cpf: cpf(), email: `e2e-signup-r1-${Date.now()}@webcond-teste.com` }
    const r1Res = await send(signupBody(linkA.token, { condominium_id: B.id, condominiumId: B.id, condominio_id: B.id, proprietario: person(r1.cpf, { email: r1.email }) }))
    check(G, 'cadastro pelo link entra', r1Res.status === 200, JSON.stringify(r1Res.data))
    const { data: r1Profile } = await supabaseAdmin.from('profiles').select('*').eq('cpf', r1.cpf).maybeSingle()
    check(G, 'a conta nasce no condominio do link (A), e nao no B enviado no corpo', r1Profile?.condominium_id === A.id && r1Profile?.condominio_id === A.id && r1Profile?.role === 'morador')
    check(G, 'a conta nasce inativa, aguardando o sindico', r1Profile?.ativo === false)
    const { data: r1Request } = await supabaseAdmin.from('solicitacoes_cadastro').select('*').eq('profile_id', r1Profile?.id).maybeSingle()
    check(G, 'solicitacao pendente no A, com o aceite registrado', r1Request?.condominium_id === A.id && r1Request?.status === 'pendente' && Boolean(r1Request?.aceite_versao) && Boolean(r1Request?.aceite_em) && r1Request?.situacao === 'ocupada')
    check(G, 'nenhuma tabela guarda a senha escolhida', !JSON.stringify([r1Profile, r1Request]).includes(PASS_RESIDENT))
    check(G, 'antes da aprovacao o login por CPF e recusado', (await loginCpf(r1.cpf)).status >= 400)
    const direct = await anonClient.auth.signInWithPassword({ email: r1.email, password: PASS_RESIDENT })
    check(G, 'antes da aprovacao nem o login direto no Auth funciona (conta bloqueada)', Boolean(direct.error) && !direct.data?.session, direct.error?.message)

    const dup = await send(signupBody(linkA.token, { proprietario: person(r1.cpf) }))
    check(G, 'mesmo CPF ja pendente: nao duplica', dup.status === 409 && dup.data?.code === 'JA_ENVIADO', `status ${dup.status}`)
    const inUse = await send(signupBody(linkA.token, { proprietario: person(B.owner.cpf) }))
    check(G, 'CPF ja usado em outro condominio: recusa sem dizer onde nem de quem', inUse.status === 409 && inUse.data?.code === 'CPF_EM_USO' && !JSON.stringify(inUse.data).includes('Seguranca') && !JSON.stringify(inUse.data).includes('Dono Completo'), JSON.stringify(inUse.data))
    for (const [name, body] of [
      ['sem aceitar os termos, nao envia', signupBody(linkA.token, { aceite: false })],
      ['CPF invalido, nao envia', signupBody(linkA.token, { proprietario: person('11111111111') })],
      ['senha curta, nao envia', signupBody(linkA.token, { proprietario: person(cpf(), { password: '123' }) })],
      ['situacao invalida, nao envia', signupBody(linkA.token, { situacao: 'qualquer' })],
      ['inquilino com o CPF do proprietario, nao envia', (() => { const same = cpf(); return signupBody(linkA.token, { situacao: 'alugada', proprietario: person(same), inquilino: { ...person(same), acesso: true } }) })()],
    ]) {
      const response = await send(body)
      check(G, name, response.status === 400, `status ${response.status}`)
    }

    // Isolamento do aprovador
    check(G, 'sindico B nao aprova cadastro do A', (await review(B.S, { requestId: r1Request.id, action: 'aprovar', numero: '202' })).status === 404)
    check(G, 'sindico B nao recusa cadastro do A', (await review(B.S, { requestId: r1Request.id, action: 'recusar' })).status === 404)
    check(G, 'a conta do A segue intacta depois da tentativa do B', rowsOf((await supabaseAdmin.from('profiles').select('id').eq('id', r1Profile.id)).data).length === 1)
    check(G, 'proprietario nao aprova', (await review(A.O, { requestId: r1Request.id, action: 'aprovar', numero: '202' })).status === 403)
    check(G, 'contador nao aprova', (await review(A.C, { requestId: r1Request.id, action: 'aprovar', numero: '202' })).status === 403)
    check(G, 'sindico A ve a solicitacao pendente', rowsOf((await sA.from('solicitacoes_cadastro').select('id')).data).some((row) => row.id === r1Request.id))
    check(G, 'sindico B nao ve a solicitacao do A', !rowsOf((await client(B.S).from('solicitacoes_cadastro').select('id')).data).some((row) => row.id === r1Request.id))
    check(G, 'morador nao le solicitacoes de cadastro', !rowsOf((await oA.from('solicitacoes_cadastro').select('id')).data).length)
    res = await client(B.S).from('solicitacoes_cadastro').update({ status: 'aprovado' }).eq('id', r1Request.id).select()
    check(G, 'sindico B nao altera solicitacao do A pelo banco', !res.data?.length)

    // Aprovacao
    const approved = await review(A.S, { requestId: r1Request.id, action: 'aprovar', numero: '202' })
    check(G, 'sindico A aprova', approved.status === 200 && approved.data?.numero === '202', JSON.stringify(approved.data))
    const login1 = await loginCpf(r1.cpf)
    check(G, 'aprovado: entra com o CPF e a senha que ele mesmo escolheu', login1.status === 200 && Boolean(login1.data?.session?.access_token), `status ${login1.status}`)
    const { data: link1 } = await supabaseAdmin.from('unidade_vinculos').select('vinculo, unidades(numero, condominium_id, situacao)').eq('profile_id', r1Profile.id)
    check(G, 'vinculo de proprietario na unidade 202 do A, ocupada', link1?.length === 1 && link1[0].vinculo === 'proprietario' && link1[0].unidades?.condominium_id === A.id && link1[0].unidades?.numero === '202' && link1[0].unidades?.situacao === 'ocupada')
    const newcomer = client(login1.data?.session?.access_token)
    const [newcomerUnits, newcomerNotices] = await Promise.all([newcomer.from('unidades').select('condominium_id'), newcomer.from('avisos').select('condominium_id')])
    check(G, 'o morador aprovado so enxerga o proprio condominio', !leaksFrom(newcomerUnits.data, [B.id, C.id]) && !leaksFrom(newcomerNotices.data, [B.id, C.id]))
    check(G, 'solicitacao aprovada nao pode ser aprovada de novo', (await review(A.S, { requestId: r1Request.id, action: 'aprovar', numero: '202' })).status === 409)

    // Fluxo 2: alugado, inquilino COM acesso
    const r2 = { owner: cpf(), tenant: cpf() }
    const r2Res = await send(signupBody(linkA.token, { situacao: 'alugada', apartamento: '203', proprietario: person(r2.owner), inquilino: { ...person(r2.tenant, { nome: 'Inquilino Com Acesso Teste' }), acesso: true } }))
    check(G, 'alugado com acesso: cadastro entra', r2Res.status === 200, JSON.stringify(r2Res.data))
    const { data: r2People } = await supabaseAdmin.from('profiles').select('id, cpf, ativo, condominium_id').in('cpf', [r2.owner, r2.tenant])
    check(G, 'proprietario e inquilino nascem no A, os dois inativos', r2People?.length === 2 && r2People.every((row) => row.condominium_id === A.id && row.ativo === false))
    const { data: r2Request } = await supabaseAdmin.from('solicitacoes_cadastro').select('id').eq('cpf', r2.owner).eq('status', 'pendente').single()
    const r2Approved = await review(A.S, { requestId: r2Request?.id, action: 'aprovar', numero: '203' })
    check(G, 'sindico aprova o alugado', r2Approved.status === 200, JSON.stringify(r2Approved.data))
    const [r2OwnerLogin, r2TenantLogin] = await Promise.all([loginCpf(r2.owner), loginCpf(r2.tenant)])
    check(G, 'apos aprovar, proprietario e inquilino entram com a senha de cada um', r2OwnerLogin.status === 200 && r2TenantLogin.status === 200)
    const { data: r2Links } = await supabaseAdmin.from('unidade_vinculos').select('vinculo, profiles(cpf), unidades(numero, situacao)').in('profile_id', (r2People || []).map((row) => row.id))
    const roleOf = (document) => r2Links?.find((row) => row.profiles?.cpf === document)?.vinculo
    check(G, 'vinculos corretos e unidade 203 alugada', roleOf(r2.owner) === 'proprietario' && roleOf(r2.tenant) === 'inquilino' && r2Links?.every((row) => row.unidades?.numero === '203' && row.unidades?.situacao === 'alugada'))

    // Fluxo 3: alugado, inquilino SEM acesso
    const r3 = { owner: cpf(), tenant: cpf() }
    const r3Res = await send(signupBody(linkA.token, { situacao: 'alugada', apartamento: '204', proprietario: person(r3.owner), inquilino: { ...person(r3.tenant, { nome: 'Inquilino Sem Acesso Teste', password: '' }), acesso: false } }))
    check(G, 'alugado sem acesso: cadastro entra sem senha do inquilino', r3Res.status === 200, JSON.stringify(r3Res.data))
    check(G, 'inquilino sem acesso: nenhuma conta criada para ele', !rowsOf((await supabaseAdmin.from('profiles').select('id').eq('cpf', r3.tenant)).data).length)
    const { data: r3Request } = await supabaseAdmin.from('solicitacoes_cadastro').select('id').eq('cpf', r3.owner).eq('status', 'pendente').single()
    check(G, 'sindico aprova o alugado sem acesso', (await review(A.S, { requestId: r3Request?.id, action: 'aprovar', numero: '204' })).status === 200)
    const { data: unit204 } = await supabaseAdmin.from('unidades').select('situacao, observacao').eq('condominium_id', A.id).eq('numero', '204').single()
    check(G, 'o inquilino sem acesso fica anotado na unidade, sem conta', unit204?.situacao === 'alugada' && String(unit204?.observacao).includes('Inquilino Sem Acesso Teste') && !rowsOf((await supabaseAdmin.from('profiles').select('id').eq('cpf', r3.tenant)).data).length)

    // Fluxo 4: recusar apaga tudo o que o envio criou
    const r4 = { cpf: cpf(), email: `e2e-signup-r4-${Date.now()}@webcond-teste.com` }
    const r4Res = await send(signupBody(linkA.token, { situacao: 'desocupada', apartamento: '205', proprietario: person(r4.cpf, { email: r4.email }) }))
    const { data: r4Profile } = await supabaseAdmin.from('profiles').select('id').eq('cpf', r4.cpf).maybeSingle()
    const { data: r4Request } = await supabaseAdmin.from('solicitacoes_cadastro').select('id').eq('profile_id', r4Profile?.id).maybeSingle()
    const refused = await review(A.S, { requestId: r4Request?.id, action: 'recusar', motivo: 'teste automatizado' })
    const { data: r4After } = await supabaseAdmin.from('solicitacoes_cadastro').select('status, profile_id').eq('id', r4Request?.id).single()
    const r4Gone = await supabaseAdmin.auth.admin.getUserById(r4Profile?.id)
    check(G, 'recusar apaga a conta criada no envio (perfil e Auth) e marca rejeitado', r4Res.status === 200 && refused.status === 200 && r4After?.status === 'rejeitado' && !r4After?.profile_id && !rowsOf((await supabaseAdmin.from('profiles').select('id').eq('id', r4Profile?.id)).data).length && !r4Gone.data?.user)
    check(G, 'quem foi recusado nao entra', (await loginCpf(r4.cpf)).status >= 400)
    check(G, 'a unidade da solicitacao recusada nao foi criada', !rowsOf((await supabaseAdmin.from('unidades').select('id').eq('condominium_id', A.id).eq('numero', '205')).data).length)

    // Mesmo formulario, links diferentes: cada cadastro cai so no condominio do seu link.
    const r5Cpf = cpf()
    const r5Res = await send(signupBody(linkB.token, { apartamento: '301', condominium_id: A.id, condominiumId: A.id, condominio_id: A.id, proprietario: person(r5Cpf) }))
    const { data: r5Profile } = await supabaseAdmin.from('profiles').select('condominium_id, ativo').eq('cpf', r5Cpf).maybeSingle()
    const { data: r5Request } = await supabaseAdmin.from('solicitacoes_cadastro').select('condominium_id').eq('cpf', r5Cpf).maybeSingle()
    check(G, 'cadastro pelo link do B cai so no B (id do A no corpo e ignorado)', r5Res.status === 200 && r5Profile?.condominium_id === B.id && r5Request?.condominium_id === B.id && r5Profile?.ativo === false)
    check(G, 'sindico A nao ve o cadastro pendente do B', !rowsOf((await sA.from('solicitacoes_cadastro').select('id, cpf')).data).some((row) => row.cpf === r5Cpf))

    // Ciclo de vida do link
    const rotated = (await call('admin/signup/link', { token: A.S, body: { action: 'gerar' } })).data?.convite
    check(G, 'gerar link novo invalida o anterior', Boolean(rotated?.token) && rotated.token !== linkA.token && (await info(linkA.token)).status === 404 && (await info(rotated.token)).status === 200)
    const lateSend = await send(signupBody(linkA.token))
    check(G, 'o link antigo nao aceita mais cadastro', lateSend.status === 404)
    await supabaseAdmin.from('condominio_convites').update({ expira_em: new Date(Date.now() - 86400000).toISOString() }).eq('condominium_id', A.id).eq('ativo', true)
    const expired = await info(rotated.token)
    check(G, 'link expirado e recusado', expired.status === 404 && expired.data?.code === 'LINK_EXPIRADO', JSON.stringify(expired.data))
    await call('admin/signup/link', { token: B.S, body: { action: 'desativar' } })
    const revoked = await info(linkB.token)
    check(G, 'link desativado e recusado', revoked.status === 404 && revoked.data?.code === 'LINK_INVALIDO', JSON.stringify(revoked.data))
    // Deixa o link do A ativo e valido para o teste de plano vencido, mais abaixo.
    await supabaseAdmin.from('condominio_convites').update({ expira_em: new Date(Date.now() + 86400000).toISOString() }).eq('condominium_id', A.id).eq('ativo', true)
    A.inviteToken = rotated.token
  } catch (error) {
    if (!(error instanceof Limited)) throw error
    skip(G, 'restante dos fluxos de cadastro', 'limite de 5 envios por hora por IP no site publicado')
  }

  // ---------------- Pessoa removida da unidade perde o acesso na hora ----------------
  const removed = await call('admin/units/delete', { token: C.S, body: { unitId: C.unitId } })
  const removedClient = client(C.T)
  const [{ data: removedCharges }, { data: removedNotices }] = await Promise.all([
    removedClient.from('cobrancas').select('id'),
    removedClient.from('avisos').select('id'),
  ])
  check('Acesso (SQL 09-22)', 'pessoa removida da unidade perde o acesso na hora (token antigo)', removed.status === 200 && !rowsOf(removedCharges).length && !rowsOf(removedNotices).length, `cobrancas ${rowsOf(removedCharges).length}, avisos ${rowsOf(removedNotices).length}`)
  check('Acesso', 'login da pessoa removida e recusado', (await call('auth/login-cpf', { body: { cpf: C.tenant.cpf, password: PASS_RESIDENT } })).status >= 400)

  // ---------------- Plano vencido e Parceria ----------------
  await call('platform/condominiums/update', { token: P, body: { condominiumId: A.id, action: 'status', status: 'active', plan: 'ONE', plan_expires_at: '2020-01-01' } })
  res = await sA.from('avisos').insert({ condominium_id: A.id, condominio_id: A.id, titulo: 'x', conteudo: 'x', destinatario: 'todos', created_by: A.syndicId }).select()
  check('Plano (SQL 09-21)', 'plano vencido: banco bloqueia aviso do sindico', Boolean(res.error) || !res.data?.length)
  check('Plano', 'plano vencido: sindico continua lendo', rowsOf((await sA.from('cobrancas').select('id')).data).length >= 1)
  check('Plano', 'plano vencido: API recusa alteracao', (await call('admin/units/save', { token: A.S, body: { numero: '105', situacao: 'desocupada' } })).status === 402)
  check('Plano', 'plano vencido: API recusa gerar link de cadastro', (await call('admin/signup/link', { token: A.S, body: { action: 'gerar' } })).status === 402)
  check('Plano', 'plano vencido: API recusa aprovar cadastro', (await call('admin/signup/review', { token: A.S, body: { requestId: '00000000-0000-0000-0000-000000000000', action: 'aprovar', numero: '9' } })).status === 402)
  if (A.inviteToken) {
    const lockedInfo = await call(`auth/cadastro-info?token=${encodeURIComponent(A.inviteToken)}`, { method: 'GET', ip: true })
    check('Plano', 'plano vencido: o link deixa de receber cadastros', lockedInfo.status === 403, `status ${lockedInfo.status}`)
  }
  res = await client(B.S).from('avisos').insert({ condominium_id: B.id, condominio_id: B.id, titulo: 'ok', conteudo: 'ok', destinatario: 'todos', created_by: B.syndicId }).select()
  check('Plano', 'condominio B (em dia) nao e afetado pelo vencimento do A', !res.error, res.error?.message)
  await call('platform/condominiums/update', { token: P, body: { condominiumId: B.id, action: 'status', status: 'active', plan: 'PARCERIA' } })
  const list = await call('platform/condominiums/list', { token: P, method: 'GET' })
  const bRow = (list.data?.condominiums || []).find((row) => row.id === B.id)
  check('Plano', 'Parceria: ativo, sem vencimento e sem bloqueio', bRow?.plan_name === 'PARCERIA' && !bRow?.plan_ends_at && !bRow?.plan_locked, JSON.stringify({ plan: bRow?.plan_name, ends: bRow?.plan_ends_at }))
  const status = await call('platform/status', { token: P, method: 'GET' })
  check('Plataforma', 'status detalhado responde para o admin', status.status === 200 && Array.isArray(status.data?.components), `${status.data?.overall} ${status.data?.serverMs}ms`)
} catch (error) {
  check('execucao', 'sem excecao', false, error.stack)
} finally {
  for (const [bucket, paths] of Object.entries(created.files)) if (paths.length) await supabaseAdmin.storage.from(bucket).remove(paths)
  for (const id of created.authUsers) { await supabaseAdmin.from('profiles').delete().eq('id', id); await supabaseAdmin.auth.admin.deleteUser(id) }
  for (const id of created.condos.filter(Boolean)) {
    const { data: people } = await supabaseAdmin.from('profiles').select('id').or(`condominium_id.eq.${id},condominio_id.eq.${id}`)
    for (const table of ['cobrancas', 'avisos', 'documentos', 'ocorrencias_predio', 'solicitacoes_cadastro']) await supabaseAdmin.from(table).delete().or(`condominium_id.eq.${id},condominio_id.eq.${id}`)
    await supabaseAdmin.from('unidades').delete().eq('condominium_id', id)
    for (const person of people || []) { await supabaseAdmin.from('profiles').delete().eq('id', person.id); await supabaseAdmin.auth.admin.deleteUser(person.id) }
    const { error } = await supabaseAdmin.from('condominiums').delete().eq('id', id)
    console.log(error ? `LIMPEZA FALHOU ${id}: ${error.message}` : `limpeza ok ${id}`)
  }
  const failed = results.filter((item) => !item.ok)
  console.log(`\n${results.length - failed.length}/${results.length} ok`)
  if (failed.length) console.log('FALHAS:\n' + failed.map((item) => ` - [${item.group}] ${item.name}`).join('\n'))
  process.exitCode = failed.length ? 1 : 0
}
