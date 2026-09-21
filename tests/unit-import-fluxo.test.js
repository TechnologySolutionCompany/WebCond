// Fluxo completo dos modulos do servidor: planilha real preenchida -> leitura -> validacao ->
// resposta publica. Sem banco: a gravacao tem testes proprios em unit-import-persist.test.js.
import assert from 'node:assert/strict'
import test from 'node:test'
import * as XLSX from 'xlsx'
import { readUnitImportWorkbook } from '../api/_lib/unitImportWorkbook.js'
import { validateImportRows } from '../api/_lib/unitImportValidation.js'
import { buildImportResponse } from '../api/_lib/unitImportRequest.js'
import { UNIT_IMPORT_HEADERS } from '../src/lib/unitImportColumns.js'

const SENHA_PROPRIETARIO = 'Proprietario@2026'
const SENHA_MORADOR = 'Morador@2026'

// Monta um arquivo .xlsx de verdade, como o sindico salvaria a partir do modelo oficial.
function buildFile(rows, { headers = UNIT_IMPORT_HEADERS } = {}) {
  const sheet = XLSX.utils.aoa_to_sheet([headers, ...rows])
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, sheet, 'Unidades')
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' })
}

const CENARIOS = [
  // Ocupado com o proprietario morando
  ['001', 'Ocupado', 'Ana Márcia D\'Ávila', '529.982.247-25', '(81) 99724-3724', '', SENHA_PROPRIETARIO, 'Sim', '', '', '', '', ''],
  // Ocupado com outro morador
  ['002', 'Ocupado', 'Bruno Sá', '', '+55 81 98888-7777', 'bruno@exemplo.com', SENHA_PROPRIETARIO, 'Não', 'Clara Nunes', '', '81 97777-6666', '', SENHA_MORADOR],
  // Alugado
  ['010B', 'Alugado', 'Davi Rocha', '', '81996665555', '', SENHA_PROPRIETARIO, 'Não', 'Elena Braga', '', '81995554444', 'elena@exemplo.com', SENHA_MORADOR],
  // Desocupado
  ['003', 'Desocupado', 'Fábio Lins', '', '', '', SENHA_PROPRIETARIO, '', '', '', '', '', ''],
]

test('a planilha oficial preenchida percorre leitura, validação e resposta sem erros', () => {
  const { rawRows: rows } = readUnitImportWorkbook(buildFile(CENARIOS), { filename: 'unidades.xlsx' })
  const validation = validateImportRows(rows, { existingUnits: [], expectedUnitCount: 4 })

  assert.equal(validation.summary.validUnits, 4)
  assert.equal(validation.summary.invalidUnits, 0)
  assert.equal(validation.errors.length, 0)
  assert.deepEqual(validation.preview.map((row) => row.numero), ['001', '002', '010B', '003'])
  assert.deepEqual(validation.preview.map((row) => row.situacao), ['ocupada', 'ocupada', 'alugada', 'desocupada'])
  // Ocupado com outro morador guarda a segunda pessoa; ocupado com o dono morando, nao.
  assert.equal(validation.preview[0].resident, null)
  assert.equal(validation.preview[1].resident.nome, 'Clara Nunes')
  // Zero à esquerda preservado e WhatsApp normalizado a partir de máscara e +55.
  assert.equal(validation.rows[0].numero, '001')
  assert.equal(validation.rows[1].owner.whatsapp, '81988887777')
  assert.equal(validation.rows[0].owner.cpf, '52998224725')
})

test('colunas são reconhecidas pelo nome, mesmo fora da ordem do modelo', () => {
  const ordem = [8, 0, 1, 2, 4, 6, 3, 5, 7, 9, 10, 11, 12]
  const headers = ordem.map((index) => UNIT_IMPORT_HEADERS[index])
  const linha = ordem.map((index) => CENARIOS[0][index])
  const { rawRows: rows } = readUnitImportWorkbook(buildFile([linha], { headers }), { filename: 'unidades.xlsx' })
  const validation = validateImportRows(rows, { existingUnits: [] })

  assert.equal(validation.summary.validUnits, 1)
  assert.equal(validation.rows[0].numero, '001')
  assert.equal(validation.rows[0].situacao, 'ocupada')
})

test('unidade já cadastrada e unidade esquecida aparecem no resumo', () => {
  const { rawRows: rows } = readUnitImportWorkbook(buildFile(CENARIOS), { filename: 'unidades.xlsx' })
  const validation = validateImportRows(rows, {
    existingUnits: [{ numero: '001' }],
    expectedUnits: ['001', '002', '003', '010B', '004'],
  })

  const jaCadastrada = validation.errors.filter((issue) => issue.code === 'UNIDADE_JA_CADASTRADA')
  assert.equal(jaCadastrada.length, 1)
  assert.equal(jaCadastrada[0].unit, '001')
  assert.deepEqual(validation.missing.units, ['004'])
  assert.equal(validation.summary.missingUnits, 1)
})

test('a resposta enviada ao navegador não carrega senha alguma', () => {
  const { rawRows: rows } = readUnitImportWorkbook(buildFile(CENARIOS), { filename: 'unidades.xlsx' })
  const validation = validateImportRows(rows, { existingUnits: [] })
  const response = buildImportResponse({ validation, capacity: 10 }, { batchId: 'lote-1' })
  const serialized = JSON.stringify(response)

  for (const senha of [SENHA_PROPRIETARIO, SENHA_MORADOR]) {
    assert.ok(!serialized.includes(senha), 'a senha inicial vazou na resposta da API')
  }
  assert.ok(!serialized.toLowerCase().includes('password'))
  assert.equal(response.summary.capacity, 10)
  assert.equal(response.batchId, 'lote-1')
  // As senhas continuam disponíveis apenas no objeto interno usado para gravar.
  assert.equal(validation.rows[0].owner.password, SENHA_PROPRIETARIO)
})

test('arquivo sem os cabeçalhos do modelo é recusado antes de qualquer leitura de dados', () => {
  const invalido = buildFile([['001', 'Ocupado']], { headers: ['Unidade', 'Estado'] })
  assert.throws(() => readUnitImportWorkbook(invalido, { filename: 'unidades.xlsx' }), (error) => {
    assert.ok(error.issues.some((issue) => issue.code === 'CABECALHO_AUSENTE' || issue.code === 'ARQUIVO_INVALIDO'))
    return true
  })
})

test('arquivo que não é .xlsx é recusado pela extensão', () => {
  assert.throws(() => readUnitImportWorkbook(buildFile(CENARIOS), { filename: 'unidades.xls' }), /planilha|\.xlsx/i)
})
