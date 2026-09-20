// Planilha de moradores para exportar/importar entre condominios (recadastro por ampliacao de unidades).
// A biblioteca xlsx so e carregada quando o administrador usa esta funcao.
const COLUMNS = [
  ['nome', 'Nome'],
  ['cpf', 'CPF'],
  ['email', 'E-mail'],
  ['whatsapp', 'WhatsApp'],
  ['apartamento', 'Apartamento'],
  ['perfil', 'Perfil'],
  ['vinculo', 'Vinculo'],
  ['data_entrada', 'Data de entrada'],
]

const HEADER_TO_KEY = Object.fromEntries(COLUMNS.map(([key, label]) => [normalizeHeader(label), key]))

function normalizeHeader(value = '') {
  return String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase()
}

function safeFileName(value = '') {
  return String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'condominio'
}

export async function downloadResidentsWorkbook({ condominium, residents }) {
  const XLSX = await import('xlsx')
  const rows = residents.map((resident) => Object.fromEntries(COLUMNS.map(([key, label]) => [label, resident[key] ?? ''])))
  const workbook = XLSX.utils.book_new()

  const residentsSheet = XLSX.utils.json_to_sheet(rows, { header: COLUMNS.map(([, label]) => label) })
  XLSX.utils.book_append_sheet(workbook, residentsSheet, 'Moradores')

  const infoSheet = XLSX.utils.json_to_sheet([
    { Campo: 'Condominio', Valor: condominium.name },
    { Campo: 'CPF/CNPJ', Valor: condominium.cnpj },
    { Campo: 'Endereco', Valor: condominium.address },
    { Campo: 'CEP', Valor: condominium.zip_code },
    { Campo: 'Unidades', Valor: condominium.unit_count },
    { Campo: 'Exportado em', Valor: new Date().toLocaleString('pt-BR') },
  ])
  XLSX.utils.book_append_sheet(workbook, infoSheet, 'Condominio')

  XLSX.writeFile(workbook, `webcond-${safeFileName(condominium.name)}-cadastros.xlsx`)
}

// Le a aba "Moradores" (ou a primeira aba) de um .xls/.xlsx e devolve linhas com as chaves da API.
export async function readResidentsWorkbook(file) {
  const XLSX = await import('xlsx')
  const workbook = XLSX.read(await file.arrayBuffer(), { cellDates: true })
  const sheetName = workbook.SheetNames.find((name) => normalizeHeader(name) === 'moradores') || workbook.SheetNames[0]
  if (!sheetName) throw new Error('A planilha esta vazia.')

  const rawRows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: '', raw: false, dateNF: 'yyyy-mm-dd' })
  const rows = rawRows
    .map((raw) => {
      const row = {}
      for (const [header, value] of Object.entries(raw)) {
        const key = HEADER_TO_KEY[normalizeHeader(header)]
        if (key) row[key] = String(value ?? '').trim()
      }
      return row
    })
    .filter((row) => row.nome || row.cpf)

  if (!rows.length) {
    throw new Error('Nenhum cadastro encontrado. Use a planilha gerada em "Exportar dados" (colunas Nome, CPF, Apartamento...).')
  }

  return rows
}

export async function downloadImportReport(results) {
  const XLSX = await import('xlsx')
  const workbook = XLSX.utils.book_new()
  const sheet = XLSX.utils.json_to_sheet(results.map((item) => ({
    Linha: item.linha,
    Nome: item.nome,
    CPF: item.cpf,
    Apartamento: item.apartamento,
    Resultado: item.status,
    Detalhe: item.detalhe,
    'Senha temporaria': item.senha_temporaria || '',
  })))
  XLSX.utils.book_append_sheet(workbook, sheet, 'Resultado')
  XLSX.writeFile(workbook, `webcond-importacao-${new Date().toISOString().slice(0, 10)}.xlsx`)
}
