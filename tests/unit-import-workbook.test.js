import test from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { crc32, deflateRawSync } from 'node:zlib'
import * as XLSX from 'xlsx'
import { UNIT_IMPORT_COLUMNS, UNIT_IMPORT_HEADERS } from '../src/lib/unitImportColumns.js'
import { inspectUnitImportArchive, readUnitImportWorkbook, UNIT_IMPORT_LIMITS, UnitImportFileError } from '../api/_lib/unitImportWorkbook.js'

const secret = () => randomBytes(16).toString('hex')
function workbook(rows, { headers = UNIT_IMPORT_HEADERS, sheetName = 'Unidades', edit } = {}) {
  const book = XLSX.utils.book_new()
  const sheet = XLSX.utils.aoa_to_sheet([headers, ...rows])
  edit?.(sheet)
  XLSX.utils.book_append_sheet(book, sheet, sheetName)
  return XLSX.write(book, { type: 'buffer', bookType: 'xlsx', compression: true })
}

function dataRow(values = {}) {
  return UNIT_IMPORT_COLUMNS.map(({ key }) => values[key] ?? '')
}

function rejectsFile(action, code = 'ARQUIVO_INVALIDO') {
  assert.throws(action, (error) => error instanceof UnitImportFileError && error.issues.some((item) => item.code === code))
}

// Independent ZIP fixtures make malformed-container tests reproducible without filesystem files.
function zip(entries) {
  const parts = []
  const directory = []
  let offset = 0
  for (const [name, data] of entries) {
    const path = Buffer.from(name)
    const content = Buffer.from(data)
    const compressed = deflateRawSync(content)
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50)
    local.writeUInt16LE(20, 4)
    local.writeUInt16LE(8, 8)
    local.writeUInt32LE(crc32(content), 14)
    local.writeUInt32LE(compressed.length, 18)
    local.writeUInt32LE(content.length, 22)
    local.writeUInt16LE(path.length, 26)
    parts.push(local, path, compressed)
    const central = Buffer.alloc(46)
    central.writeUInt32LE(0x02014b50)
    central.writeUInt16LE(20, 4)
    central.writeUInt16LE(20, 6)
    central.writeUInt16LE(8, 10)
    central.writeUInt32LE(crc32(content), 16)
    central.writeUInt32LE(compressed.length, 20)
    central.writeUInt32LE(content.length, 24)
    central.writeUInt16LE(path.length, 28)
    central.writeUInt32LE(offset, 42)
    directory.push(central, path)
    offset += local.length + path.length + compressed.length
  }
  const index = Buffer.concat(directory)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50)
  end.writeUInt16LE(entries.size ?? entries.length, 8)
  end.writeUInt16LE(entries.size ?? entries.length, 10)
  end.writeUInt32LE(index.length, 12)
  end.writeUInt32LE(offset, 16)
  return Buffer.concat([...parts, index, end])
}

test('colunas são identificadas pelo cabeçalho mesmo em outra ordem', () => {
  const password = secret()
  const entries = { numero: '001', situacao: 'Ocupado', ownerName: 'João d’Ávila', ownerPassword: password }
  const reversed = [...UNIT_IMPORT_COLUMNS].reverse()
  const buffer = workbook([reversed.map(({ key }) => entries[key] || '')], { headers: reversed.map(({ header }) => header) })
  const { rawRows } = readUnitImportWorkbook(buffer)
  assert.equal(rawRows[0].values.numero, '001')
  assert.equal(rawRows[0].values.ownerName, entries.ownerName)
  assert.equal(rawRows[0].values.ownerPassword, password)
})

test('senha permanece exata e identificadores textuais preservam zeros', () => {
  const password = `  ${secret()}  `
  const { rawRows } = readUnitImportWorkbook(workbook([dataRow({ numero: '001', ownerCpf: '01234567890', ownerWhatsapp: '085999990000', ownerPassword: password })]))
  assert.equal(rawRows[0].values.ownerPassword, password)
  assert.equal(rawRows[0].values.ownerCpf, '01234567890')
  assert.equal(rawRows[0].values.ownerWhatsapp, '085999990000')
})

test('formato numérico explícito 000 preserva apartamento com zero inicial', () => {
  const { rawRows } = readUnitImportWorkbook(workbook([dataRow({ numero: 1 })], { edit: (sheet) => { sheet.A2.z = '000' } }))
  assert.equal(rawRows[0].values.numero, '001')
})

test('não limita a planilha a 16 unidades e mantém numeração das linhas vazias', () => {
  const rows = Array.from({ length: 21 }, (_, index) => dataRow(index === 10 ? {} : { numero: String(index).padStart(3, '0') }))
  const { rawRows } = readUnitImportWorkbook(workbook(rows))
  assert.equal(rawRows.length, 21)
  assert.equal(rawRows[10].lineNumber, 12)
  assert.equal(rawRows[10].values.numero, '')
  assert.equal(rawRows[20].values.numero, '020')
})

test('cabeçalho ausente ou duplicado é erro explícito', () => {
  rejectsFile(() => readUnitImportWorkbook(workbook([], { headers: UNIT_IMPORT_HEADERS.slice(1) })), 'CABECALHO_AUSENTE')
  rejectsFile(() => readUnitImportWorkbook(workbook([], { headers: [...UNIT_IMPORT_HEADERS, 'Apartamento'] })), 'CABECALHO_DUPLICADO')
})

