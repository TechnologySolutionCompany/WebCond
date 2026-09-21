import { crc32, inflateRawSync } from 'node:zlib'
import * as XLSX from 'xlsx'
import { UNIT_IMPORT_COLUMNS } from '../../src/lib/unitImportColumns.js'

export const UNIT_IMPORT_LIMITS = Object.freeze({
  fileBytes: 2 * 1024 * 1024,
  expandedBytes: 24 * 1024 * 1024,
  entryBytes: 12 * 1024 * 1024,
  entries: 256,
  rows: 5000,
  columns: 64,
  cellCharacters: 1024,
})

const normalizeHeader = (value) => String(value ?? '').normalize('NFC').trim().toLowerCase()

function issue(code, field, message, guidance, lineNumber = 0) {
  return { lineNumber, unit: 'Não informada', field, code, message, guidance }
}

export class UnitImportFileError extends Error {
  constructor(issues) {
    super('Não foi possível analisar a planilha. Confira os problemas encontrados.')
    this.name = 'UnitImportFileError'
    this.issues = issues
  }
}

function invalidFile(message = 'O arquivo não é uma planilha .xlsx válida.', guidance = 'Baixe o modelo oficial, preencha-o e salve como .xlsx.') {
  return new UnitImportFileError([issue('ARQUIVO_INVALIDO', 'Arquivo', message, guidance)])
}

