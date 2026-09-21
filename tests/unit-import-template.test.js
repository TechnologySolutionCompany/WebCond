import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { inflateRawSync } from 'node:zlib'
import test from 'node:test'
import * as XLSX from 'xlsx'
import { UNIT_IMPORT_HEADERS } from '../src/lib/unitImportColumns.js'

const bytes = readFileSync(new URL('../public/templates/webcond-importacao-unidades-v1.xlsx', import.meta.url))
const workbook = XLSX.read(bytes, { type: 'buffer', cellNF: true, cellStyles: true, sheetStubs: true })
const units = workbook.Sheets.Unidades

// Verifica os recursos nativos que o leitor SheetJS não expõe (painéis e listas).
function readXmlParts(buffer) {
  let end = buffer.length - 22
  while (end >= Math.max(0, buffer.length - 65557) && buffer.readUInt32LE(end) !== 0x06054b50) end -= 1
  assert.ok(end >= 0, 'Pacote ZIP do modelo inválido')
  const count = buffer.readUInt16LE(end + 10)
  let offset = buffer.readUInt32LE(end + 16)
  const parts = new Map()
  for (let index = 0; index < count; index += 1) {
    assert.equal(buffer.readUInt32LE(offset), 0x02014b50)
    const method = buffer.readUInt16LE(offset + 10)
    const compressedSize = buffer.readUInt32LE(offset + 20)
    const nameSize = buffer.readUInt16LE(offset + 28)
    const extraSize = buffer.readUInt16LE(offset + 30)
    const commentSize = buffer.readUInt16LE(offset + 32)
    const localOffset = buffer.readUInt32LE(offset + 42)
    const name = buffer.toString('utf8', offset + 46, offset + 46 + nameSize)
    const start = localOffset + 30 + buffer.readUInt16LE(localOffset + 26) + buffer.readUInt16LE(localOffset + 28)
    const compressed = buffer.subarray(start, start + compressedSize)
    assert.ok(method === 0 || method === 8, 'Compressão ZIP inesperada')
    const content = method === 8 ? inflateRawSync(compressed, { maxOutputLength: 10 * 1024 * 1024 }) : compressed
    parts.set(name, content.toString('utf8'))
    offset += 46 + nameSize + extraSize + commentSize
  }
  return parts
}

const parts = readXmlParts(bytes)
const unitXml = parts.get('xl/worksheets/sheet1.xml')

test('modelo oficial contém as abas e os 13 cabeçalhos exatos', () => {
  assert.deepEqual(workbook.SheetNames, ['Unidades', 'Instruções'])
  assert.deepEqual(UNIT_IMPORT_HEADERS, [
    'Apartamento',
    'Situação',
    'Proprietário — nome completo',
    'Proprietário — CPF',
    'Proprietário — WhatsApp',
    'Proprietário — email',
    'Proprietário — senha inicial',
    'Proprietário é o morador?',
    'Morador / inquilino — nome completo',
    'Morador / inquilino — CPF',
    'Morador / inquilino — WhatsApp',
    'Morador / inquilino — email',
    'Morador / inquilino — senha inicial',
  ])
  assert.deepEqual(XLSX.utils.sheet_to_json(units, { header: 1, range: 'A1:M1' })[0], UNIT_IMPORT_HEADERS)
})

test('modelo reserva exatamente 16 linhas vazias sem dados ou senhas de exemplo', () => {
  assert.equal(units['!ref'], 'A1:M17')
  const rows = XLSX.utils.sheet_to_json(units, { header: 1, defval: null, blankrows: true, range: 'A2:M17' })
  assert.equal(rows.length, 16)
  assert.ok(rows.every((row) => row.length === 13 && row.every((value) => value === null || value === '')))
  assert.ok(bytes.length < 500 * 1024, 'O modelo vazio deve permanecer pequeno')
})

test('apartamento, CPF, WhatsApp e senha mantêm formato de texto em todas as linhas iniciais', () => {
  for (const column of ['A', 'D', 'E', 'G', 'J', 'K', 'M']) {
    for (let row = 2; row <= 17; row += 1) {
      assert.equal(units[`${column}${row}`]?.z, '@', `Formato de texto ausente em ${column}${row}`)
    }
  }
})

test('listas de seleção alcançam novas linhas até o limite de linhas do Excel', () => {
  const validations = [...unitXml.matchAll(/<dataValidation\b[^>]*>[\s\S]*?<\/dataValidation>/g)].map((match) => match[0])
  assert.equal(validations.length, 2)
  const status = validations.find((xml) => xml.includes('sqref="B2:B1048576"'))
  const ownerResident = validations.find((xml) => xml.includes('sqref="H2:H1048576"'))
  assert.match(status, /type="list"/)
  assert.match(status, /Ocupado,Alugado,Desocupado/)
  assert.match(ownerResident, /type="list"/)
  assert.match(ownerResident, /Sim,Não/)
})

test('cabeçalho congelado, filtros, larguras e altura do cabeçalho são recursos do Excel', () => {
  assert.match(unitXml, /<pane\b[^>]*ySplit="1"[^>]*>/)
  assert.match(unitXml, /<pane\b[^>]*state="frozen"[^>]*>/)
  assert.ok([...parts.values()].some((xml) => /<autoFilter\b[^>]*ref="A1:M17"/.test(xml)))
  assert.ok((units['!cols'] || []).length >= 13)
  assert.ok(units['!cols'].every((column) => column.width >= 16))
  assert.ok(units['!rows'][0].hpt >= 60)
})

test('instruções cobrem os quatro cenários, opcionais, política de senha e cuidado com o arquivo', () => {
  const rows = XLSX.utils.sheet_to_json(workbook.Sheets['Instruções'], { header: 1, defval: '' })
  const text = rows.flat().join('\n')
  for (const expected of [
    'Uma linha representa uma unidade',
    'Não altere os cabeçalhos',
    'CPF e email são opcionais',
    'Ocupado: proprietário morador',
    'Ocupado: outro morador',
    'Alugado',
    'Desocupado',
    'DDD',
    '+55',
    'um WhatsApp por pessoa',
    'pelo menos 6 caracteres',
    'senhas legíveis',
    'Contas existentes mantêm a senha atual',
    'Não use fórmulas',
  ]) assert.ok(text.includes(expected), `Instrução ausente: ${expected}`)
})

test('modelo não inclui fórmulas executáveis, macros ou referências externas', () => {
  for (const [name, xml] of parts) {
    assert.doesNotMatch(name, /vbaProject|externalLinks/i)
    if (name.startsWith('xl/worksheets/')) assert.doesNotMatch(xml, /<f(?:\s|>)/)
    if (name.endsWith('.rels')) assert.doesNotMatch(xml, /TargetMode="External"/)
  }
})