test('aba exata Unidades e formato real XLSX são obrigatórios', () => {
  rejectsFile(() => readUnitImportWorkbook(workbook([], { sheetName: 'Moradores' })))
  rejectsFile(() => readUnitImportWorkbook(Buffer.from('Apartamento,Nome\n001,João')))
  rejectsFile(() => readUnitImportWorkbook(workbook([]), { filename: 'arquivo.xls' }))
  rejectsFile(() => readUnitImportWorkbook(Buffer.alloc(0)))
})

test('limites de arquivo, colunas e linhas não causam truncamento silencioso', () => {
  rejectsFile(() => readUnitImportWorkbook(Buffer.alloc(UNIT_IMPORT_LIMITS.fileBytes + 1)))
  rejectsFile(() => readUnitImportWorkbook(workbook([], { edit: (sheet) => { sheet['!ref'] = 'A1:M5002' } })))
  rejectsFile(() => readUnitImportWorkbook(workbook([], { edit: (sheet) => { sheet['!ref'] = 'A1:CM2' } })))
})

test('fórmula com resultado em cache é rejeitada sem expor expressão ou senha', () => {
  const password = secret()
  const { rawRows } = readUnitImportWorkbook(workbook([dataRow({ numero: '001' })], { edit: (sheet) => {
    sheet.G2 = { t: 's', v: password, f: `CONCAT("${password}")` }
  } }))
  assert.equal(rawRows[0].values.ownerPassword, '')
  assert.equal(rawRows[0].errors[0].code, 'FORMULA_NAO_PERMITIDA')
  assert.equal(JSON.stringify(rawRows[0].errors).includes(password), false)
})

test('senha numérica e tipos incompatíveis recebem erro por célula', () => {
  const { rawRows } = readUnitImportWorkbook(workbook([dataRow({ numero: '001', ownerPassword: 123456, ownerCpf: true })]))
  assert.equal(rawRows[0].errors.length, 2)
  assert.ok(rawRows[0].errors.some((error) => error.code === 'SENHA_INVALIDA'))
})

test('conteúdo em coluna adicional e mesclagens não desaparecem da análise', () => {
  const { rawRows } = readUnitImportWorkbook(workbook([[...dataRow({ numero: '001' }), 'Dado adicional']], { headers: [...UNIT_IMPORT_HEADERS, 'Extra'] }))
  assert.equal(rawRows[0].errors[0].code, 'COLUNA_DESCONHECIDA')
  rejectsFile(() => readUnitImportWorkbook(workbook([dataRow({ numero: '001' })], { edit: (sheet) => { sheet['!merges'] = [{ s: { r: 1, c: 0 }, e: { r: 1, c: 1 } }] } })))
})

test('contêiner corrompido, entradas duplicadas e travessia de diretórios são rejeitados', () => {
  const good = workbook([])
  rejectsFile(() => readUnitImportWorkbook(good.subarray(0, good.length - 8)))
  const entries = inspectUnitImportArchive(good)
  const duplicated = [...entries, [...entries][0]]
  rejectsFile(() => readUnitImportWorkbook(zip(duplicated)))
  entries.set('../escape.xml', Buffer.from('<invalid/>'))
  rejectsFile(() => readUnitImportWorkbook(zip(entries)))
})

test('macros, entidades XML e relacionamentos externos são rejeitados', () => {
  for (const [name, content] of [
    ['xl/vbaProject.bin', 'macro'],
    ['customXml/item1.xml', '<!DOCTYPE a [<!ENTITY value "secret">]><a>&value;</a>'],
    ['xl/_rels/sheet1.xml.rels', '<Relationships><Relationship TargetMode="External" Target="https://example.test"/></Relationships>'],
  ]) {
    const entries = inspectUnitImportArchive(workbook([]))
    entries.set(name, Buffer.from(content))
    rejectsFile(() => readUnitImportWorkbook(zip(entries)))
  }
})

test('bomba de descompactação com tamanho declarado falso é limitada antes do leitor', () => {
  const entries = inspectUnitImportArchive(workbook([]))
  entries.set('customXml/large.xml', Buffer.alloc(UNIT_IMPORT_LIMITS.entryBytes + 1, 65))
  const buffer = zip(entries)
  // Lie about the uncompressed size in the central directory; actual inflate remains bounded.
  const directoryStart = buffer.readUInt32LE(buffer.length - 6)
  let cursor = directoryStart
  for (let index = 0; index < entries.size; index += 1) {
    const length = buffer.readUInt16LE(cursor + 28)
    if (buffer.subarray(cursor + 46, cursor + 46 + length).toString() === 'customXml/large.xml') buffer.writeUInt32LE(1, cursor + 24)
    cursor += 46 + length
  }
  rejectsFile(() => readUnitImportWorkbook(buffer))
})

test('erros de arquivo não refletem conteúdos sensíveis', () => {
  const password = secret()
  try {
    readUnitImportWorkbook(Buffer.from(password.repeat(3)))
    assert.fail('Arquivo inválido deveria ser recusado')
  } catch (error) {
    assert.ok(error instanceof UnitImportFileError)
    assert.equal(JSON.stringify(error).includes(password), false)
    assert.equal(error.message.includes(password), false)
  }
})
