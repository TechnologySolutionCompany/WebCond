// Teste de ponta a ponta da importacao de unidades por planilha contra o Supabase do .env (npm run e2e-importacao).
// Cria um condominio de teste, importa uma planilha com todos os cenarios e apaga tudo no final.
process.loadEnvFile('.env')
const XLSX = await import('xlsx')
const { supabaseAdmin } = await import('../api/_lib/supabaseAdmin.js')
const { UNIT_IMPORT_HEADERS } = await import('../src/lib/unitImportColumns.js')

const results = []
const check = (name, ok, extra = '') => { results.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' :: ' + extra : ''}`) }

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
  const modulePath = path.replace(/^([a-z]+)\//, '_$1/')
  const mod = await import(`../api/${modulePath}.js`)
  const res = await mod[method](new Request(`http://localhost/api/${path}`, {
    method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: method === 'GET' ? undefined : JSON.stringify(body || {}),
  }))
  let data = null
  try { data = await res.json() } catch { data = null }
  return { status: res.status, data }
}

const SENHA = 'Teste@12345'
const SENHA_MORADOR = 'Morador@54321'
const cpfDono1 = cpf()
const condoDoc = cnpj()
let condominiumId = null

// Uma linha por cenario + erros proposital + duplicidade + linha vazia + linha parcial.
const LINHAS = [
  ['001', 'Ocupado', 'Ana Proprietária Silva', cpfDono1, '(81) 99724-3724', '', SENHA, 'Sim', '', '', '', '', ''],
  ['002', 'ocupado ', 'Bruno Sá', '', '+55 81 98888-7777', '', SENHA, 'Não', 'Clara Nunes', '', '81977776666', '', SENHA_MORADOR],
  ['010B', 'Alugado', 'Davi Rocha', '', '81996665555', 'davi@exemplo.com', SENHA, 'Não', 'Elena Braga', '', '81995554444', '', SENHA_MORADOR],
  ['003', 'Desocupado', 'Fábio Lins', '', '', '', SENHA, '', '', '', '', '', ''],
  ['004', 'Ocupado', '', '111.111.111-11', '8130001000', '', '123', 'Sim', '', '', '', '', ''],
  ['005', 'Ocupado', 'Duplicada A', '', '81999998888', '', SENHA, 'Sim', '', '', '', '', ''],
  ['005', 'Ocupado', 'Duplicada B', '', '81999996666', '', SENHA, 'Sim', '', '', '', '', ''],
  ['', '', '', '', '', '', '', '', '', '', '', '', ''],
  ['', 'Ocupado', 'Sem apartamento', '', '81999997777', '', SENHA, 'Sim', '', '', '', '', ''],
]

function planilha(linhas) {
  const sheet = XLSX.utils.aoa_to_sheet([UNIT_IMPORT_HEADERS, ...linhas])
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, sheet, 'Unidades')
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }).toString('base64')
}

