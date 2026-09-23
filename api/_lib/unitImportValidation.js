import { normalizeUnitNumber } from '../../src/lib/units.js'
import { UNIT_IMPORT_COLUMNS } from '../../src/lib/unitImportColumns.js'
// Mesmas regras de CPF, WhatsApp e e-mail usadas pelo auto-cadastro por link.
import { isCpfValid, isEmailValid, isWhatsappValid, normalizeCpfDigits, normalizeWhatsapp } from './personValidation.js'
// Lista local de senha obvia. A consulta a base de vazamentos fica nas telas de cadastro uma
// a uma: num lote de planilha, uma consulta por linha seguraria a importacao inteira.
import { senhaMuitoComum } from './senhaVazada.js'

const HEADERS = Object.fromEntries(UNIT_IMPORT_COLUMNS.map(({ key, header }) => [key, header]))
const STATUS_VALUES = { ocupado: 'ocupada', alugado: 'alugada', desocupado: 'desocupada' }
const RESIDENT_ROLES = new Set(['morador', 'resident'])
function text(value) {
  return typeof value === 'string' || typeof value === 'number' ? String(value) : ''
}

function commonText(value) {
  return text(value).trim()
}

function normalizeEmail(value) {
  return commonText(value).toLowerCase()
}

function normalizeCpf(value) {
  return normalizeCpfDigits(commonText(value))
}

function normalizePerson(values, prefix) {
  return {
    nome: commonText(values[`${prefix}Name`]),
    cpf: normalizeCpf(values[`${prefix}Cpf`]),
    whatsapp: normalizeWhatsapp(values[`${prefix}Whatsapp`]),
    email: normalizeEmail(values[`${prefix}Email`]),
    // Senha nao passa pelos normalizadores de campos comuns, nem por trim().
    password: text(values[`${prefix}Password`]),
    existingProfileId: null,
  }
}

function safePerson(person) {
  if (!person) return null
  return {
    nome: person.nome,
    cpf: person.cpf,
    whatsapp: person.whatsapp,
    email: person.email,
    existingProfileId: person.existingProfileId,
  }
}

function unitNumber(value) {
  return normalizeUnitNumber(typeof value === 'object' && value !== null ? value.numero : value)
}

function missingUnits(rows, { existingUnits, expectedUnitCount, expectedUnits }) {
  const included = new Set(existingUnits.map(unitNumber).filter(Boolean))
  for (const row of rows) {
    if (row.numero && row.numero.length <= 20) included.add(row.numero)
  }
  if (Array.isArray(expectedUnits)) {
    const expected = [...new Set(expectedUnits.map(unitNumber).filter(Boolean))]
    const units = expected.filter((numero) => !included.has(numero))
    return { kind: 'known', units, count: units.length }
  }
  const expectedCount = Number(expectedUnitCount)
  if (Number.isSafeInteger(expectedCount) && expectedCount > 0) {
    return { kind: 'count', units: [], count: Math.max(0, expectedCount - included.size) }
  }
  return { kind: 'unknown', units: [], count: 0 }
}

/**
 * Validacao pura do lado do servidor. rawRows contem { lineNumber, values, errors? }.
 * `rows` e EXCLUSIVAMENTE INTERNO e contem senhas para uma futura confirmacao.
 * Somente preview, errors, summary e missing podem integrar a resposta ao navegador.
 * existingUnits/expectedUnits sao previamente limitados ao condominio pelo chamador.
 */
