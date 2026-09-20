// Teste de seguranca multi-condominio contra o Supabase do .env (rode na raiz: npm run security-test).
// Cria 3 condominios de teste (sindico, proprietario, inquilino, contador), usa os tres ao mesmo tempo,
// tenta todo tipo de acesso indevido entre eles e apaga tudo no final.
// Requer no .env: PLATFORM_ADMIN_DOCUMENT e PLATFORM_ADMIN_PASSWORD (login do admin da plataforma).
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
async function call(path, { token, body, method = 'POST' } = {}) {
  // Cada area tem uma funcao unica na Vercel; os modulos ficam em api/_<area>/.
  const modulePath = path === 'health' || path.startsWith('admin/billing/') ? path : path.replace(/^([a-z]+)\//, '_$1/')
  const mod = await import(`../api/${modulePath}.js`)
  const res = await mod[method](new Request(`http://localhost/api/${path}`, {
    method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: method === 'GET' ? undefined : JSON.stringify(body || {}),
  }))
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
    for (const table of ['cobrancas', 'avisos', 'documentos', 'ocorrencias_predio']) await supabaseAdmin.from(table).delete().or(`condominium_id.eq.${id},condominio_id.eq.${id}`)
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
