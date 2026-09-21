// Gera o modelo oficial de importacao de unidades usando a biblioteca de planilhas do proprio
// projeto (SheetJS). O arquivo resultante e versionado em public/templates e servido pelo botao
// "Baixar modelo". Nao faz parte do runtime: rode apenas quando o modelo mudar.
//
//   npm run gerar-modelo-unidades
//
// Listas de selecao nao sao escritas pelo SheetJS, entao o pacote .xlsx e reaberto e a planilha
// recebe <dataValidations> e o congelamento do cabecalho antes de ser fechada de novo.
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { crc32, deflateRawSync, inflateRawSync } from 'node:zlib'
import * as XLSX from 'xlsx'
import { UNIT_IMPORT_HEADERS } from '../src/lib/unitImportColumns.js'

const projectRoot = fileURLToPath(new URL('../', import.meta.url))
const outputPath = path.join(projectRoot, 'public/templates/webcond-importacao-unidades-v1.xlsx')

const EMPTY_ROWS = 16
const LAST_ROW = EMPTY_ROWS + 1
const LAST_EXCEL_ROW = 1048576
// Apartamento, CPF, WhatsApp e senha: texto, para nao perder zeros a esquerda.
const TEXT_COLUMNS = ['A', 'D', 'E', 'G', 'J', 'K', 'M']

const INSTRUCTIONS = [
  ['WebCond — importação de unidades'],
  ['Modelo oficial v1. Preencha a aba Unidades e envie o arquivo em Unidades > Importar planilha.'],
  [''],
  ['Como preencher'],
  ['Uma linha representa uma unidade. Não altere os cabeçalhos nem a ordem das colunas.'],
  ['Deixe linhas totalmente vazias quando não tiver mais unidades: elas são ignoradas.'],
  ['CPF e email são opcionais. Nome e WhatsApp seguem a regra de cada situação abaixo.'],
  [''],
  ['Situações'],
  ['Ocupado: proprietário morador — preencha o proprietário, selecione Sim e deixe os campos de morador vazios.'],
  ['Ocupado: outro morador — selecione Não e preencha proprietário e morador.'],
  ['Alugado — selecione Não, preencha o proprietário e o inquilino.'],
  ['Desocupado — preencha o proprietário, deixe vazios a coluna Proprietário é o morador? e os campos de morador.'],
  [''],
  ['Contatos'],
  ['Informe o WhatsApp com DDD; o prefixo +55 é aceito.'],
  ['O sistema guarda um WhatsApp por pessoa: informe apenas um número por campo, sem separar por ponto e vírgula.'],
  [''],
  ['Senhas'],
  ['A senha inicial deve ter pelo menos 6 caracteres, a mesma regra do cadastro individual.'],
  ['Espaços digitados na senha são preservados exatamente como estão.'],
  ['Contas existentes mantêm a senha atual: a importação nunca troca a senha de quem já acessa o sistema.'],
  ['Esta planilha contém senhas legíveis antes da importação. Guarde e compartilhe o arquivo com cuidado e apague-o depois.'],
  [''],
  ['Cuidados'],
  ['Não use fórmulas: células com fórmula são recusadas na análise.'],
  ['Apartamentos repetidos no arquivo e unidades já cadastradas são apontados antes de qualquer gravação.'],
  ['A análise mostra os problemas por linha; corrija a planilha e envie novamente quantas vezes precisar.'],
]

function buildWorkbook() {
  const units = {}
  const columns = UNIT_IMPORT_HEADERS.length

  UNIT_IMPORT_HEADERS.forEach((header, index) => {
    units[XLSX.utils.encode_cell({ r: 0, c: index })] = { t: 's', v: header }
  })

  // Celulas vazias existem de verdade para carregar o formato de texto e as listas.
  for (let row = 1; row <= EMPTY_ROWS; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const address = XLSX.utils.encode_cell({ r: row, c: column })
      const isText = TEXT_COLUMNS.includes(XLSX.utils.encode_col(column))
      units[address] = isText ? { t: 's', v: '', z: '@' } : { t: 's', v: '' }
    }
  }

  units['!ref'] = `A1:${XLSX.utils.encode_col(columns - 1)}${LAST_ROW}`
  units['!cols'] = UNIT_IMPORT_HEADERS.map((header) => ({ wch: Math.max(18, Math.min(38, header.length + 4)) }))
  units['!rows'] = [{ hpt: 64 }]
  units['!autofilter'] = { ref: `A1:${XLSX.utils.encode_col(columns - 1)}${LAST_ROW}` }

  const instructions = XLSX.utils.aoa_to_sheet(INSTRUCTIONS)
  instructions['!cols'] = [{ wch: 118 }]

  return {
    SheetNames: ['Unidades', 'Instruções'],
    Sheets: { Unidades: units, 'Instruções': instructions },
  }
}