try {
  const P = (await call('auth/login-cnpj', { body: { cnpj: process.env.PLATFORM_ADMIN_DOCUMENT, password: process.env.PLATFORM_ADMIN_PASSWORD } })).data?.session?.access_token
  const reg = await call('platform/condominiums/register', { body: {
    name: 'E2E Importacao', cnpj: condoDoc, whatsapp: '11999990000', unit_count: 7,
    address_details: { zip_code: '01001000', street: 'Rua Teste', number: '1', district: 'Centro', city: 'Sao Paulo', state: 'SP' },
    syndic_name: 'Sindico Importacao', syndic_cpf: cpf(), syndic_email: `e2e-import-${Date.now()}@example.com`, password: SENHA,
  } })
  condominiumId = reg.data?.condominiumId
  await call('platform/condominiums/update', { token: P, body: { condominiumId, action: 'approve', plan: 'trial' } })
  const S = (await call('auth/login-cnpj', { body: { cnpj: condoDoc, password: SENHA } })).data?.session?.access_token
  check('condominio de teste criado', Boolean(condominiumId && S))

  const file = planilha(LINHAS)

  // ---------------- Etapa 1: analise ----------------
  const analise = await call('admin/units/import-analyze', { token: S, body: { filename: 'unidades.xlsx', file } })
  if (analise.status !== 200) {
    check('analise da planilha', false, `status ${analise.status}: ${analise.data?.error}`)
    throw new Error(analise.data?.error || 'analise falhou')
  }
  const { summary, preview, errors, batchId } = analise.data
  check('analise: 4 unidades validas', summary.validUnits === 4, JSON.stringify(summary))
  check('analise: 4 linhas com erro (004, as duas da 005 repetida, linha sem apartamento)', summary.invalidUnits === 4, JSON.stringify(summary))
  check('analise: 1 linha vazia ignorada', summary.emptyRows === 1)
  check('analise: dois erros na mesma unidade 004', errors.filter((e) => e.unit === '004').length >= 2)
  check('analise: duplicidade aponta as duas linhas', errors.some((e) => e.code === 'UNIDADE_DUPLICADA_NO_ARQUIVO'))
  check('analise: linha parcial sem apartamento', errors.some((e) => e.code === 'UNIDADE_OBRIGATORIA'))
  check('analise: unidades faltando calculadas pelo contratado', summary.missingUnits === 1, `faltando ${summary.missingUnits}`)
  check('analise: nenhuma senha na resposta', !JSON.stringify(analise.data).includes(SENHA) && !JSON.stringify(analise.data).includes(SENHA_MORADOR))
  check('analise: zero a esquerda preservado', preview.some((row) => row.numero === '001'))
  check('analise NAO grava unidade', ((await supabaseAdmin.from('unidades').select('id').eq('condominium_id', condominiumId)).data || []).length === 0)

  // ---------------- Etapa 2: confirmacao ----------------
  const confirmacao = await call('admin/units/import-confirm', { token: S, body: { batchId, filename: 'unidades.xlsx', file } })
  check('confirmacao respondeu', confirmacao.status === 200, `status ${confirmacao.status}: ${confirmacao.data?.error || ''}`)
  const resultado = confirmacao.data || {}
  check('confirmacao: 4 unidades cadastradas', resultado.criadas === 4, `criadas ${resultado.criadas}`)
  check('confirmacao: nenhuma senha na resposta', !JSON.stringify(resultado).includes(SENHA) && !JSON.stringify(resultado).includes(SENHA_MORADOR))
  check('confirmacao: avisa quem ficou sem CPF', resultado.semAcesso === 5, `sem acesso ${resultado.semAcesso}`)

  // ---------------- O que ficou no banco ----------------
  const { data: unidades } = await supabaseAdmin.from('unidades').select('id, numero, situacao, responsavel_financeiro').eq('condominium_id', condominiumId)
  check('banco: 4 unidades gravadas', (unidades || []).length === 4, (unidades || []).map((u) => u.numero).sort().join(', '))
  check('banco: relatorio confere com o banco', resultado.criadas === (unidades || []).length)
  const porNumero = Object.fromEntries((unidades || []).map((u) => [u.numero, u]))
  check('banco: 001 ocupada', porNumero['001']?.situacao === 'ocupada')
  check('banco: 010B alugada com zero a esquerda', porNumero['010B']?.situacao === 'alugada')
  check('banco: 003 desocupada', porNumero['003']?.situacao === 'desocupada')

  const { data: vinculos } = await supabaseAdmin.from('unidade_vinculos').select('vinculo, unidade_id, profiles(nome, cpf, email)')
  const doCondo = (vinculos || []).filter((v) => (unidades || []).some((u) => u.id === v.unidade_id))
  const porUnidade = (numero) => doCondo.filter((v) => v.unidade_id === porNumero[numero]?.id)
  check('banco: 001 so tem proprietario (dono mora)', porUnidade('001').length === 1 && porUnidade('001')[0].vinculo === 'proprietario')
  check('banco: 002 tem proprietario e morador', porUnidade('002').length === 2 && porUnidade('002').some((v) => v.vinculo === 'inquilino'))
  check('banco: 010B tem proprietario e inquilino', porUnidade('010B').length === 2)
  check('banco: 003 so tem proprietario', porUnidade('003').length === 1)
  check('banco: pessoas sem CPF receberam identificador unico', new Set(doCondo.map((v) => v.profiles?.email)).size === doCondo.length)

  const { data: perfis } = await supabaseAdmin.from('profiles').select('*').eq('condominium_id', condominiumId)
  check('banco: nenhuma senha em texto no perfil', !JSON.stringify(perfis).includes(SENHA) && !JSON.stringify(perfis).includes(SENHA_MORADOR))
  check('banco: proprietaria com CPF pode entrar', (await call('auth/login-cpf', { body: { cpf: cpfDono1, password: SENHA } })).status === 200)

  const { data: lote } = await supabaseAdmin.from('unidade_importacoes').select('status, unidades_criadas, unidades_com_erro, arquivo').eq('id', batchId).maybeSingle()
  check('banco: lote concluido e com os totais', lote?.status === 'concluido' && lote?.unidades_criadas === 4)
  const { data: itens } = await supabaseAdmin.from('unidade_importacao_itens').select('numero, status').eq('importacao_id', batchId)
  check('banco: item por unidade gravada', (itens || []).filter((i) => i.status === 'criada').length === 4)

  // ---------------- Reenvio: nao duplica ----------------
  const reenvio = await call('admin/units/import-confirm', { token: S, body: { batchId, filename: 'unidades.xlsx', file } })
  check('reenvio avisa que o lote ja foi confirmado', reenvio.data?.jaConfirmado === true)
  const { data: depois } = await supabaseAdmin.from('unidades').select('id').eq('condominium_id', condominiumId)
  check('reenvio nao duplicou unidades', (depois || []).length === 4)

  // ---------------- Arquivo trocado depois da analise ----------------
  const outro = planilha([['999', 'Desocupado', 'Outra Planilha', '', '', '', SENHA, '', '', '', '', '', '']])
  const trocado = await call('admin/units/import-confirm', { token: S, body: { batchId, filename: 'unidades.xlsx', file: outro } })
  check('arquivo diferente do analisado e recusado', trocado.status === 409, `status ${trocado.status}`)

  // ---------------- Segunda importacao: unidade ja cadastrada ----------------
  const analise2 = await call('admin/units/import-analyze', { token: S, body: { filename: 'unidades.xlsx', file } })
  check('nova analise aponta unidades ja cadastradas', (analise2.data?.errors || []).filter((e) => e.code === 'UNIDADE_JA_CADASTRADA').length >= 4)
} catch (error) {
  check('execucao sem excecao', false, error.message)
} finally {
  if (condominiumId) {
    const { data: people } = await supabaseAdmin.from('profiles').select('id').or(`condominium_id.eq.${condominiumId},condominio_id.eq.${condominiumId}`)
    const { data: lotes } = await supabaseAdmin.from('unidade_importacoes').select('id').eq('condominium_id', condominiumId)
    for (const lote of lotes || []) await supabaseAdmin.from('unidade_importacao_itens').delete().eq('importacao_id', lote.id)
    await supabaseAdmin.from('unidade_importacoes').delete().eq('condominium_id', condominiumId)
    for (const table of ['cobrancas', 'avisos', 'documentos', 'ocorrencias_predio']) await supabaseAdmin.from(table).delete().or(`condominium_id.eq.${condominiumId},condominio_id.eq.${condominiumId}`)
    await supabaseAdmin.from('unidades').delete().eq('condominium_id', condominiumId)
    for (const person of people || []) { await supabaseAdmin.from('profiles').delete().eq('id', person.id); await supabaseAdmin.auth.admin.deleteUser(person.id) }
    const { error } = await supabaseAdmin.from('condominiums').delete().eq('id', condominiumId)
    console.log(error ? `LIMPEZA FALHOU: ${error.message}` : 'limpeza ok')
  }
  const failed = results.filter((r) => !r.ok)
  console.log(`\n${results.length - failed.length}/${results.length} ok`)
  if (failed.length) console.log('FALHAS:\n' + failed.map((r) => ` - ${r.name}`).join('\n'))
}