export function validateImportRows(rawRows, {
  existingUnits = [],
  expectedUnitCount = 0,
  expectedUnits = null,
  existingPeople = [],
  condominiumId = null,
} = {}) {
  if (!Array.isArray(rawRows)) throw new TypeError('As linhas da importação devem ser uma lista.')

  const rows = []
  const errors = []
  const rowIssues = new Map()
  const unitRows = new Map()
  const peopleEntries = []
  const existingNumbers = new Set(existingUnits.map(unitNumber).filter(Boolean))
  let emptyRows = 0

  const issue = (row, key, code, message, guidance) => {
    const entry = {
      lineNumber: row.lineNumber,
      unit: row.numero || 'Não informada',
      field: HEADERS[key] || 'Linha',
      code,
      message,
      guidance,
    }
    const list = rowIssues.get(row) || []
    if (list.some((item) => item.field === entry.field && item.code === code)) return
    list.push(entry)
    rowIssues.set(row, list)
    errors.push(entry)
  }

  const validatePerson = (row, values, prefix, { whatsappRequired }) => {
    const person = row[prefix === 'owner' ? 'owner' : 'resident']
    if (!person.nome) {
      issue(row, `${prefix}Name`, 'NOME_OBRIGATORIO', 'O nome é obrigatório para esta pessoa.', 'Preencha o nome completo da pessoa indicada.')
    } else if (!/\p{L}/u.test(person.nome)) {
      issue(row, `${prefix}Name`, 'NOME_INVALIDO', 'O nome deve conter letras.', 'Informe o nome da pessoa; acentos, apóstrofos e hífens são aceitos.')
    }

    const rawCpf = commonText(values[`${prefix}Cpf`])
    if (rawCpf && !isCpfValid(rawCpf)) {
      issue(row, `${prefix}Cpf`, 'CPF_INVALIDO', 'O CPF informado é inválido.', 'Corrija os 11 dígitos e os verificadores, ou deixe o CPF opcional vazio.')
    }

    const rawWhatsapp = commonText(values[`${prefix}Whatsapp`])
    if ((!rawWhatsapp && whatsappRequired) || (rawWhatsapp && !isWhatsappValid(rawWhatsapp, person.whatsapp))) {
      issue(row, `${prefix}Whatsapp`, 'TELEFONE_INVALIDO', rawWhatsapp ? 'O WhatsApp deve ser um celular brasileiro válido com DDD.' : 'O WhatsApp é obrigatório para esta pessoa.', 'Informe um único celular com DDD e nove dígitos, começando por 9. Máscara e prefixo +55 são aceitos.')
    }

    if (person.email && !isEmailValid(person.email)) {
      issue(row, `${prefix}Email`, 'EMAIL_INVALIDO', 'O email informado tem formato inválido.', 'Corrija o endereço de email ou deixe o campo opcional vazio.')
    }

    // O cadastro atual cria acesso tambem para o proprietario de unidade alugada.
    if (person.password.length < 6) {
      issue(row, `${prefix}Password`, 'SENHA_INVALIDA', 'A senha inicial deve ter pelo menos 6 caracteres.', 'Informe uma senha inicial com no mínimo 6 caracteres. Espaços digitados são preservados.')
    } else if (senhaMuitoComum(person.password)) {
      issue(row, `${prefix}Password`, 'SENHA_FRACA', 'A senha inicial é fácil de adivinhar.', 'Troque por uma senha que não seja sequência de números nem palavra comum (ex.: 123456, senha123).')
    }

    const identifiersValid = (!rawCpf || isCpfValid(rawCpf)) && (!person.email || isEmailValid(person.email))
    if (identifiersValid) peopleEntries.push({ row, prefix, person })
  }

  for (let index = 0; index < rawRows.length; index += 1) {
    const raw = rawRows[index] || {}
    const values = raw.values && typeof raw.values === 'object' ? raw.values : {}
    const cellErrors = Array.isArray(raw.errors) ? raw.errors : []
    const hasValues = UNIT_IMPORT_COLUMNS.some(({ key }) => (
      key.endsWith('Password') ? text(values[key]) !== '' : commonText(values[key]) !== ''
    ))
    if (!hasValues && cellErrors.length === 0) {
      emptyRows += 1
      continue
    }

    const originalNumber = commonText(values.numero).replace(/\s+/g, ' ')
    // Nao trunca entradas invalidas: preserva a unidade no erro para a correcao.
    const numero = originalNumber.length > 20 ? originalNumber.toUpperCase() : normalizeUnitNumber(originalNumber)
    const statusText = commonText(values.situacao).toLowerCase()
    const ownerResidentText = commonText(values.ownerIsResident).normalize('NFC').toLowerCase()
    const row = {
      lineNumber: Number.isSafeInteger(raw.lineNumber) && raw.lineNumber > 0 ? raw.lineNumber : index + 2,
      numero,
      situacao: STATUS_VALUES[statusText] || '',
      ownerIsResident: ownerResidentText === 'sim' ? true : ownerResidentText === 'não' ? false : null,
      owner: normalizePerson(values, 'owner'),
      resident: null,
      valid: false,
    }
    rows.push(row)

    // Mensagens vindas do leitor nao sao refletidas: apenas o codigo/campo conhecido.
    for (const cellError of cellErrors) {
      const key = UNIT_IMPORT_COLUMNS.find((column) => column.header === cellError.field || column.key === cellError.field)?.key
      const formula = cellError.code === 'FORMULA_NAO_PERMITIDA'
      issue(row, key, formula ? 'FORMULA_NAO_PERMITIDA' : 'ARQUIVO_INVALIDO',
        formula ? 'A célula contém uma fórmula, que não é permitida na importação.' : 'A célula contém um valor que não pode ser importado.',
        formula ? 'Substitua a fórmula por um valor de texto e envie novamente.' : 'Use texto comum nesta célula e envie novamente.')
    }

    if (!numero) {
      issue(row, 'numero', 'UNIDADE_OBRIGATORIA', 'A linha possui dados, mas o apartamento não foi informado.', 'Preencha o apartamento nesta linha ou deixe a linha inteira vazia.')
    } else if (originalNumber.length > 20) {
      issue(row, 'numero', 'UNIDADE_INVALIDA', 'O apartamento excede o limite de 20 caracteres.', 'Use o identificador da unidade com até 20 caracteres, preservando os zeros iniciais.')
    } else {
      if (!unitRows.has(numero)) unitRows.set(numero, [])
      unitRows.get(numero).push(row)
      if (existingNumbers.has(numero)) {
        issue(row, 'numero', 'UNIDADE_JA_CADASTRADA', 'A unidade já está cadastrada neste condomínio.', 'Retire esta linha da importação. O cadastro existente não será sobrescrito.')
      }
    }

    if (!row.situacao) {
      issue(row, 'situacao', 'SITUACAO_INVALIDA', 'A situação informada é inválida.', 'Selecione somente Ocupado, Alugado ou Desocupado.')
    }
    if (ownerResidentText && !['sim', 'não'].includes(ownerResidentText)) {
      issue(row, 'ownerIsResident', 'VINCULO_INCOMPATIVEL', 'A indicação de proprietário morador é inválida.', 'Use Sim ou Não; deixe vazio somente em unidade Desocupado.')
    }

    const occupied = row.situacao === 'ocupada'
    const rented = row.situacao === 'alugada'
    const vacant = row.situacao === 'desocupada'
    if (occupied && row.ownerIsResident === null) {
      issue(row, 'ownerIsResident', 'VINCULO_INCOMPATIVEL', 'Informe quem mora na unidade ocupada.', 'Selecione Sim para proprietário morador, ou Não para outro morador.')
    }
    if (rented && row.ownerIsResident !== false) {
      issue(row, 'ownerIsResident', 'VINCULO_INCOMPATIVEL', 'Uma unidade alugada deve ter inquilino diferente do proprietário.', 'Selecione Não e preencha os dados do inquilino.')
    }
    if (vacant && ownerResidentText) {
      issue(row, 'ownerIsResident', 'VINCULO_INCOMPATIVEL', 'Uma unidade desocupada não possui morador.', 'Deixe vazia a indicação de proprietário morador.')
    }

    validatePerson(row, values, 'owner', { whatsappRequired: occupied || rented })

    const needsResident = rented || (occupied && row.ownerIsResident === false)
    if (needsResident) {
      row.resident = normalizePerson(values, 'resident')
      validatePerson(row, values, 'resident', { whatsappRequired: true })
    } else {
      for (const { key } of UNIT_IMPORT_COLUMNS.filter((column) => column.key.startsWith('resident'))) {
        const filled = key.endsWith('Password') ? text(values[key]) !== '' : commonText(values[key]) !== ''
        if (filled) {
          issue(row, key, 'VINCULO_INCOMPATIVEL', 'Os dados de morador ou inquilino não se aplicam a esta linha.', 'Deixe os campos de morador vazios quando o proprietário mora na unidade ou ela está desocupada.')
        }
      }
    }
  }

  for (const duplicates of unitRows.values()) {
    if (duplicates.length < 2) continue
    const lines = duplicates.map((row) => row.lineNumber).join(', ')
    for (const row of duplicates) {
      issue(row, 'numero', 'UNIDADE_DUPLICADA_NO_ARQUIVO', `A unidade aparece mais de uma vez nas linhas ${lines}.`, 'Mantenha somente uma linha para cada apartamento e analise novamente.')
    }
  }

  const personConflict = (entry, key, message) => issue(entry.row, `${entry.prefix}${key}`, 'CONFLITO_DE_USUARIO', message,
    'Confira os identificadores da pessoa e o cadastro existente. Nenhuma conta ou senha existente será alterada.')

  for (const entry of peopleEntries) {
    const { person } = entry
    const matches = existingPeople.filter((profile) => (
      (person.cpf && normalizeCpf(profile.cpf) === person.cpf)
      || (person.email && normalizeEmail(profile.email) === person.email)
    ))
    const unique = [...new Map(matches.map((profile) => [profile.id, profile])).values()]
    if (!unique.length) continue
    const profile = unique[0]
    const otherCondominium = condominiumId && (profile.condominium_id || profile.condominio_id) !== condominiumId
    const incompatibleCpf = person.cpf && normalizeCpf(profile.cpf) && person.cpf !== normalizeCpf(profile.cpf)
    if (unique.length > 1 || !profile.id || profile.ativo === false || !RESIDENT_ROLES.has(String(profile.role || '').toLowerCase()) || otherCondominium || incompatibleCpf) {
      personConflict(entry, person.cpf ? 'Cpf' : 'Email', 'Os identificadores informados não podem ser vinculados com segurança a uma única conta ativa deste condomínio.')
      continue
    }
    person.existingProfileId = profile.id
  }

  // CPF/email sao identificadores; nome e telefone nunca unem pessoas.
  // Dados contraditorios para o mesmo identificador atingem todas as linhas envolvidas.
  for (const identifier of ['cpf', 'email']) {
    const groups = new Map()
    for (const entry of peopleEntries) {
      const value = entry.person[identifier]
      if (!value) continue
      if (!groups.has(value)) groups.set(value, [])
      groups.get(value).push(entry)
    }
    for (const entries of groups.values()) {
      const otherKey = identifier === 'cpf' ? 'email' : 'cpf'
      const otherValues = new Set(entries.map(({ person }) => person[otherKey]).filter(Boolean))
      if (otherValues.size > 1) {
        for (const entry of entries) personConflict(entry, identifier === 'cpf' ? 'Cpf' : 'Email', 'O mesmo identificador foi informado com dados de identificação divergentes em outras linhas.')
      }
    }
  }

  for (const row of rows) {
    if (!row.resident) continue
    const sameCpf = row.owner.cpf && row.owner.cpf === row.resident.cpf
    const sameEmail = row.owner.email && row.owner.email === row.resident.email
    const sameAccount = row.owner.existingProfileId && row.owner.existingProfileId === row.resident.existingProfileId
    if (sameCpf || sameEmail || sameAccount) {
      issue(row, 'ownerIsResident', 'VINCULO_INCOMPATIVEL', 'Proprietário e morador ou inquilino foram identificados como a mesma pessoa.', 'Em Ocupado, selecione Sim e deixe os campos do morador vazios. Em Alugado, informe um inquilino diferente.')
    }
  }

  for (const row of rows) row.valid = !rowIssues.has(row)
  const missing = missingUnits(rows, { existingUnits, expectedUnitCount, expectedUnits })
  const validUnits = rows.filter((row) => row.valid).length
  return {
    rows,
    preview: rows.map((row) => ({
      lineNumber: row.lineNumber,
      numero: row.numero,
      situacao: row.situacao,
      ownerIsResident: row.ownerIsResident,
      owner: safePerson(row.owner),
      resident: safePerson(row.resident),
      valid: row.valid,
    })),
    errors,
    summary: {
      totalRows: rawRows.length,
      validUnits,
      invalidUnits: rows.length - validUnits,
      emptyRows,
      totalErrors: errors.length,
      missingUnits: missing.count,
    },
    missing,
  }
}