// ---------------------------------------------------------------------------
// Pacote .xlsx (ZIP): leitura e escrita minimas, sem dependencia extra.
// ---------------------------------------------------------------------------
function readZip(buffer) {
  let end = buffer.length - 22
  while (end >= 0 && buffer.readUInt32LE(end) !== 0x06054b50) end -= 1
  if (end < 0) throw new Error('Pacote .xlsx inválido gerado pela biblioteca de planilhas.')

  const total = buffer.readUInt16LE(end + 10)
  let offset = buffer.readUInt32LE(end + 16)
  const entries = []
  for (let index = 0; index < total; index += 1) {
    const method = buffer.readUInt16LE(offset + 10)
    const compressedSize = buffer.readUInt32LE(offset + 20)
    const nameSize = buffer.readUInt16LE(offset + 28)
    const extraSize = buffer.readUInt16LE(offset + 30)
    const commentSize = buffer.readUInt16LE(offset + 32)
    const localOffset = buffer.readUInt32LE(offset + 42)
    const name = buffer.toString('utf8', offset + 46, offset + 46 + nameSize)
    const start = localOffset + 30 + buffer.readUInt16LE(localOffset + 26) + buffer.readUInt16LE(localOffset + 28)
    const raw = buffer.subarray(start, start + compressedSize)
    entries.push({ name, data: method === 8 ? inflateRawSync(raw) : Buffer.from(raw) })
    offset += 46 + nameSize + extraSize + commentSize
  }
  return entries
}

function writeZip(entries) {
  const locals = []
  const central = []
  let offset = 0

  for (const entry of entries) {
    const name = Buffer.from(entry.name, 'utf8')
    const compressed = deflateRawSync(entry.data, { level: 9 })
    const checksum = crc32(entry.data)

    const local = Buffer.alloc(30 + name.length)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt16LE(0x0800, 6) // nomes em UTF-8
    local.writeUInt16LE(8, 8) // deflate
    local.writeUInt32LE(checksum, 14)
    local.writeUInt32LE(compressed.length, 18)
    local.writeUInt32LE(entry.data.length, 22)
    local.writeUInt16LE(name.length, 26)
    name.copy(local, 30)
    locals.push(local, compressed)

    const header = Buffer.alloc(46 + name.length)
    header.writeUInt32LE(0x02014b50, 0)
    header.writeUInt16LE(20, 4)
    header.writeUInt16LE(20, 6)
    header.writeUInt16LE(0x0800, 8)
    header.writeUInt16LE(8, 10)
    header.writeUInt32LE(checksum, 16)
    header.writeUInt32LE(compressed.length, 20)
    header.writeUInt32LE(entry.data.length, 24)
    header.writeUInt16LE(name.length, 28)
    header.writeUInt32LE(offset, 42)
    name.copy(header, 46)
    central.push(header)

    offset += local.length + compressed.length
  }

  const directory = Buffer.concat(central)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(entries.length, 8)
  end.writeUInt16LE(entries.length, 10)
  end.writeUInt32LE(directory.length, 12)
  end.writeUInt32LE(offset, 16)
  return Buffer.concat([...locals, directory, end])
}

// ---------------------------------------------------------------------------
// Recursos que o SheetJS nao escreve: congelamento do cabecalho e listas de selecao.
// ---------------------------------------------------------------------------
const FROZEN_HEADER = '<sheetViews><sheetView tabSelected="1" workbookViewId="0">'
  + '<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>'
  + '<selection pane="bottomLeft" activeCell="A2" sqref="A2"/>'
  + '</sheetView></sheetViews>'

function dataValidation(sqref, options, prompt) {
  return `<dataValidation type="list" allowBlank="1" showInputMessage="1" showErrorMessage="1"`
    + ` errorTitle="Valor inválido" error="${prompt}" sqref="${sqref}">`
    + `<formula1>"${options}"</formula1></dataValidation>`
}

function patchUnitsSheet(xml) {
  let sheet = xml.replace(/<sheetViews>[\s\S]*?<\/sheetViews>/, '')
  sheet = sheet.replace(/(<(?:dimension|sheetFormatPr)\b[^>]*\/>)(?![\s\S]*<(?:dimension|sheetFormatPr)\b)/, `$1${FROZEN_HEADER}`)
  if (!sheet.includes('<pane ')) sheet = sheet.replace('<sheetData>', `${FROZEN_HEADER}<sheetData>`)

  const validations = '<dataValidations count="2">'
    + dataValidation(`B2:B${LAST_EXCEL_ROW}`, 'Ocupado,Alugado,Desocupado', 'Selecione Ocupado, Alugado ou Desocupado.')
    + dataValidation(`H2:H${LAST_EXCEL_ROW}`, 'Sim,Não', 'Selecione Sim ou Não; deixe vazio em unidade Desocupado.')
    + '</dataValidations>'

  // A ordem dos elementos importa para o Excel: dataValidations vem depois de autoFilter.
  if (sheet.includes('<pageMargins')) return sheet.replace('<pageMargins', `${validations}<pageMargins`)
  return sheet.replace('</worksheet>', `${validations}</worksheet>`)
}

const buffer = XLSX.write(buildWorkbook(), { type: 'buffer', bookType: 'xlsx', cellStyles: true, compression: true })
const entries = readZip(buffer).map((entry) => (
  entry.name === 'xl/worksheets/sheet1.xml'
    ? { name: entry.name, data: Buffer.from(patchUnitsSheet(entry.data.toString('utf8')), 'utf8') }
    : entry
))

await mkdir(path.dirname(outputPath), { recursive: true })
await writeFile(outputPath, writeZip(entries))
console.log(`Modelo salvo em public/templates/${path.basename(outputPath)} (${(entries.length)} partes)`)