// Validate the ZIP before SheetJS decompresses it. Never extract entries to disk.
// Both declared and actual sizes are bounded, including forged ZIP size fields.
export function inspectUnitImportArchive(input) {
  const buffer = Buffer.isBuffer(input) ? input : Buffer.from(input)
  if (buffer.length < 22 || buffer.length > UNIT_IMPORT_LIMITS.fileBytes) {
    throw invalidFile('O arquivo está vazio ou excede o limite de 2 MB.')
  }
  try {
    if (buffer.readUInt32LE(0) !== 0x04034b50) throw invalidFile()
    let end = -1
    for (let offset = buffer.length - 22; offset >= Math.max(0, buffer.length - 65557); offset -= 1) {
      if (buffer.readUInt32LE(offset) === 0x06054b50 && offset + 22 + buffer.readUInt16LE(offset + 20) === buffer.length) {
        end = offset
        break
      }
    }
    if (end < 0) throw invalidFile()
    const entryCount = buffer.readUInt16LE(end + 10)
    const directorySize = buffer.readUInt32LE(end + 12)
    const directoryStart = buffer.readUInt32LE(end + 16)
    if (buffer.readUInt16LE(end + 4) || buffer.readUInt16LE(end + 6)
      || buffer.readUInt16LE(end + 8) !== entryCount
      || !entryCount || entryCount > UNIT_IMPORT_LIMITS.entries
      || directoryStart + directorySize !== end) throw invalidFile()

    const entries = new Map()
    const occupiedRanges = []
    let cursor = directoryStart
    let expandedBytes = 0
    for (let index = 0; index < entryCount; index += 1) {
      if (cursor + 46 > end || buffer.readUInt32LE(cursor) !== 0x02014b50) throw invalidFile()
      const flags = buffer.readUInt16LE(cursor + 8)
      const method = buffer.readUInt16LE(cursor + 10)
      const checksum = buffer.readUInt32LE(cursor + 16)
      const compressedSize = buffer.readUInt32LE(cursor + 20)
      const size = buffer.readUInt32LE(cursor + 24)
      const nameLength = buffer.readUInt16LE(cursor + 28)
      const extraLength = buffer.readUInt16LE(cursor + 30)
      const commentLength = buffer.readUInt16LE(cursor + 32)
      const localStart = buffer.readUInt32LE(cursor + 42)
      const next = cursor + 46 + nameLength + extraLength + commentLength
      if (next > end || !nameLength || flags & 1 || ![0, 8].includes(method)
        || size > UNIT_IMPORT_LIMITS.entryBytes || compressedSize > buffer.length
        || buffer.readUInt16LE(cursor + 34)) throw invalidFile()
      const name = buffer.subarray(cursor + 46, cursor + 46 + nameLength).toString('utf8')
      if (!/^[\w.[\]\-/]+$/.test(name) || name.startsWith('/') || name.split('/').includes('..') || entries.has(name)) throw invalidFile()
      if (/vbaProject|externalLinks|activeX|embeddings|connections\.xml|\.bin$/i.test(name)) {
        throw invalidFile('A planilha contém macros, conexões externas ou objetos não permitidos.', 'Copie apenas os valores para o modelo oficial e salve como .xlsx.')
      }
      if (localStart + 30 > directoryStart || buffer.readUInt32LE(localStart) !== 0x04034b50
        || buffer.readUInt16LE(localStart + 6) !== flags || buffer.readUInt16LE(localStart + 8) !== method) throw invalidFile()
      const localNameLength = buffer.readUInt16LE(localStart + 26)
      const localExtraLength = buffer.readUInt16LE(localStart + 28)
      const dataStart = localStart + 30 + localNameLength + localExtraLength
      const dataEnd = dataStart + compressedSize
      if (dataEnd > directoryStart || buffer.subarray(localStart + 30, localStart + 30 + localNameLength).toString('utf8') !== name
        || occupiedRanges.some(([start, finish]) => localStart < finish && dataEnd > start)) throw invalidFile()
      occupiedRanges.push([localStart, dataEnd])
      const compressed = buffer.subarray(dataStart, dataEnd)
      const content = method === 0 ? compressed : inflateRawSync(compressed, { maxOutputLength: UNIT_IMPORT_LIMITS.entryBytes })
      expandedBytes += content.length
      if (content.length !== size || crc32(content) !== checksum || expandedBytes > UNIT_IMPORT_LIMITS.expandedBytes) throw invalidFile()
      if (/\.(xml|rels)$/.test(name)) {
        const xml = content.toString('utf8')
        // eslint-disable-next-line no-control-regex -- byte nulo indica XML forjado
        if (/<!DOCTYPE|<!ENTITY|\u0000/i.test(xml)) throw invalidFile()
        if (/\.rels$/.test(name) && /TargetMode\s*=\s*["']External["']/i.test(xml)) {
          throw invalidFile('A planilha contém referências externas.', 'Remova links externos e copie apenas os valores para o modelo oficial.')
        }
      }
      entries.set(name, content)
      cursor = next
    }
    if (cursor !== end || !entries.has('[Content_Types].xml') || !entries.has('xl/workbook.xml') || !entries.has('xl/_rels/workbook.xml.rels')) throw invalidFile()
    if (!entries.get('[Content_Types].xml').toString('utf8').includes('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml')) throw invalidFile()
    return entries
  } catch (error) {
    if (error instanceof UnitImportFileError) throw error
    // Never include parser exceptions: they can contain cell contents/passwords.
    throw invalidFile()
  }
}

function cellValue(cell, column, lineNumber) {
  const errors = []
  const fail = (message, guidance, code = 'ARQUIVO_INVALIDO') => {
    errors.push(issue(code, column.header, message, guidance, lineNumber))
    return { value: '', errors }
  }
  if (!cell) return { value: '', errors }
  if (cell.f !== undefined || cell.F !== undefined) return fail('Fórmulas não são permitidas na importação.', 'Substitua a fórmula pelo valor em formato de texto.', 'FORMULA_NAO_PERMITIDA')
  if (cell.v == null || cell.t === 'z') return { value: '', errors }
  if (cell.t === 'e' || cell.t === 'b' || cell.t === 'd') return fail('O tipo da célula não é aceito neste campo.', 'Preencha o campo como texto no modelo oficial.')
  let value
  if (cell.t === 'n') {
    if (column.key.endsWith('Password')) return fail('A senha inicial precisa estar em uma célula de texto.', 'Formate a célula como Texto e digite novamente a senha inicial.', 'SENHA_INVALIDA')
    if (!Number.isSafeInteger(cell.v) || cell.v < 0 || (cell.z && XLSX.SSF.is_date(cell.z))) return fail('O valor numérico da célula não é aceito.', 'Formate a célula como Texto e digite o valor completo.')
    // Keep explicit zero-padding formats, but never invent zeros already lost by Excel.
    value = cell.w && /^[\d\s().+\-/]+$/.test(cell.w) ? cell.w : String(cell.v)
  } else if (cell.t === 's' || cell.t === 'str' || typeof cell.v === 'string') {
    value = String(cell.v)
  } else {
    return fail('O tipo da célula não é aceito neste campo.', 'Preencha o campo como texto no modelo oficial.')
  }
  if (value.length > UNIT_IMPORT_LIMITS.cellCharacters) return fail('O conteúdo da célula excede o tamanho permitido.', 'Use no máximo 1.024 caracteres por célula.')
  return { value, errors }
}

export function readUnitImportWorkbook(input, { filename = 'unidades.xlsx' } = {}) {
  if (typeof filename !== 'string' || !/\.xlsx$/i.test(filename)) throw invalidFile('Selecione um arquivo com extensão .xlsx.')
  inspectUnitImportArchive(input)
  let workbook
  try {
    workbook = XLSX.read(input, {
      type: 'buffer', cellFormula: true, cellHTML: false, cellNF: true,
      cellText: true, cellDates: true, sheetStubs: true, sheets: 'Unidades', WTF: true,
    })
  } catch {
    throw invalidFile()
  }
  const sheet = workbook.Sheets.Unidades
  if (!sheet || !sheet['!ref']) throw invalidFile('A aba Unidades não foi encontrada ou está vazia.')
  if (sheet['!merges']?.length) throw invalidFile('A aba Unidades contém células mescladas.', 'Desfaça as mesclagens ou use o modelo oficial sem alterar sua estrutura.')
  let lastRow = 0
  let lastColumn = 0
  try {
    const range = XLSX.utils.decode_range(sheet['!ref'])
    lastRow = range.e.r
    lastColumn = range.e.c
    // Also inspect actual addresses: a forged dimension must not hide any rows.
    for (const address of Object.keys(sheet)) {
      if (address.startsWith('!')) continue
      const cell = XLSX.utils.decode_cell(address)
      lastRow = Math.max(lastRow, cell.r)
      lastColumn = Math.max(lastColumn, cell.c)
    }
  } catch {
    throw invalidFile()
  }
  if (lastRow > UNIT_IMPORT_LIMITS.rows || lastColumn >= UNIT_IMPORT_LIMITS.columns) {
    throw invalidFile('A planilha excede o limite de 5.000 linhas de dados ou 64 colunas.', 'Divida os registros em arquivos menores usando o modelo oficial.')
  }
  const knownHeaders = new Map(UNIT_IMPORT_COLUMNS.map((column) => [normalizeHeader(column.header), column]))
  const columnMap = new Map()
  const found = new Set()
  const headerIssues = []
  for (let index = 0; index <= lastColumn; index += 1) {
    const cell = sheet[XLSX.utils.encode_cell({ r: 0, c: index })]
    if (cell?.f !== undefined || cell?.F !== undefined) {
      headerIssues.push(issue('ARQUIVO_INVALIDO', 'Cabeçalho', 'Fórmulas não são permitidas no cabeçalho.', 'Restaure os cabeçalhos do modelo oficial.', 1))
      continue
    }
    const column = knownHeaders.get(normalizeHeader(cell?.v))
    if (!column) continue
    if (found.has(column.key)) headerIssues.push(issue('CABECALHO_DUPLICADO', column.header, 'O cabeçalho aparece mais de uma vez.', 'Mantenha somente uma coluna com esse cabeçalho.', 1))
    found.add(column.key)
    columnMap.set(index, column)
  }
  for (const column of UNIT_IMPORT_COLUMNS) {
    if (!found.has(column.key)) headerIssues.push(issue('CABECALHO_AUSENTE', column.header, 'Um cabeçalho obrigatório não foi encontrado.', 'Restaure este cabeçalho exatamente como no modelo oficial.', 1))
  }
  if (headerIssues.length) throw new UnitImportFileError(headerIssues)

  const rawRows = []
  for (let row = 1; row <= lastRow; row += 1) {
    const values = {}
    const errors = []
    for (let col = 0; col <= lastColumn; col += 1) {
      const cell = sheet[XLSX.utils.encode_cell({ r: row, c: col })]
      const column = columnMap.get(col)
      if (!column) {
        if (cell && (cell.f !== undefined || (cell.v != null && String(cell.v).trim()))) errors.push(issue('COLUNA_DESCONHECIDA', 'Coluna adicional', 'Existem dados em uma coluna não reconhecida.', 'Use apenas os 13 cabeçalhos do modelo oficial.', row + 1))
        continue
      }
      const result = cellValue(cell, column, row + 1)
      values[column.key] = result.value
      errors.push(...result.errors)
    }
    rawRows.push({ lineNumber: row + 1, values, errors })
  }
  return { rawRows, fileErrors: [] }
}
